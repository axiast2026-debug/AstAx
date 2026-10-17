import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { FakeAiExplainer } from "../ai-explainer/ai-explainer.js";
import { ManualClock } from "../clock/manual-clock.js";
import { FakePaymentsProvider } from "../payments/payments.js";
import { InMemoryObjectStorage } from "../storage/object-storage.js";
import { FakeSignatureProvider, InvalidWebhookError } from "./signature.js";

const clock = new ManualClock("2026-11-16T11:00:00Z");
const SECRET = "test-secret";

describe("fake signature provider (proposal A, LEG-05)", () => {
  it("signs with the code 123456: signed files with a signature page and an evidence file, signed webhook", async () => {
    const storage = new InMemoryObjectStorage();
    const doc = await PDFDocument.create();
    doc.addPage();
    await storage.put({
      key: "docs/letter",
      body: await doc.save(),
      contentType: "application/pdf",
    });
    const provider = new FakeSignatureProvider(storage, clock, SECRET, (ref) => `/firma/${ref}`);
    const { providerRef, signingUrl } = await provider.createEnvelope({
      reference: "acceptance-1",
      signer: { firstName: "Giulia", lastName: "Neri" },
      documents: [{ id: "letter", title: "Lettera di incarico", key: "docs/letter" }],
      returnUrl: "/preventivi/1",
    });
    expect(signingUrl).toBe(`/firma/${providerRef}`);
    expect((await provider.envelope(providerRef)).titles).toEqual(["Lettera di incarico"]);
    expect(await provider.sign(providerRef, "000000")).toBeNull();
    const webhook = await provider.sign(providerRef, "123456");
    if (!webhook) throw new Error("not signed");
    const event = provider.parseWebhook(webhook.headers, webhook.body);
    expect(event).toMatchObject({ providerRef, status: "SIGNED" });
    const signed = await PDFDocument.load(await storage.get(event.signedFileKeys[0] ?? ""));
    expect(signed.getPageCount()).toBe(2);
    expect(event.evidenceFileKey).not.toBeNull();
  });

  it("a webhook not signed by the provider is refused", async () => {
    const provider = new FakeSignatureProvider(new InMemoryObjectStorage(), clock, SECRET, String);
    expect(() => provider.parseWebhook({ "x-fake-signature": "00" }, "{}")).toThrow(
      InvalidWebhookError,
    );
    expect(() => provider.parseWebhook({}, "{}")).toThrow(InvalidWebhookError);
  });
});

describe("fake payments provider (proposal B, PAG-01)", () => {
  const make = () =>
    new FakePaymentsProvider(new InMemoryObjectStorage(), clock, SECRET, (ref) => `/paga/${ref}`);

  it("PAG-01 one checkout with premium and fee apart; the same idempotency key gives the same reference", async () => {
    const provider = make();
    const input = {
      paymentId: "p1",
      idempotencyKey: "k1",
      amounts: { premiumCents: 52000, feeCents: 3500 },
      methods: ["CARD", "INSTANT_TRANSFER"] as ("CARD" | "INSTANT_TRANSFER")[],
      returnUrl: "/preventivi/1",
    };
    const a = await provider.createCheckout(input);
    const b = await provider.createCheckout(input);
    expect(a.providerRef).toBe(b.providerRef);
    expect((await provider.checkout(a.providerRef)).amounts).toEqual({
      premiumCents: 52000,
      feeCents: 3500,
    });
  });

  it("PAG-03 a card ending with 0002 is refused, another is captured; a transfer is pending, then confirmed", () => {
    const provider = make();
    const parse = (w: { body: string; headers: Record<string, string> }) =>
      provider.parseWebhook(w.headers, w.body).status;
    expect(
      parse(provider.pay("pay-1", { method: "CARD", cardNumber: "4000 0000 0000 0002" })),
    ).toBe("FAILED");
    expect(parse(provider.pay("pay-1", { method: "CARD", cardNumber: "4242424242424242" }))).toBe(
      "CAPTURED",
    );
    expect(parse(provider.pay("pay-1", { method: "INSTANT_TRANSFER" }))).toBe("PENDING");
    expect(parse(provider.confirmTransfer("pay-1"))).toBe("CAPTURED");
  });
});

describe("fake payments provider: closing and refunds (PAG-02, PAG-04)", () => {
  const storage = new InMemoryObjectStorage();
  const provider = new FakePaymentsProvider(storage, clock, SECRET, (ref) => `/paga/${ref}`);

  it("PAG-02 a closed checkout says so to the payment page", async () => {
    const { providerRef } = await provider.createCheckout({
      paymentId: "p9",
      idempotencyKey: "k9",
      amounts: { premiumCents: 52000, feeCents: 3500 },
      methods: ["CARD"],
      returnUrl: "/back",
    });
    expect((await provider.checkout(providerRef)).cancelled).toBe(false);
    await provider.cancelCheckout(providerRef);
    expect((await provider.checkout(providerRef)).cancelled).toBe(true);
  });

  it("PAG-04 a refund is executed; the same key gives the same refund; never zero or decimals", async () => {
    const first = await provider.refund({
      providerRef: "pay-k1",
      idempotencyKey: "r1",
      amountCents: 49700,
    });
    const again = await provider.refund({
      providerRef: "pay-k1",
      idempotencyKey: "r1",
      amountCents: 49700,
    });
    expect(first).toEqual({ refundRef: "refund-r1", status: "EXECUTED" });
    expect(again.refundRef).toBe(first.refundRef);
    await expect(
      provider.refund({ providerRef: "pay-k1", idempotencyKey: "r2", amountCents: 0 }),
    ).rejects.toThrow();
    await expect(
      provider.refund({ providerRef: "pay-k1", idempotencyKey: "r3", amountCents: 1.5 }),
    ).rejects.toThrow();
  });
});

describe("fake AI explainer (PRES-07)", () => {
  it("PRES-07 writes about the recommended offer with the figures it received only", async () => {
    const out = await new FakeAiExplainer().explain({
      offers: [
        {
          offerId: "a",
          company: "Compagnia Alfa",
          product: "RC Auto Alfa",
          premium: "520,00 €",
          guaranteeDaysLeft: 19,
          total: 0.75,
        },
        {
          offerId: "b",
          company: "Compagnia Beta",
          product: "RC Auto Beta",
          premium: "505,00 €",
          guaranteeDaysLeft: 20,
          total: 0.8,
        },
      ],
      recommendedOfferId: "b",
      weights: { price: 0.6, coverage: 0.2, companyComplaints: 0.1, agencyIssuanceSpeed: 0.1 },
      locale: "it",
    });
    expect(out.text).toContain("Compagnia Beta");
    expect(out.text).toContain("505,00 €");
    expect(out.text).not.toContain("520,00");
    expect(out.model).toBe("fake-ai-explainer");
  });
});
