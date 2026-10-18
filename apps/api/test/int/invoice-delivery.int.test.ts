import { randomInt } from "node:crypto";
import { LocalFieldCipher } from "@astax/adapters/crypto";
import type { EInvoicingPort } from "@astax/adapters/e-invoicing";
import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InvoicingService } from "../../src/invoicing/invoicing.service.js";
import { startHarness, TEST_CIPHER_KEYS, userId, type Harness } from "./fixtures.js";

// Phase 8 (independent review): with SDI down, the delivery is retried every
// round, but «fattura disponibile» goes out once and nothing is sent twice.
let h: Harness;
let attempts = 0;
const down: EInvoicingPort = {
  provider: "down",
  send: async () => {
    attempts += 1;
    throw new Error("SDI down");
  },
  getStatus: async () => "SENT",
};

beforeAll(async () => {
  h = await startHarness({ eInvoicing: down });
});

afterAll(async () => {
  await h.close();
});

describe("phase 8 invoice delivery with SDI down", () => {
  it("the copy and the notice once; the invoice stays to send; tried again next round", async () => {
    const cipher = new LocalFieldCipher(TEST_CIPHER_KEYS.encryption, TEST_CIPHER_KEYS.blindIndex);
    const number = randomInt(800_000, 899_999);
    const owner = userId("private-giulia-neri");
    const invoice = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.invoice.create({
        data: {
          series: "P",
          year: 2032,
          number,
          code: `P-2032-${number}`,
          recipientType: "PRIVATE",
          ownerUserId: owner,
          recipientEnc: cipher.encrypt(
            JSON.stringify({
              name: "Giulia Neri",
              givenName: "Giulia",
              surname: "Neri",
              fiscalCode: "NREGLI85A41H501X",
              address: { street: "Via Inventata 3", postalCode: "00184", city: "Roma" },
            }),
          ),
          lines: [{ description: "Compenso", quantity: 1, unitCents: 3000 }],
          exemptCents: 3000,
          stampDutyCents: 0,
          totalCents: 3000,
          vatNature: "N4",
          legalReference: "art. 10",
          issuedOn: new Date("2032-01-10"),
        },
      }),
    );
    const invoicing = h.app.get(InvoicingService);
    await invoicing.deliver(invoice.id);
    await invoicing.deliver(invoice.id);
    const after = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
    );
    expect(after.sdiStatus).toBe("TO_SEND");
    expect(after.pdfDocumentId).not.toBeNull();
    expect(attempts).toBe(2);
    const told = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.notification.count({
        where: { eventKey: "invoice.available", payload: { equals: { invoiceId: invoice.id } } },
      }),
    );
    expect(told).toBe(1);
    const emails = h.email.sent.filter((m) => m.subject.includes(invoice.code));
    expect(emails.length).toBeLessThanOrEqual(1);
  });
});
