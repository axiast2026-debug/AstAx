import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { buildFiscalCode, type QuoteData } from "@astax/shared/domain";
import type { FakePaymentsProvider } from "@astax/adapters/payments";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PAYMENTS } from "../../src/infra/tokens.js";
import { closedRound } from "./auction-helpers.js";
import { acceptAllLegal, membershipId, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// ADR 0027 (Dan, 2026-10-30): the intermediary buys and pays; the customer signs on a link.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
let broker: Who;
let requestId: string;
let offers: string[];
const EMAIL = "marta.colombo@example.test";

const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);
const refOf = (url: string) => url.split("/").at(-1) ?? "";
const lastMail = (to: string) => [...h.email.sent].reverse().find((m) => m.to === to);

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  for (const key of [
    "broker-operator",
    "bo-verifier",
    "agenzia-uno-owner",
    "agenzia-tre-owner",
  ] as const) {
    await acceptAllLegal(h, key);
  }
  broker = {
    token: await h.tokenFor("broker-operator"),
    context: membershipId("broker-operator", "broker-demo"),
  };
  const fiscalCode = buildFiscalCode({
    surname: "Colombo",
    givenName: "Marta",
    birthDate: "1988-04-12",
    sex: "F",
    birthPlaceCadastralCode: "H501",
  });
  const customer = await r.json<{ id: string }>(
    await r.call(broker, "/customers", {
      body: { kind: "PERSON", surname: "Colombo", givenName: "Marta", fiscalCode, email: EMAIL },
    }),
    201,
  );
  const request = await r.json<{ id: string }>(
    await r.call(broker, "/requests", { body: { customerId: customer.id } }),
    201,
  );
  requestId = request.id;
  const base = await r.sampleQuote(broker, "MC789EF");
  const marta = {
    kind: "PERSON" as const,
    surname: "Colombo",
    givenName: "Marta",
    fiscalCode,
    birthDate: "1988-04-12",
    birthPlace: "058091",
    sex: "F" as const,
    residence: {
      street: "Via degli Esempi 5",
      postalCode: "00184",
      municipalityIstat: "058091",
      province: "RM",
    },
  };
  const quote: QuoteData = {
    ...base,
    policyHolder: marta,
    drivers: base.drivers.map((d) => ({ ...d, person: marta })),
  };
  await r.saveAll(broker, requestId, quote);
  await r.json(
    await r.upload(broker, requestId, "REGISTRATION_CERTIFICATE", "libretto-anna-riva.jpg"),
    201,
  );
  await r.json(
    await r.upload(broker, requestId, "IDENTITY_DOCUMENT", "identita-anna-riva.jpg"),
    201,
  );
  await r.json(
    await r.upload(broker, requestId, "RISK_CERTIFICATE", "attestato-anna-riva.pdf"),
    201,
  );
  await r.json(await r.call(broker, `/requests/${requestId}/consent/link`, { body: {} }), 200);
  const consentToken = /\/consenso\/([A-Za-z0-9_-]+)/.exec(lastMail(EMAIL)?.text ?? "")?.[1] ?? "";
  await r.json(await h.call(`/consent-links/${consentToken}/code`, { body: {} }), 204);
  await r.json(
    await h.call(`/consent-links/${consentToken}/confirm`, { body: { code: r.lastCode(EMAIL) } }),
    200,
  );
  await r.json(await r.call(broker, `/requests/${requestId}/submit`, { body: {} }), 200);
  await r.json(
    await r.approve(
      { token: await h.tokenFor("bo-verifier"), context: membershipId("bo-verifier", "astax") },
      requestId,
    ),
    200,
  );
  ({ offerIds: offers } = await closedRound(h, requestId, [
    {
      agency: "agenzia-uno",
      company: "Compagnia Alfa",
      cents: 48000,
      until: "2026-12-05",
      at: "2026-11-16T09:20:00Z",
    },
    {
      agency: "agenzia-tre",
      company: "Compagnia Beta",
      cents: 46000,
      until: "2026-12-03",
      at: "2026-11-16T09:40:00Z",
    },
    {
      agency: "agenzia-due",
      company: "Compagnia Alfa",
      cents: 49000,
      until: "2026-12-05",
      at: "2026-11-16T09:50:00Z",
    },
  ]));
  await system((tx) =>
    tx.quoteRequest.update({
      where: { id: requestId },
      data: { startDate: new Date("2026-11-25") },
    }),
  );
});

afterAll(async () => {
  await h.close();
});

describe("ADR 0027: the intermediary buys the offer, the customer signs afterwards", () => {
  let token: string;
  let proof: string;
  const withProof = () => ({ headers: { "x-astax-link-proof": proof } });
  const toIssue = async (key: "agenzia-tre-owner" | "agenzia-uno-owner", org: string) =>
    (await (
      await h.call("/agency/to-issue", {
        token: await h.tokenFor(key),
        context: membershipId(key, org),
      })
    ).json()) as { email: string | null }[];

  it("PRES-02 only the best offer of each company can be bought", async () => {
    const worse = await r.call(broker, `/requests/${requestId}/purchase`, {
      body: { offerId: offers[2], returnPath: `/richieste/${requestId}` },
    });
    expect(worse.status).toBe(404);
  });

  it("FEE-03 the broker buys Beta and pays the premium only; nothing goes to issuance before the signature", async () => {
    const pay = await r.json<{ redirectUrl: string }>(
      await r.call(broker, `/requests/${requestId}/purchase`, {
        body: { offerId: offers[1], returnPath: `/richieste/${requestId}` },
      }),
      200,
    );
    // No link for the customer before the payment.
    const early = await r.json<{ errors: { issue: string }[] }>(
      await r.call(broker, `/requests/${requestId}/customer-link`, { body: { email: EMAIL } }),
      409,
    );
    expect(early.errors.map((e) => e.issue)).toEqual(["NOT_PAID"]);
    const ref = refOf(pay.redirectUrl);
    await r.json(
      await h.call(`/fake-providers/payments/${ref}/pay`, { body: { method: "INSTANT_TRANSFER" } }),
      200,
    );
    const webhook = h.app.get<FakePaymentsProvider>(PAYMENTS).confirmTransfer(ref);
    const confirmed = await fetch(`${h.baseUrl}/webhooks/payments`, {
      method: "POST",
      headers: { ...webhook.headers, "content-type": "application/json" },
      body: webhook.body,
    });
    expect(confirmed.status).toBe(204);
    const [request, payments, acceptance] = await system((tx) =>
      Promise.all([
        tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } }),
        tx.payment.findMany({ where: { acceptance: { quoteRequestId: requestId } } }),
        tx.acceptance.findFirstOrThrow({
          where: { quoteRequestId: requestId, status: { not: "VOIDED" } },
        }),
      ]),
    );
    expect(request.status).toBe("ACCEPTED");
    expect(payments.filter((x) => x.status === "CAPTURED")).toHaveLength(1);
    expect(payments.find((x) => x.status === "CAPTURED")).toMatchObject({
      premiumCents: 46000,
      feeCents: 0,
    });
    expect(acceptance).toMatchObject({
      intermediaryPurchase: true,
      status: "PENDING_SIGNATURE",
      brokerFeeCents: 3000,
      offerId: offers[1],
    });
    expect(acceptance.paidAt).not.toBeNull();
    // VIS-02: no contacts to the agency before the signature.
    expect(JSON.stringify(await toIssue("agenzia-tre-owner", "agenzia-tre"))).not.toContain(EMAIL);
    // The offer bought is the only one.
    const other = await r.json<{ errors: { issue: string }[] }>(
      await r.call(broker, `/requests/${requestId}/purchase`, {
        body: { offerId: offers[0], returnPath: `/richieste/${requestId}` },
      }),
      409,
    );
    expect(other.errors.map((e) => e.issue)).toEqual(["ALREADY_PURCHASED"]);
  });

  it("the broker gives the customer's email: the link to sign, with the price and the plate", async () => {
    const empty = await r.call(broker, `/requests/${requestId}/customer-link`, { body: {} });
    expect(empty.status).toBe(400);
    const now = h.clock.now();
    const sent = await r.json<{ expiresAt: string; offerIds: string[] }>(
      await r.call(broker, `/requests/${requestId}/customer-link`, { body: { email: EMAIL } }),
      200,
    );
    expect(sent.offerIds).toEqual([offers[1]]);
    // acceptance.signatureLinkValidityDays: 14.
    expect(sent.expiresAt).toBe(new Date(now.getTime() + 14 * 24 * 3600 * 1000).toISOString());
    const mail = lastMail(EMAIL);
    expect(mail?.subject).toContain("firma la tua polizza");
    expect(mail?.text).toContain("Compagnia Beta");
    expect(mail?.text).toContain("460,00");
    expect(mail?.text).toContain("MC789EF");
    token = /\/offerta\/([A-Za-z0-9_-]+)/.exec(mail?.text ?? "")?.[1] ?? "";
    expect(token.length).toBeGreaterThan(40);
    // The acceptance is the link's: documents, signature and policy email.
    const bought = await system((tx) =>
      tx.acceptance.findFirstOrThrow({
        where: { quoteRequestId: requestId, status: { not: "VOIDED" } },
      }),
    );
    expect(bought.customerLinkId).not.toBeNull();
  });

  it("a refused signature: a new link gives a new envelope to sign; the old link is closed", async () => {
    const before = await system((tx) =>
      tx.signatureEnvelope.findFirstOrThrow({
        where: { acceptance: { quoteRequestId: requestId, status: { not: "VOIDED" } } },
      }),
    );
    // The provider's REJECTED webhook, as it leaves the envelope.
    await system((tx) =>
      tx.signatureEnvelope.update({ where: { id: before.id }, data: { status: "REJECTED" } }),
    );
    const oldToken = token;
    const sentAt = h.email.sent.length;
    await r.json(
      await r.call(broker, `/requests/${requestId}/customer-link`, { body: { email: EMAIL } }),
      200,
    );
    const mail = h.email.sent.slice(sentAt).find((m) => m.to === EMAIL);
    token = /\/offerta\/([A-Za-z0-9_-]+)/.exec(mail?.text ?? "")?.[1] ?? "";
    expect(token).not.toBe(oldToken);
    expect((await h.call(`/customer-links/${oldToken}/code`, { body: {} })).status).toBe(409);
    const after = await system((tx) =>
      tx.signatureEnvelope.findUniqueOrThrow({ where: { id: before.id } }),
    );
    expect(after.status).toBe("PENDING");
    expect(after.providerRef).not.toBe(before.providerRef);
    expect(after.signingUrl).toMatch(/\/firma-di-prova\//);
  });

  it("before the code the page shows only who sends it and the vehicle; a wrong code or a forged proof is refused", async () => {
    const before = await r.json<{ verified: boolean; offers?: unknown }>(
      await h.call(`/customer-links/${token}`),
      200,
    );
    expect(before.verified).toBe(false);
    expect(before.offers).toBeUndefined();
    expect(JSON.stringify(before)).not.toContain(EMAIL);
    await r.json(await h.call(`/customer-links/${token}/code`, { body: {} }), 204);
    const wrong = await h.call(`/customer-links/${token}/confirm`, { body: { code: "000000" } });
    expect(wrong.status).toBe(400);
    const forged = await h.call(`/customer-links/${token}/acceptance`, {
      body: { offerId: offers[1] },
      headers: { "x-astax-link-proof": "forged" },
    });
    expect(forged.status).toBe(403);
  });

  it("VIS-02 the customer signs the offer bought: issuance, contacts to Agenzia Tre only", async () => {
    proof = (
      await r.json<{ proof: string }>(
        await h.call(`/customer-links/${token}/confirm`, { body: { code: r.lastCode(EMAIL) } }),
        200,
      )
    ).proof;
    const page = await r.json<{
      offers: { id: string; block: string | null }[];
      acceptance: { intermediaryPurchase: boolean; status: string } | null;
    }>(await h.call(`/customer-links/${token}`, withProof()), 200);
    expect(page.offers.map((o) => o.id)).toEqual([offers[1]]);
    expect(page.acceptance).toMatchObject({
      intermediaryPurchase: true,
      status: "PENDING_SIGNATURE",
    });
    const a = await r.json<{ signingUrl: string; documents: { id: string; kind: string }[] }>(
      await h.call(`/customer-links/${token}/acceptance`, {
        body: { offerId: offers[1] },
        ...withProof(),
      }),
      200,
    );
    expect(a.documents.map((d) => d.kind)).toEqual(["PRECONTRACTUAL_INFO"]);
    // LEG-05: the customer reads the documents before signing.
    const file = await h.call(
      `/customer-links/${token}/acceptance/documents/${a.documents[0]?.id}`,
      withProof(),
    );
    expect(file.status).toBe(200);
    // Decision 26: the broker never gets the customer's signing page.
    const seen = await r.json<{ acceptance: { signingUrl: string | null } }>(
      await r.call(broker, `/requests/${requestId}/acceptance`),
      200,
    );
    expect(seen.acceptance.signingUrl).toBeNull();
    // Nothing to pay on the link.
    const pay = await h.call(`/customer-links/${token}/acceptance/payment`, {
      body: {},
      ...withProof(),
    });
    expect(pay.status).toBe(409);
    await r.json(
      await h.call(`/fake-providers/signature/${refOf(a.signingUrl)}/sign`, {
        body: { code: "123456" },
      }),
      200,
    );
    const [request, acceptance] = await system((tx) =>
      Promise.all([
        tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } }),
        tx.acceptance.findFirstOrThrow({ where: { quoteRequestId: requestId, status: "PAID" } }),
      ]),
    );
    expect(request.status).toBe("IN_ISSUANCE");
    expect(acceptance.issuanceDeadlineAt).not.toBeNull();
    // The customer signed, on the link.
    const signedEvent = await system((tx) =>
      tx.quoteRequestEvent.findFirst({
        where: { quoteRequestId: requestId, type: "ACCEPTANCE_SIGNED" },
      }),
    );
    expect(signedEvent?.actorKind).toBe("CUSTOMER");
    expect((await toIssue("agenzia-tre-owner", "agenzia-tre")).some((x) => x.email === EMAIL)).toBe(
      true,
    );
    expect(JSON.stringify(await toIssue("agenzia-uno-owner", "agenzia-uno"))).not.toContain(EMAIL);
  });
});
