import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { buildFiscalCode, type QuoteData } from "@astax/shared/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closedRound } from "./auction-helpers.js";
import { acceptAllLegal, membershipId, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 5, the broker channel (decision 26): «Invia al cliente», the link with a code, premium only.
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
  for (const key of ["broker-operator", "bo-verifier", "agenzia-uno-owner"] as const) {
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
    await r.upload(broker, requestId, "DRIVING_LICENCE", "patente-anna-riva.jpg", 0),
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
    await r.call(
      { token: await h.tokenFor("bo-verifier"), context: membershipId("bo-verifier", "astax") },
      `/verification/requests/${requestId}/approve`,
      { body: {} },
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

describe("fase 5: the broker's customer on the link (decision 26)", () => {
  let token: string;
  let proof: string;
  const withProof = () => ({ headers: { "x-astax-link-proof": proof } });

  it("the broker sends Alfa to the customer: email with the link, no price; valid until the end of the guarantee", async () => {
    const alfa = offers[0] as string;
    const sent = await r.json<{ expiresAt: string; offerIds: string[] }>(
      await r.call(broker, `/requests/${requestId}/customer-link`, { body: { offerIds: [alfa] } }),
      200,
    );
    expect(sent.offerIds).toEqual([alfa]);
    // GAR-02: 05/12/2026 23:59:59.999 in Rome.
    expect(sent.expiresAt).toBe("2026-12-05T22:59:59.999Z");
    const mail = lastMail(EMAIL);
    expect(mail?.subject).toContain("la tua offerta RC auto");
    expect(mail?.text).toContain("Compagnia Alfa");
    expect(mail?.text).not.toMatch(/480|€/);
    token = /\/offerta\/([A-Za-z0-9_-]+)/.exec(mail?.text ?? "")?.[1] ?? "";
    expect(token.length).toBeGreaterThan(40);
  });

  it("before the code the page shows only who sends it and the vehicle; a wrong code is refused", async () => {
    const before = await r.json<{ verified: boolean; broker: string; offers?: unknown }>(
      await h.call(`/customer-links/${token}`),
      200,
    );
    expect(before.verified).toBe(false);
    expect(before.offers).toBeUndefined();
    expect(JSON.stringify(before)).not.toContain(EMAIL);
    await r.json(await h.call(`/customer-links/${token}/code`, { body: {} }), 204);
    const wrong = await h.call(`/customer-links/${token}/confirm`, { body: { code: "000000" } });
    expect(wrong.status).toBe(400);
    const accept = await h.call(`/customer-links/${token}/acceptance`, {
      body: { offerId: offers[0] },
      headers: { "x-astax-link-proof": "forged" },
    });
    expect(accept.status).toBe(403);
  });

  it("FEE-03 with the code the customer sees only the offer sent, with no fee and no AI comparison", async () => {
    const confirmed = await r.json<{ proof: string }>(
      await h.call(`/customer-links/${token}/confirm`, { body: { code: r.lastCode(EMAIL) } }),
      200,
    );
    proof = confirmed.proof;
    const page = await r.json<{
      verified: boolean;
      offers: { id: string; feeCents: number; feeWithAiCents: number | null }[];
    }>(await h.call(`/customer-links/${token}`, withProof()), 200);
    expect(page.verified).toBe(true);
    expect(page.offers.map((o) => o.id)).toEqual([offers[0]]);
    expect(page.offers[0]).toMatchObject({ feeCents: 0, feeWithAiCents: null });
    // PRES-05: an offer the broker did not send cannot be accepted.
    const other = await h.call(`/customer-links/${token}/acceptance`, {
      body: { offerId: offers[1] },
      ...withProof(),
    });
    expect(other.status).toBe(404);
  });

  it("LEG-05 PAG-01 FEE-03 the customer accepts, signs the MUP only and pays the premium only", async () => {
    const a = await r.json<{
      feeCents: number;
      totalCents: number;
      feeRule: string;
      signingUrl: string;
      documents: { id: string; kind: string }[];
    }>(
      await h.call(`/customer-links/${token}/acceptance`, {
        body: { offerId: offers[0] },
        ...withProof(),
      }),
      200,
    );
    expect(a).toMatchObject({ feeCents: 0, totalCents: 48000, feeRule: "BROKER_CLIENT" });
    expect(a.documents.map((d) => d.kind)).toEqual(["PRECONTRACTUAL_INFO"]);
    const file = await h.call(
      `/customer-links/${token}/acceptance/documents/${a.documents[0]?.id}`,
      withProof(),
    );
    expect(file.status).toBe(200);
    await r.json(
      await h.call(`/fake-providers/signature/${refOf(a.signingUrl)}/sign`, {
        body: { code: "123456" },
      }),
      200,
    );
    const pay = await r.json<{ redirectUrl: string }>(
      await h.call(`/customer-links/${token}/acceptance/payment`, { body: {}, ...withProof() }),
      200,
    );
    const paid = await r.json<{ status: string; returnUrl: string }>(
      await h.call(`/fake-providers/payments/${refOf(pay.redirectUrl)}/pay`, {
        body: { method: "CARD", cardNumber: "4242 4242 4242 4242" },
      }),
      200,
    );
    expect(paid.status).toBe("CAPTURED");
    expect(paid.returnUrl).toContain(`/offerta/${token}`);
    const [request, payment, acceptance] = await system((tx) =>
      Promise.all([
        tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } }),
        tx.payment.findFirstOrThrow({
          where: { status: "CAPTURED", acceptance: { quoteRequestId: requestId } },
        }),
        tx.acceptance.findFirstOrThrow({ where: { quoteRequestId: requestId, status: "PAID" } }),
      ]),
    );
    expect(request.status).toBe("IN_ISSUANCE");
    expect(payment).toMatchObject({ premiumCents: 48000, feeCents: 0 });
    expect(acceptance).toMatchObject({ acceptedByUserId: null, brokerFeeCents: 3000 });
    expect(acceptance.customerLinkId).not.toBeNull();
    // VIS-02: Agenzia Uno has the customer's contacts after the payment.
    const list = (await (
      await h.call("/agency/to-issue", {
        token: await h.tokenFor("agenzia-uno-owner"),
        context: membershipId("agenzia-uno-owner", "agenzia-uno"),
      })
    ).json()) as { email: string | null }[];
    expect(list.some((x) => x.email === EMAIL)).toBe(true);
  });

  it("GAR-02 the link ends with the guarantee: no new code after 05/12", async () => {
    const link = await r.json<{ expired: boolean }>(
      await r.call(broker, `/requests/${requestId}/customer-link`),
      200,
    );
    expect(link.expired).toBe(false);
    const saved = h.clock.now();
    h.clock.set(new Date("2026-12-06T08:00:00Z"));
    try {
      const code = await h.call(`/customer-links/${token}/code`, { body: {} });
      expect(code.status).toBe(409);
      // The paid acceptance stays visible to the customer.
      const page = await r.json<{ state: string; verified: boolean }>(
        await h.call(`/customer-links/${token}`, withProof()),
        200,
      );
      expect(page).toMatchObject({ state: "EXPIRED", verified: true });
    } finally {
      h.clock.set(saved);
    }
  });
});
