import { randomUUID } from "node:crypto";
import { prepareRemittances, SYSTEM_CONTEXT, withContext } from "@astax/db";
import { addCalendarDays } from "@astax/shared/domain";
import { romeCalendarDate } from "@astax/shared/format";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, orgId, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 6, step 11, S08: the withdrawal within the term (PAG-04, PAG-05,
// CONT-01). The agency indicates the refundable premium, the supervisor
// approves; the customer gets that premium, the fee stays (no credit note);
// the policy «Receduta», the request «Annullata»; the next remittance of the
// agency holds the premium back.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);
const EMAIL = "privato.recesso@example.test";
let customer: Who;
const who = async (key: Parameters<Harness["tokenFor"]>[0], org: string): Promise<Who> => ({
  token: await h.tokenFor(key),
  context: membershipId(key, org),
});

async function issuedPolicy(agency: string) {
  const request = await r.submittedPrivateRequest(customer, EMAIL);
  return system(async (tx) => {
    const q = await tx.quoteRequest.update({
      where: { id: request.id },
      data: { status: "ISSUED" },
    });
    const company = await tx.insuranceCompany.findFirstOrThrow({
      where: { name: "Compagnia Alfa" },
    });
    const acceptance = await tx.acceptance.create({
      data: {
        quoteRequestId: q.id,
        offerId: randomUUID(),
        ownerUserId: q.ownerUserId,
        acceptedByUserId: q.requesterUserId,
        premiumCents: 52_000,
        feeCents: 3500,
        feeRule: "PRIVATE",
        aiUsed: true,
        status: "PAID",
        paidAt: h.clock.now(),
      },
    });
    const payment = await tx.payment.create({
      data: {
        acceptanceId: acceptance.id,
        ownerUserId: q.ownerUserId,
        provider: "fake-payments",
        providerRef: `pay-${acceptance.id}`,
        premiumCents: 52_000,
        feeCents: 3500,
        idempotencyKey: `${acceptance.id}-1`,
        status: "CAPTURED",
        capturedAt: h.clock.now(),
      },
    });
    const policy = await tx.policy.create({
      data: {
        quoteRequestId: q.id,
        offerId: acceptance.offerId,
        acceptanceId: acceptance.id,
        organizationId: orgId(agency),
        companyId: company.id,
        ownerUserId: q.ownerUserId,
        policyNumber: `REC-${randomUUID().slice(0, 8)}`,
        startDate: new Date(romeCalendarDate(h.clock.now())),
        endDate: new Date(addCalendarDays(romeCalendarDate(h.clock.now()), 364)),
        premiumCents: 52_000,
        issuedAt: h.clock.now(),
        issuedByUserId: randomUUID(),
      },
    });
    return { requestId: q.id, policy, payment };
  });
}

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  for (const key of [
    "bo-verifier",
    "bo-supervisor",
    "bo-support",
    "agenzia-tre-owner",
    "agenzia-nove-owner",
  ] as const) {
    await acceptAllLegal(h, key);
  }
  customer = {
    token: await h.token({
      sub: "kc-private-withdrawal-test",
      azp: "astax-web-private",
      roles: ["astax-private"],
      email: EMAIL,
      givenName: "Giulia",
      familyName: "Recesso",
    }),
  };
  const pending = (await (await h.call("/legal/pending", customer)).json()) as {
    versionId: string;
  }[];
  await h.call("/legal/acceptances", {
    ...customer,
    body: { versionIds: pending.map((p) => p.versionId) },
  });
});

afterAll(async () => {
  await h.close();
});

const setByCustomer = (value: boolean) =>
  system(async (tx) => {
    const count = await tx.setting.count({ where: { key: "withdrawal.byCustomer" } });
    await tx.setting.create({
      data: {
        key: "withdrawal.byCustomer",
        value,
        version: count + 1,
        validFrom: new Date(h.clock.now().getTime() - 1000),
        reason: "test",
      },
    });
  });

describe("question 18: by default the customer withdraws outside the platform", () => {
  it("PAG-04 withdrawal.byCustomer off: the request is refused and the policy points to the agency", async () => {
    const { policy } = await issuedPolicy("agenzia-tre");
    const refused = await r.json<{ errors: { issue: string }[] }>(
      await r.call(customer, `/policies/${policy.id}/withdrawal`, { body: {} }),
      409,
    );
    expect(refused.errors[0]?.issue).toBe("NOT_ON_PLATFORM");
    const listed = await r.json<
      { id: string; withdrawable: boolean; withdrawalOutside: boolean }[]
    >(await r.call(customer, "/policies"), 200);
    expect(listed.find((p) => p.id === policy.id)).toMatchObject({
      withdrawable: false,
      withdrawalOutside: true,
    });
    await setByCustomer(true);
  });
});

describe("S08 the withdrawal within the term (withdrawal.byCustomer on)", () => {
  it("S08 PAG-04 PAG-05 the agency prices 497 €, the supervisor approves: refund, «Receduta», «Annullata», recovery in the remittance", async () => {
    const { requestId, policy, payment } = await issuedPolicy("agenzia-tre");
    const asked = await r.json<{ id: string; status: string }>(
      await r.call(customer, `/policies/${policy.id}/withdrawal`, { body: {} }),
      201,
    );
    expect(asked.status).toBe("REQUESTED");
    const twice = await r.json<{ errors: { issue: string }[] }>(
      await r.call(customer, `/policies/${policy.id}/withdrawal`, { body: {} }),
      409,
    );
    expect(twice.errors[0]?.issue).toBe("ALREADY_REQUESTED");
    const told = await system((tx) =>
      tx.notification.count({
        where: {
          eventKey: "withdrawal.requested.agency",
          payload: { path: ["withdrawalId"], equals: asked.id },
        },
      }),
    );
    expect(told).toBeGreaterThan(0);

    // Rule 4: another agency cannot price it; the attempt is in the audit log.
    const other = await r.call(
      await who("agenzia-nove-owner", "agenzia-nove"),
      `/agency/withdrawals/${asked.id}/price`,
      { body: { refundableCents: 100 } },
    );
    expect(other.status).toBe(404);
    expect(
      await system((tx) =>
        tx.auditLog.count({ where: { action: "ACCESS_DENIED", targetId: asked.id } }),
      ),
    ).toBe(1);
    const agency = await who("agenzia-tre-owner", "agenzia-tre");
    const listed = await r.json<{ id: string; status: string }[]>(
      await r.call(agency, "/agency/withdrawals"),
      200,
    );
    expect(listed.find((w) => w.id === asked.id)?.status).toBe("REQUESTED");
    const tooMuch = await r.call(agency, `/agency/withdrawals/${asked.id}/price`, {
      body: { refundableCents: 60_000 },
    });
    expect(tooMuch.status).toBe(400);
    await r.json(
      await r.call(agency, `/agency/withdrawals/${asked.id}/price`, {
        body: { refundableCents: 49_700 },
      }),
      200,
    );
    const refund = await system((tx) =>
      tx.refund.findFirstOrThrow({ where: { quoteRequestId: requestId, reason: "WITHDRAWAL" } }),
    );
    expect(refund).toMatchObject({
      premiumCents: 49_700,
      feeCents: 0,
      recoverFromOrganizationId: orgId("agenzia-tre"),
      status: "REQUESTED",
    });
    // PAG-05: only the supervisor approves.
    const bySupport = await r.call(
      await who("bo-support", "astax"),
      `/back-office/refunds/${refund.id}/approve`,
      { body: {} },
    );
    expect(bySupport.status).toBe(403);
    await r.json(
      await r.call(
        await who("bo-supervisor", "astax"),
        `/back-office/refunds/${refund.id}/approve`,
        { body: {} },
      ),
      200,
    );
    const [after, request, paid, withdrawal, credit] = await system((tx) =>
      Promise.all([
        tx.policy.findUniqueOrThrow({ where: { id: policy.id } }),
        tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } }),
        tx.payment.findUniqueOrThrow({ where: { id: payment.id } }),
        tx.consumerWithdrawal.findUniqueOrThrow({ where: { id: asked.id } }),
        tx.invoice.count({ where: { series: "N", quoteRequestId: requestId } }),
      ]),
    );
    expect(after.status).toBe("WITHDRAWN");
    expect(request.status).toBe("CANCELLED");
    expect(paid.status).toBe("PARTIALLY_REFUNDED");
    expect(withdrawal.status).toBe("APPROVED");
    // The fee of 35 € stays: no credit note.
    expect(credit).toBe(0);

    // CONT-01: the next remittance of the agency holds back −497,00 €.
    const nextMonday = (() => {
      let d = addCalendarDays(romeCalendarDate(h.clock.now()), 1);
      while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 1) d = addCalendarDays(d, 1);
      return d;
    })();
    await system((tx) => prepareRemittances(tx, nextMonday, h.clock.now()));
    const line = await system((tx) =>
      tx.remittanceLine.findFirst({ where: { kind: "RECOVERY", ref: refund.id } }),
    );
    expect(line?.requestedCents).toBe(49_700);
  });

  it("PAG-04 outside withdrawal.days of the issuance the withdrawal is refused", async () => {
    const { policy } = await issuedPolicy("agenzia-tre");
    const saved = h.clock.now();
    h.clock.set(new Date(saved.getTime() + 15 * 86_400_000));
    try {
      customer.token = await h.token({
        sub: "kc-private-withdrawal-test",
        azp: "astax-web-private",
        roles: ["astax-private"],
        email: EMAIL,
        givenName: "Giulia",
        familyName: "Recesso",
      });
      const late = await r.json<{ errors: { issue: string }[] }>(
        await r.call(customer, `/policies/${policy.id}/withdrawal`, { body: {} }),
        409,
      );
      expect(late.errors[0]?.issue).toBe("OUT_OF_TERM");
    } finally {
      h.clock.set(saved);
    }
  });
});
