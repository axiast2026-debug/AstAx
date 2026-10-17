import type { FakePaymentsProvider } from "@astax/adapters/payments";
import type { FakeSignatureProvider } from "@astax/adapters/signature";
import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PAYMENTS, SIGNATURE } from "../../src/infra/tokens.js";
import { closedRound } from "./auction-helpers.js";
import { acceptAllLegal, membershipId, orgId, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 6, S05: the missed issuance by the agency's fault, the second offer
// with the difference, and the variant with the full refund (EMI-04, EMI-05,
// EMI-06, PAG-04, PAG-05).
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);
const refOf = (url: string) => url.split("/").at(-1) ?? "";
const post = (path: string, webhook: { body: string; headers: Record<string, string> }) =>
  fetch(`${h.baseUrl}${path}`, {
    method: "POST",
    headers: { ...webhook.headers, "content-type": "application/json" },
    body: webhook.body,
  });
const who = async (key: Parameters<Harness["tokenFor"]>[0], org: string): Promise<Who> => ({
  token: await h.tokenFor(key),
  context: membershipId(key, org),
});

async function privateCustomer(sub: string, email: string, givenName: string): Promise<Who> {
  const customer = {
    token: await h.token({
      sub,
      azp: "astax-web-private",
      roles: ["astax-private"],
      email,
      givenName,
      familyName: "Sala",
    }),
  };
  const response = await h.call("/legal/pending", customer);
  const pending = (await response.json()) as { versionId: string }[];
  if (!Array.isArray(pending)) {
    throw new Error(`legal pending ${response.status} ${JSON.stringify(pending)}`);
  }
  await h.call("/legal/acceptances", {
    ...customer,
    body: { versionIds: pending.map((p) => p.versionId) },
  });
  return customer;
}

/** S05: Elena accepts Uno's Alfa 500,00 € and pays 530,00 € (premium and fee 30,00 €). */
async function paidRequest(customer: Who, email: string) {
  const requestId = (await r.submittedPrivateRequest(customer, email)).id;
  await r.json(
    await r.call(await who("bo-verifier", "astax"), `/verification/requests/${requestId}/approve`, {
      body: {},
    }),
    200,
  );
  const { offerIds } = await closedRound(h, requestId, [
    {
      agency: "agenzia-uno",
      company: "Compagnia Alfa",
      cents: 50000,
      until: "2026-12-05",
      at: "2026-11-16T09:20:00Z",
    },
    {
      agency: "agenzia-due",
      company: "Compagnia Alfa",
      cents: 52000,
      until: "2026-12-05",
      at: "2026-11-16T09:30:00Z",
    },
    {
      agency: "agenzia-tre",
      company: "Compagnia Beta",
      cents: 53000,
      until: "2026-12-05",
      at: "2026-11-16T09:40:00Z",
    },
  ]);
  await system((tx) =>
    tx.quoteRequest.update({
      where: { id: requestId },
      data: { startDate: new Date("2026-11-26") },
    }),
  );
  const a = await r.json<{ signingUrl: string }>(
    await r.call(customer, `/requests/${requestId}/acceptance`, {
      body: { offerId: offerIds[0], returnPath: `/preventivi/${requestId}` },
    }),
    200,
  );
  await signAndPay(customer, requestId, refOf(a.signingUrl));
  return { requestId, offerIds };
}

async function signAndPay(customer: Who, requestId: string, signingRef: string) {
  const signed = await h.app.get<FakeSignatureProvider>(SIGNATURE).sign(signingRef, "123456");
  if (!signed) throw new Error("not signed");
  expect((await post("/webhooks/signature", signed)).status).toBe(204);
  const pay = await r.json<{ redirectUrl: string }>(
    await r.call(customer, `/requests/${requestId}/acceptance/payment`, {
      body: { returnPath: `/preventivi/${requestId}` },
    }),
    200,
  );
  const captured = h.app.get<FakePaymentsProvider>(PAYMENTS).pay(refOf(pay.redirectUrl), {
    method: "CARD",
    cardNumber: "4242 4242 4242 4242",
  });
  expect((await post("/webhooks/payments", captured)).status).toBe(204);
}

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  for (const key of [
    "bo-verifier",
    "bo-supervisor",
    "agenzia-uno-owner",
    "agenzia-due-owner",
    "agenzia-tre-owner",
  ] as const) {
    await acceptAllLegal(h, key);
  }
});

afterAll(async () => {
  await h.close();
});

describe("fase 6: S05, the missed issuance and the second offer", () => {
  let elena: Who;
  let requestId: string;
  let offers: string[];
  const EMAIL = "elena.sala.s05@example.test";

  it("EMI-01 S05 paid: Agenzia Uno has it to issue", async () => {
    elena = await privateCustomer("kc-elena-sala", EMAIL, "Elena");
    ({ requestId, offerIds: offers } = await paidRequest(elena, EMAIL));
    const request = await system((tx) =>
      tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } }),
    );
    expect(request.status).toBe("IN_ISSUANCE");
  });

  it("EMI-03 EMI-04 EMI-05 decision 27 S05 the agency cannot issue; the back office finds its fault: 100,00 € replaces 25,00 €", async () => {
    // EMI-03: the worker proposed the penalty for the delay at the deadline.
    await system((tx) =>
      tx.penalty.create({
        data: {
          organizationId: orgId("agenzia-uno"),
          type: "LATE_ISSUANCE",
          amountCents: 2500,
          quoteRequestId: requestId,
          reason: "EMI-03",
          proposedAt: new Date("2026-11-24T10:00:00Z"),
        },
      }),
    );
    await r.json(
      await r.call(
        await who("agenzia-uno-owner", "agenzia-uno"),
        `/agency/issuance/${requestId}/problem`,
        {
          body: { type: "CANNOT_ISSUE", description: "La compagnia non accetta il rischio" },
        },
      ),
      201,
    );
    const problems = await r.json<{ id: string; code: string; status: string }[]>(
      await r.call(await who("bo-verifier", "astax"), "/back-office/issuance-problems"),
      200,
    );
    const problem = problems.find((p) => p.status === "OPEN" && p.code.length > 0 && p.id);
    const mine = await system((tx) =>
      tx.issuanceProblem.findFirstOrThrow({ where: { quoteRequestId: requestId, status: "OPEN" } }),
    );
    expect(problem).toBeTruthy();
    const decided = await r.json<{ outcome: string }>(
      await r.call(
        await who("bo-verifier", "astax"),
        `/back-office/issuance-problems/${mine.id}/decide`,
        {
          body: { fault: "AGENCY", reason: "La compagnia era a mandato, l'agenzia non ha emesso" },
        },
      ),
      200,
    );
    expect(decided.outcome).toBe("SECOND_OFFER");
    const [penalties, uno, request, proposal] = await system((tx) =>
      Promise.all([
        tx.penalty.findMany({
          where: { quoteRequestId: requestId },
          orderBy: { createdAt: "asc" },
        }),
        tx.offer.findUniqueOrThrow({ where: { id: offers[0] } }),
        tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } }),
        tx.nextOfferProposal.findFirstOrThrow({ where: { quoteRequestId: requestId } }),
      ]),
    );
    expect(penalties.map((p) => [p.type, p.status, p.amountCents])).toEqual([
      ["LATE_ISSUANCE", "CANCELLED", 2500],
      ["MISSED_ISSUANCE", "PROPOSED", 10000],
    ]);
    expect(uno.status).toBe("MISSED_ISSUANCE");
    expect(request.status).toBe("ACCEPTED");
    // S05: Agenzia Due's Alfa 520,00 €, 20,00 € to pay, the fee unchanged.
    expect(proposal).toMatchObject({
      kind: "SECOND_OFFER",
      toOfferId: offers[1],
      premiumCents: 52000,
      feeCents: 3000,
      differenceCents: 2000,
      status: "PROPOSED",
    });
    const view = await r.json<{ company: string; differenceCents: number }>(
      await r.call(elena, `/requests/${requestId}/next-offer`),
      200,
    );
    expect(view).toMatchObject({ company: "Compagnia Alfa", differenceCents: 2000 });
  });

  it("EMI-04 PAG-02 S05 Elena confirms, signs and pays 20,00 €: Agenzia Due wins and has the contacts", async () => {
    const a = await r.json<{ signingUrl: string; premiumCents: number; feeCents: number }>(
      await r.call(elena, `/requests/${requestId}/next-offer/confirm`, {
        body: { returnPath: `/preventivi/${requestId}/accettazione` },
      }),
      200,
    );
    expect(a).toMatchObject({ premiumCents: 52000, feeCents: 3000 });
    // No other offer can be chosen meanwhile.
    const other = await r.call(elena, `/requests/${requestId}/acceptance`, {
      body: { offerId: offers[2], returnPath: "/preventivi" },
    });
    expect(other.status).toBe(409);
    await signAndPay(elena, requestId, refOf(a.signingUrl));
    const [request, payments, due, accepted] = await system((tx) =>
      Promise.all([
        tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } }),
        tx.payment.findMany({
          where: { status: "CAPTURED", acceptance: { quoteRequestId: requestId } },
          orderBy: { capturedAt: "asc" },
        }),
        tx.offer.findUniqueOrThrow({ where: { id: offers[1] } }),
        tx.acceptance.findFirstOrThrow({ where: { quoteRequestId: requestId, status: "PAID" } }),
      ]),
    );
    expect(request.status).toBe("IN_ISSUANCE");
    expect(
      payments.map((p) => [p.premiumCents, p.feeCents]).sort((a, b) => (b[0] ?? 0) - (a[0] ?? 0)),
    ).toEqual([
      [50000, 3000],
      [2000, 0],
    ]);
    expect(due.status).toBe("WINNING");
    expect(accepted.offerId).toBe(offers[1]);
    expect(accepted.issuanceDeadlineAt).not.toBeNull();
    const list = (await (
      await r.call(await who("agenzia-due-owner", "agenzia-due"), "/agency/to-issue")
    ).json()) as { email: string | null }[];
    expect(list.some((x) => x.email === EMAIL)).toBe(true);
    const uno = (await (
      await r.call(await who("agenzia-uno-owner", "agenzia-uno"), "/agency/to-issue")
    ).json()) as { email: string | null }[];
    expect(JSON.stringify(uno)).not.toContain(EMAIL);
  });
});

describe("fase 6: S05 variant, the customer refuses and gets everything back", () => {
  let customer: Who;
  let requestId: string;
  const EMAIL = "marco.sala@example.test";

  it("PAG-04 PAG-05 S05 refused: the full refund of 530,00 €, approved by the supervisor; «Annullata»; EMI-06 the third missed issuance suspends", async () => {
    customer = await privateCustomer("kc-marco-sala", EMAIL, "Marco");
    ({ requestId } = await paidRequest(customer, EMAIL));
    // EMI-06: two earlier missed issuances of Agenzia Uno in the last six months.
    await system((tx) =>
      tx.penalty.createMany({
        data: ["2026-08-10T10:00:00Z", "2026-10-01T10:00:00Z"].map((at) => ({
          organizationId: orgId("agenzia-uno"),
          type: "MISSED_ISSUANCE" as const,
          amountCents: 10000,
          reason: "EMI-04",
          proposedAt: new Date(at),
        })),
      }),
    );
    await r.json(
      await r.call(
        await who("agenzia-uno-owner", "agenzia-uno"),
        `/agency/issuance/${requestId}/problem`,
        {
          body: { type: "CANNOT_ISSUE", description: "La compagnia non accetta il rischio" },
        },
      ),
      201,
    );
    const problem = await system((tx) =>
      tx.issuanceProblem.findFirstOrThrow({ where: { quoteRequestId: requestId, status: "OPEN" } }),
    );
    await r.json(
      await r.call(
        await who("bo-verifier", "astax"),
        `/back-office/issuance-problems/${problem.id}/decide`,
        {
          body: { fault: "AGENCY", reason: "Colpa dell'agenzia" },
        },
      ),
      200,
    );
    const suspension = await system((tx) =>
      tx.agencySuspension.findFirst({
        where: { organizationId: orgId("agenzia-uno"), revokedAt: null },
      }),
    );
    expect(suspension).not.toBeNull();
    const refused = await r.json<{ refundId: string }>(
      await r.call(customer, `/requests/${requestId}/next-offer/refuse`, { body: {} }),
      200,
    );
    const refund = await system((tx) =>
      tx.refund.findUniqueOrThrow({ where: { id: refused.refundId } }),
    );
    expect(refund).toMatchObject({
      reason: "BEFORE_ISSUANCE",
      premiumCents: 50000,
      feeCents: 3000,
      status: "REQUESTED",
    });
    // PAG-05: only the supervisor approves.
    const verifier = await r.call(
      await who("bo-verifier", "astax"),
      `/back-office/refunds/${refund.id}/approve`,
      {
        body: {},
      },
    );
    expect(verifier.status).toBe(403);
    await r.json(
      await r.call(
        await who("bo-supervisor", "astax"),
        `/back-office/refunds/${refund.id}/approve`,
        {
          body: {},
        },
      ),
      200,
    );
    const [request, payment, invoices] = await system((tx) =>
      Promise.all([
        tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } }),
        tx.payment.findFirstOrThrow({ where: { id: refund.paymentId } }),
        tx.invoice.count({ where: { quoteRequestId: requestId } }),
      ]),
    );
    expect(request.status).toBe("CANCELLED");
    expect(payment.status).toBe("REFUNDED");
    // Decision 24: no invoice before the issuance, so none to cancel.
    expect(invoices).toBe(0);
    const again = await r.call(
      await who("bo-supervisor", "astax"),
      `/back-office/refunds/${refund.id}/approve`,
      {
        body: {},
      },
    );
    expect(again.status).toBe(409);
  });
});
