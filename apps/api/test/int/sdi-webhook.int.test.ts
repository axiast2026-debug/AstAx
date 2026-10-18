import { randomInt, randomUUID } from "node:crypto";
import { OpenapiEInvoicing } from "@astax/adapters/e-invoicing";
import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./fixtures.js";

// Phase 8: the SDI receipts arrive from the provider (Openapi) on /webhooks/sdi,
// authenticated by the agreed header; only a step forward is applied.
const SECRET = "segreto-webhook-di-prova";
let h: Harness;

beforeAll(async () => {
  h = await startHarness({
    eInvoicing: new OpenapiEInvoicing({
      baseUrl: "https://test.sdi.openapi.it",
      token: "not-used",
      webhookSecret: SECRET,
    }),
  });
});

afterAll(async () => {
  await h.close();
});

async function sentInvoice(sdiRef: string) {
  const number = randomInt(900_000, 999_999);
  return withContext(h.db, SYSTEM_CONTEXT, (tx) =>
    tx.invoice.create({
      data: {
        series: "P",
        year: 2031,
        number,
        code: `P-2031-${number}`,
        recipientType: "PRIVATE",
        ownerUserId: randomUUID(),
        recipientEnc: "x",
        lines: [],
        exemptCents: 3000,
        stampDutyCents: 0,
        totalCents: 3000,
        vatNature: "N4",
        legalReference: "art. 10",
        issuedOn: new Date("2031-01-10"),
        sdiStatus: "SENT",
        sdiRef,
      },
    }),
  );
}

const receipt = (sdiRef: string, type: string) =>
  JSON.stringify({
    event: "customer-notification",
    data: { notification: { invoice_uuid: sdiRef, type } },
  });

const post = (body: string, secret: string) =>
  fetch(`${h.baseUrl}/webhooks/sdi`, {
    method: "POST",
    headers: { authorization: secret, "content-type": "application/json" },
    body,
  });

describe("phase 8 SDI receipts", () => {
  it("a delivery receipt marks the invoice DELIVERED; a rejection after it changes nothing", async () => {
    const ref = `inv-${randomUUID()}`;
    const invoice = await sentInvoice(ref);
    expect((await post(receipt(ref, "RC"), SECRET)).status).toBe(204);
    expect((await post(receipt(ref, "NS"), SECRET)).status).toBe(204);
    const after = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
    );
    expect(after.sdiStatus).toBe("DELIVERED");
  });

  it("a rejection (NS) marks it REJECTED; a call without the agreed header is refused", async () => {
    const ref = `inv-${randomUUID()}`;
    const invoice = await sentInvoice(ref);
    expect((await post(receipt(ref, "NS"), "sbagliato")).status).toBe(401);
    expect((await post(receipt(ref, "NS"), SECRET)).status).toBe(204);
    const after = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
    );
    expect(after.sdiStatus).toBe("REJECTED");
  });
});
