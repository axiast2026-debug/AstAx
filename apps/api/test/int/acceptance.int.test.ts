import { FakeAiExplainer, type AiExplainerPort } from "@astax/adapters/ai-explainer";
import type { FakePaymentsProvider } from "@astax/adapters/payments";
import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import {
  decodePDFRawStream,
  PDFArray,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  type PDFObject,
} from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closedRound } from "./auction-helpers.js";
import { acceptAllLegal, membershipId, orgId, startHarness, type Harness } from "./fixtures.js";
import { PAYMENTS } from "../../src/infra/tokens.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 5: the private customer's acceptance, with the offers of S01.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
let customer: Who;
let requestId: string;
let offers: string[];
const EMAIL = "privato.accettazione@example.test";

/** The fake explainer, or (proposal D) a model text with a figure it was never given. */
let badText = false;
const explainer: AiExplainerPort = {
  explain: async (input) =>
    badText
      ? {
          text: "Scegli Compagnia Beta: costa solo 99,00 €.",
          model: "fake-bad",
          promptVersion: "x",
        }
      : new FakeAiExplainer().explain(input),
};

/** The decoded drawing of every page: the standard fonts write WinAnsi bytes as hex. */
async function pdfText(body: ArrayBuffer): Promise<string> {
  const pdf = await PDFDocument.load(new Uint8Array(body));
  const resolve = (o: PDFObject | undefined) => (o instanceof PDFRef ? pdf.context.lookup(o) : o);
  const out: string[] = [];
  for (const page of pdf.getPages()) {
    const contents = resolve(page.node.get(PDFName.of("Contents")));
    const streams = contents instanceof PDFArray ? contents.asArray().map(resolve) : [contents];
    for (const stream of streams) {
      if (stream instanceof PDFRawStream) {
        out.push(Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1"));
      }
    }
  }
  return out.join("\n");
}
const hex = (text: string) => Buffer.from(text, "latin1").toString("hex").toUpperCase();
/** WinAnsi: «€» is 0x80, «—» is 0x97, the no-break space 0xA0. */
const EURO = "A080";
const EM_DASH = "97";

const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);
const refOf = (url: string) => url.split("/").at(-1) ?? "";
const toIssue = async () =>
  (await (
    await h.call("/agency/to-issue", {
      token: await h.tokenFor("agenzia-uno-owner"),
      context: membershipId("agenzia-uno-owner", "agenzia-uno"),
    })
  ).json()) as { code: string; email: string | null }[];

interface Row {
  id: string;
  company: string;
  annualGrossPremiumCents: number;
  guaranteed: boolean;
  feeCents: number;
  feeWithAiCents: number | null;
  block: string | null;
}

beforeAll(async () => {
  h = await startHarness({ aiExplainer: explainer });
  r = requestHelpers(h);
  await acceptAllLegal(h, "bo-verifier");
  await acceptAllLegal(h, "agenzia-uno-owner");
  customer = {
    token: await h.token({
      sub: "kc-private-acceptance-test",
      azp: "astax-web-private",
      roles: ["astax-private"],
      email: EMAIL,
      givenName: "Giulia",
      familyName: "Prova",
    }),
  };
  const pending = (await (await h.call("/legal/pending", customer)).json()) as {
    versionId: string;
  }[];
  await h.call("/legal/acceptances", {
    ...customer,
    body: { versionIds: pending.map((p) => p.versionId) },
  });
  requestId = (await r.submittedPrivateRequest(customer, EMAIL)).id;
  await r.json(
    await r.call(
      { token: await h.tokenFor("bo-verifier"), context: membershipId("bo-verifier", "astax") },
      `/verification/requests/${requestId}/approve`,
      { body: {} },
    ),
    200,
  );
  // S01: the five offers, with their guarantees and submission times.
  ({ offerIds: offers } = await closedRound(h, requestId, [
    {
      agency: "agenzia-uno",
      company: "Compagnia Alfa",
      cents: 52000,
      until: "2026-12-05",
      at: "2026-11-16T09:20:00Z",
    },
    {
      agency: "agenzia-due",
      company: "Compagnia Alfa",
      cents: 54000,
      until: "2026-12-01",
      at: "2026-11-16T09:40:00Z",
    },
    {
      agency: "agenzia-tre",
      company: "Compagnia Beta",
      cents: 50500,
      until: "2026-12-03",
      at: "2026-11-16T10:05:00Z",
    },
    {
      agency: "agenzia-cinque",
      company: "Compagnia Beta",
      cents: 50500,
      until: "2026-12-06",
      at: "2026-11-16T10:30:00Z",
    },
    {
      agency: "agenzia-quattro",
      company: "Compagnia Gamma",
      cents: 61000,
      until: "2026-12-10",
      at: "2026-11-16T10:50:00Z",
    },
  ]));
  // The start of cover far enough for GAR-04 (the sample may use another date).
  await system((tx) =>
    tx.quoteRequest.update({
      where: { id: requestId },
      data: { startDate: new Date("2026-11-20") },
    }),
  );
});

afterAll(async () => {
  await h.close();
});

const presentation = async () =>
  r.json<{ offers: Row[]; aiUsed: boolean }>(
    await r.call(customer, `/requests/${requestId}/presentation`),
    200,
  );

describe("fase 5: the private customer's acceptance (S01)", () => {
  it("PRES-02 PRES-03 PRES-04 S01 three rows, best per company, no agency, the fee shown", async () => {
    const p = await presentation();
    expect(p.offers.map((o) => [o.company, o.annualGrossPremiumCents])).toEqual([
      ["Compagnia Beta", 50500],
      ["Compagnia Alfa", 52000],
      ["Compagnia Gamma", 61000],
    ]);
    // Cinque's Beta (guaranteed longer) is the row shown.
    expect(p.offers[0]?.id).toBe(offers[3]);
    expect(JSON.stringify(p)).not.toMatch(/organizationId|Agenzia/);
    expect(p.offers[0]).toMatchObject({ feeCents: 3000, feeWithAiCents: 3500, block: null });
  });

  it("PRES-06 PRES-08 FEE-01 the AI comparison: suggestion saved with weights, scores, model and text; the fee becomes 35,00 €", async () => {
    const s = await r.json<{ recommendedOfferId: string; text: string }>(
      await r.call(customer, `/requests/${requestId}/ai-comparison`, { body: {} }),
      200,
    );
    expect(s.text).toContain("Compagnia Beta");
    const saved = await system((tx) =>
      tx.aiSuggestion.findFirstOrThrow({ where: { quoteRequestId: requestId } }),
    );
    expect(saved).toMatchObject({
      textSource: "MODEL",
      model: "fake-ai-explainer",
      promptVersion: "fake-1",
      recommendedOfferId: offers[3],
    });
    expect(saved.weights).toEqual({
      price: 0.6,
      coverage: 0.2,
      companyComplaints: 0.1,
      agencyIssuanceSpeed: 0.1,
    });
    expect((saved.scores as unknown[]).length).toBe(3);
    const p = await presentation();
    expect(p.aiUsed).toBe(true);
    expect(p.offers[1]?.feeCents).toBe(3500);
  });

  it("PRES-08 a model text that fails the check is replaced by the fallback, and the problems are saved", async () => {
    badText = true;
    try {
      const s = await r.json<{ text: string }>(
        await r.call(customer, `/requests/${requestId}/ai-comparison`, { body: {} }),
        200,
      );
      expect(s.text).not.toContain("99,00");
      expect(s.text).toContain("Secondo i criteri del confronto");
      const saved = await system((tx) =>
        tx.aiSuggestion.findFirstOrThrow({
          where: { quoteRequestId: requestId, model: "fake-bad" },
        }),
      );
      expect(saved.textSource).toBe("FALLBACK");
      expect((saved.textProblems as unknown[]).length).toBeGreaterThan(0);
    } finally {
      badText = false;
    }
  });

  it("GAR-04 past the last useful moment the acceptance is refused by the API", async () => {
    await system((tx) =>
      tx.quoteRequest.update({
        where: { id: requestId },
        data: { startDate: new Date("2026-11-16") },
      }),
    );
    const refused = await r.json<{ errors: { issue: string }[] }>(
      await r.call(customer, `/requests/${requestId}/acceptance`, {
        body: { offerId: offers[0], returnPath: "/preventivi" },
      }),
      409,
    );
    expect(refused.errors.map((e) => e.issue)).toEqual(["TOO_LATE_TO_ACCEPT"]);
    await system((tx) =>
      tx.quoteRequest.update({
        where: { id: requestId },
        data: { startDate: new Date("2026-11-20") },
      }),
    );
  });

  let signingRef: string;

  it("PRES-05 LEG-05 FEE-01 S01 Alfa 520,00 € (not the cheapest): 555,00 € to pay, MUP and letter to sign", async () => {
    const a = await r.json<{
      status: string;
      feeCents: number;
      totalCents: number;
      feeRule: string;
      signingUrl: string;
      documents: { id: string; kind: string }[];
    }>(
      await r.call(customer, `/requests/${requestId}/acceptance`, {
        body: { offerId: offers[0], returnPath: `/preventivi/${requestId}` },
      }),
      200,
    );
    expect(a).toMatchObject({
      status: "PENDING_SIGNATURE",
      feeCents: 3500,
      totalCents: 55500,
      feeRule: "PRIVATE_AI",
    });
    expect(a.documents.map((d) => d.kind).sort()).toEqual([
      "ENGAGEMENT_LETTER",
      "PRECONTRACTUAL_INFO",
    ]);
    const mup = a.documents.find((d) => d.kind === "PRECONTRACTUAL_INFO");
    const file = await r.call(customer, `/requests/${requestId}/acceptance/documents/${mup?.id}`);
    expect(file.status).toBe(200);
    // LEG-05: AstAx proposing, the issuing agency, company, compensation, payment;
    // rule 10: the legal text is still the placeholder.
    const text = await pdfText(await file.arrayBuffer());
    const [astax, uno] = await system((tx) =>
      Promise.all([
        tx.organization.findFirstOrThrow({ where: { type: "ASTAX" } }),
        tx.organization.findUniqueOrThrow({ where: { id: orgId("agenzia-uno") } }),
      ]),
    );
    for (const part of [astax.legalName, uno.legalName, "Compagnia Alfa", "520,00", "35,00"]) {
      expect(text, part).toContain(hex(part));
    }
    expect(text).toContain(`${hex("35,00")}${EURO}`);
    expect(text).toContain(`${hex("[DA VALIDARE ")}${EM_DASH}${hex(" LEGALE]")}`);
    signingRef = refOf(a.signingUrl);
  });

  it("LEG-05 CLA-02 S01 signed with the code: the request is accepted and the ranking published, Uno 3ª su 5", async () => {
    const wrong = await h.call(`/fake-providers/signature/${signingRef}/sign`, {
      body: { code: "000000" },
    });
    expect(wrong.status).toBe(400);
    await r.json(
      await h.call(`/fake-providers/signature/${signingRef}/sign`, { body: { code: "123456" } }),
      200,
    );
    const [request, ranking, unoNote] = await system((tx) =>
      Promise.all([
        tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } }),
        tx.ranking.findFirstOrThrow({ where: { quoteRequestId: requestId } }),
        tx.membership.findMany({ where: { organizationId: orgId("agenzia-uno") } }).then((m) =>
          tx.notification.findFirst({
            where: { eventKey: "ranking.available", userId: { in: m.map((x) => x.userId) } },
          }),
        ),
      ]),
    );
    expect(request.status).toBe("ACCEPTED");
    expect(ranking.publishedAt).not.toBeNull();
    expect(unoNote?.body).toContain("3ª su 5");
    expect(JSON.stringify(unoNote)).not.toContain("€");
    const a = await r.json<{ acceptance: { status: string; documents: { signed: boolean }[] } }>(
      await r.call(customer, `/requests/${requestId}/acceptance`),
      200,
    );
    expect(a.acceptance.status).toBe("SIGNED");
    expect(a.acceptance.documents.filter((d) => d.signed).length).toBe(2);
    // The signed files and the evidence are kept, with their content.
    const envelope = await system((tx) =>
      tx.signatureEnvelope.findFirstOrThrow({
        where: { acceptance: { quoteRequestId: requestId }, status: "SIGNED" },
      }),
    );
    const kept = await system((tx) =>
      tx.document.findMany({
        where: {
          id: {
            in: [...(envelope.signedDocumentIds as string[]), envelope.evidenceDocumentId ?? ""],
          },
        },
      }),
    );
    expect(kept.map((d) => d.kind).sort()).toEqual([
      "SIGNATURE_EVIDENCE",
      "SIGNED_DOCUMENT",
      "SIGNED_DOCUMENT",
    ]);
    for (const d of kept) expect((await h.storage.get(d.storageKey)).length).toBeGreaterThan(0);
  });

  it("PAG-03 a refused card brings the request back to «Offerte disponibili»; the customer retries", async () => {
    const first = await r.json<{ redirectUrl: string }>(
      await r.call(customer, `/requests/${requestId}/acceptance/payment`, {
        body: { returnPath: `/preventivi/${requestId}` },
      }),
      200,
    );
    const refused = await r.json<{ status: string }>(
      await h.call(`/fake-providers/payments/${refOf(first.redirectUrl)}/pay`, {
        body: { method: "CARD", cardNumber: "4000 0000 0000 0002" },
      }),
      200,
    );
    expect(refused.status).toBe("FAILED");
    const request = await system((tx) =>
      tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } }),
    );
    expect(request.status).toBe("OFFERS_AVAILABLE");
    // VIS-02: the contacts are not given before the payment.
    const won = await system((tx) => tx.offer.findUniqueOrThrow({ where: { id: offers[0] } }));
    expect(won.status).toBe("AWAITING_CUSTOMER");
    expect(JSON.stringify(await toIssue())).not.toContain(EMAIL);
  });

  it("PAG-02 EMI-01 S01 paid 555,00 € by card: «In emissione», Uno «Vincente», the others «Non scelta», the deadline, the workflow told", async () => {
    const second = await r.json<{ redirectUrl: string }>(
      await r.call(customer, `/requests/${requestId}/acceptance/payment`, {
        body: { returnPath: `/preventivi/${requestId}` },
      }),
      200,
    );
    const ref = refOf(second.redirectUrl);
    const paid = await r.json<{ status: string }>(
      await h.call(`/fake-providers/payments/${ref}/pay`, {
        body: { method: "CARD", cardNumber: "4242 4242 4242 4242" },
      }),
      200,
    );
    expect(paid.status).toBe("CAPTURED");
    const [request, all, payments, outbox, acceptance] = await system((tx) =>
      Promise.all([
        tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } }),
        tx.offer.findMany({ where: { id: { in: offers } } }),
        tx.payment.findMany({ where: { acceptance: { quoteRequestId: requestId } } }),
        tx.outboxEvent.count({ where: { type: "PaymentConfirmed" } }),
        tx.acceptance.findFirstOrThrow({ where: { quoteRequestId: requestId, status: "PAID" } }),
      ]),
    );
    expect(request.status).toBe("IN_ISSUANCE");
    expect(all.find((o) => o.id === offers[0])?.status).toBe("WINNING");
    expect(all.filter((o) => o.status === "NOT_CHOSEN")).toHaveLength(4);
    const captured = payments.find((p) => p.status === "CAPTURED");
    expect(captured).toMatchObject({ premiumCents: 52000, feeCents: 3500, method: "CARD" });
    expect(outbox).toBeGreaterThan(0);
    expect(acceptance.issuanceDeadlineAt).not.toBeNull();
    // VIS-02: now Agenzia Uno has the customer's contacts, in «Da emettere».
    const list = await toIssue();
    expect(list.find((x) => x.email === EMAIL)).toBeTruthy();
  });

  it("PAG-02 the same signed webhook twice is handled once", async () => {
    const provider = h.app.get<FakePaymentsProvider>(PAYMENTS);
    const payment = await system((tx) =>
      tx.payment.findFirstOrThrow({
        where: { status: "CAPTURED", acceptance: { quoteRequestId: requestId } },
      }),
    );
    const webhook = provider.pay(payment.providerRef ?? "", {
      method: "CARD",
      cardNumber: "4242 4242 4242 4242",
    });
    expect(() => provider.parseWebhook(webhook.headers, webhook.body)).not.toThrow();
    const eventId = (JSON.parse(webhook.body) as { eventId: string }).eventId;
    const before = await system((tx) =>
      tx.auditLog.count({ where: { action: "PAYMENT_CONFIRMED" } }),
    );
    for (let i = 0; i < 2; i += 1) {
      const response = await fetch(`${h.baseUrl}/webhooks/payments`, {
        method: "POST",
        headers: { ...webhook.headers, "content-type": "application/json" },
        body: webhook.body,
      });
      expect(response.status).toBe(204);
    }
    const [events, after, outbox] = await system((tx) =>
      Promise.all([
        tx.providerEvent.count({ where: { eventId } }),
        tx.auditLog.count({ where: { action: "PAYMENT_CONFIRMED" } }),
        tx.payment.count({
          where: { status: "CAPTURED", acceptance: { quoteRequestId: requestId } },
        }),
      ]),
    );
    expect(events).toBe(1);
    expect(after).toBe(before);
    expect(outbox).toBe(1);
  });

  it("a webhook without a valid signature is refused and changes nothing", async () => {
    const before = await system((tx) =>
      tx.auditLog.count({ where: { action: "PAYMENT_CONFIRMED" } }),
    );
    const fake = await h.call(`/webhooks/payments`, {
      body: { providerRef: "x", status: "CAPTURED" },
    });
    expect(fake.status).toBe(401);
    const after = await system((tx) =>
      tx.auditLog.count({ where: { action: "PAYMENT_CONFIRMED" } }),
    );
    expect(after).toBe(before);
  });

  it("PRES-06 the AI comparison is for privates only (403 to a broker)", async () => {
    await acceptAllLegal(h, "broker-owner");
    const broker = {
      token: await h.tokenFor("broker-owner"),
      context: membershipId("broker-owner", "broker-demo"),
    };
    expect(
      (await r.call(broker, `/requests/${requestId}/ai-comparison`, { body: {} })).status,
    ).toBe(403);
  });

  it("PRES-07 the complaints index: the administrator sets it, the change is logged with before and after", async () => {
    await acceptAllLegal(h, "admin");
    const admin = { token: await h.tokenFor("admin"), context: membershipId("admin", "astax") };
    const list = await r.json<{ companyId: string; company: string }[]>(
      await r.call(admin, "/admin/complaints-index"),
      200,
    );
    const alfa = list.find((c) => c.company === "Compagnia Alfa");
    for (const value of [3.2, 2.9]) {
      await r.json(
        await r.call(admin, "/admin/complaints-index", {
          method: "PUT",
          body: {
            companyId: alfa?.companyId,
            year: 2025,
            value,
            source: "Dati inventati di prova",
          },
        }),
        200,
      );
    }
    const [stored, logged] = await system((tx) =>
      Promise.all([
        tx.companyComplaintsIndex.findMany({ where: { companyId: alfa?.companyId, year: 2025 } }),
        tx.auditLog.findMany({
          where: { action: "COMPLAINTS_INDEX_SET", targetId: alfa?.companyId },
          orderBy: { at: "asc" },
        }),
      ]),
    );
    expect(stored.map((s) => s.value)).toEqual([2.9]);
    expect(logged.at(-1)?.before).toMatchObject({ value: 3.2 });
    expect(logged.at(-1)?.after).toMatchObject({ value: 2.9 });
    const verifier = {
      token: await h.tokenFor("bo-verifier"),
      context: membershipId("bo-verifier", "astax"),
    };
    expect((await r.call(verifier, "/admin/complaints-index")).status).toBe(403);
  });
});
