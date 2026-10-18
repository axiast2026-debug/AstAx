import { describe, expect, it } from "vitest";
import { ManualClock } from "../clock/manual-clock.js";
import { FakeEInvoicing, type EInvoicingPort } from "../e-invoicing/e-invoicing.js";
import {
  EInvoicingError,
  InvalidSdiWebhookError,
  OPENAPI_SDI_URLS,
  OpenapiEInvoicing,
  statusOfNotifications,
} from "../e-invoicing/openapi-e-invoicing.js";
import type { FatturaPaInput } from "../xml/fatturapa.js";

// Phase 8: what every SDI provider must do, then Openapi SDI with a simulated server.
const invoice: FatturaPaInput = {
  progressive: "P2600001",
  documentType: "TD01",
  number: "P-2026-000001",
  date: "2026-11-16",
  supplier: {
    vatNumber: "12345678901",
    name: "AstAx Srl",
    address: { street: "Via degli Esempi 1", postalCode: "20121", city: "Milano", province: "MI" },
  },
  customer: {
    fiscalCode: "NREGLI85A41H501X",
    name: "Giulia Neri",
    givenName: "Giulia",
    surname: "Neri",
    address: { street: "Via Inventata 3", postalCode: "00184", city: "Roma", province: "RM" },
  },
  recipientCode: "0000000",
  lines: [{ description: "Compenso di intermediazione", quantity: 1, unitCents: 3500 }],
  vatNature: "N4",
  legalReference: "Operazione esente IVA ai sensi dell'art. 10, comma 1, n. 9, DPR 633/1972",
  stampDutyCents: 0,
  stampDutyCharged: false,
  totalCents: 3500,
};

function eInvoicingContract(make: () => EInvoicingPort) {
  it("contract: a valid invoice is sent with its checked XML and can be followed", async () => {
    const provider = make();
    const sent = await provider.send(invoice);
    expect(sent.sdiRef).not.toBe("");
    expect(sent.xml).toContain("FatturaElettronica");
    expect(["SENT", "DELIVERED", "REJECTED"]).toContain(sent.status);
    expect(["SENT", "DELIVERED", "REJECTED"]).toContain(await provider.getStatus(sent.sdiRef));
  });
}

/** A stand-in for sdi.openapi.it: records requests, answers like the documented API. */
function simulatedOpenapi(options: { failFirst?: number } = {}) {
  const requests: { method: string; url: string; headers: Headers; body: string }[] = [];
  let failures = options.failFirst ?? 0;
  const fetchStub = (async (url: string | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    requests.push({
      method: init?.method ?? "GET",
      url: String(url),
      headers,
      body: String(init?.body ?? ""),
    });
    if (failures > 0) {
      failures -= 1;
      return new Response("busy", { status: 503 });
    }
    if (init?.method === "POST") {
      return Response.json({ data: { uuid: "inv-0001" }, success: true, message: "", error: null });
    }
    return Response.json({
      data: { uuid: "inv-0001", notifications: [{ type: "RC" }] },
      success: true,
    });
  }) as typeof fetch;
  return { requests, fetch: fetchStub };
}

describe("e-invoicing contract — fake and Openapi SDI (simulated)", () => {
  eInvoicingContract(() => new FakeEInvoicing(new ManualClock("2026-11-16T09:00:00Z")));
  eInvoicingContract(
    () =>
      new OpenapiEInvoicing({
        baseUrl: OPENAPI_SDI_URLS.sandbox,
        token: "test-token",
        fetch: simulatedOpenapi().fetch,
      }),
  );

  it("Openapi: the XML goes once as application/xml with the bearer token; a busy SDI is not sent twice", async () => {
    const busy = simulatedOpenapi({ failFirst: 1 });
    const once = new OpenapiEInvoicing({
      baseUrl: OPENAPI_SDI_URLS.sandbox,
      token: "test-token",
      fetch: busy.fetch,
      retryDelaysMs: [1],
    });
    await expect(once.send(invoice)).rejects.toBeInstanceOf(EInvoicingError);
    expect(busy.requests).toHaveLength(1);
    const server = simulatedOpenapi();
    const sdi = new OpenapiEInvoicing({
      baseUrl: OPENAPI_SDI_URLS.sandbox,
      token: "test-token",
      fetch: server.fetch,
      retryDelaysMs: [1],
    });
    const sent = await sdi.send(invoice);
    expect(sent).toMatchObject({ sdiRef: "inv-0001", status: "SENT" });
    expect(server.requests).toHaveLength(1);
    const post = server.requests[0];
    expect(post?.url).toBe("https://test.sdi.openapi.it/invoices");
    expect(post?.headers.get("content-type")).toBe("application/xml");
    expect(post?.headers.get("authorization")).toBe("Bearer test-token");
    expect(post?.body).toContain("<Numero>P-2026-000001</Numero>");
    expect(await sdi.getStatus("inv-0001")).toBe("DELIVERED");
  });

  it("Openapi: a permanent refusal is not retried and carries no content", async () => {
    const refusing = (async () => new Response("bad", { status: 422 })) as typeof fetch;
    const sdi = new OpenapiEInvoicing({
      baseUrl: OPENAPI_SDI_URLS.sandbox,
      token: "t",
      fetch: refusing,
      retryDelaysMs: [1, 1],
    });
    const error = await sdi.send(invoice).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EInvoicingError);
    expect((error as EInvoicingError).status).toBe(422);
  });

  it("SDI receipts: NS rejects; RC, MC and AT deliver; the webhook needs the agreed header", () => {
    expect(statusOfNotifications(["NS"])).toBe("REJECTED");
    expect(statusOfNotifications(["MC"])).toBe("DELIVERED");
    expect(statusOfNotifications([])).toBe("SENT");
    const sdi = new OpenapiEInvoicing({
      baseUrl: OPENAPI_SDI_URLS.sandbox,
      token: "t",
      webhookSecret: "segreto-di-prova-123",
    });
    const body = JSON.stringify({
      event: "customer-notification",
      data: { notification: { invoice_uuid: "inv-0001", type: "RC" } },
    });
    expect(sdi.parseWebhook({ authorization: "segreto-di-prova-123" }, body)).toEqual({
      sdiRef: "inv-0001",
      status: "DELIVERED",
    });
    expect(() => sdi.parseWebhook({ authorization: "altro" }, body)).toThrow(
      InvalidSdiWebhookError,
    );
    // Same length in characters, longer in bytes: refused, not a crash.
    expect(() => sdi.parseWebhook({ authorization: "segreto-di-prova-12è" }, body)).toThrow(
      InvalidSdiWebhookError,
    );
  });
});

const env = process.env;
describe.skipIf(!env.CONTRACT_OPENAPI_SDI_TOKEN)("e-invoicing contract — Openapi sandbox", () => {
  eInvoicingContract(
    () =>
      new OpenapiEInvoicing({
        baseUrl: OPENAPI_SDI_URLS.sandbox,
        token: env.CONTRACT_OPENAPI_SDI_TOKEN ?? "",
      }),
  );
});
