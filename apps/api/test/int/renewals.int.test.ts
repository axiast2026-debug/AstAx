import { randomUUID } from "node:crypto";
import { LocalFieldCipher } from "@astax/adapters/crypto";
import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { addCalendarDays, type QuoteDraft } from "@astax/shared/domain";
import { romeCalendarDate } from "@astax/shared/format";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  acceptAllLegal,
  membershipId,
  orgId,
  startHarness,
  TEST_CIPHER_KEYS,
  type Harness,
} from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 6, step 10: «Rinnova in asta» (spec 03, process 10, proposal E): the
// renewal draft filled with the saved data, the new start the day after the
// end, the registration and licences kept, the new risk certificate missing.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);
const cipher = new LocalFieldCipher(TEST_CIPHER_KEYS.encryption, TEST_CIPHER_KEYS.blindIndex);
const EMAIL = "privato.rinnovo@example.test";
let customer: Who;

async function policyEndingIn(days: number) {
  const request = await r.submittedPrivateRequest(customer, EMAIL);
  const today = romeCalendarDate(h.clock.now());
  const end = addCalendarDays(today, days);
  const policy = await system(async (tx) => {
    const company = await tx.insuranceCompany.findFirstOrThrow({
      where: { name: "Compagnia Alfa" },
    });
    const owner = await tx.quoteRequest.findUniqueOrThrow({ where: { id: request.id } });
    return tx.policy.create({
      data: {
        quoteRequestId: request.id,
        offerId: randomUUID(),
        acceptanceId: randomUUID(),
        organizationId: orgId("agenzia-uno"),
        companyId: company.id,
        ownerUserId: owner.ownerUserId,
        policyNumber: `RIN-${days}-${randomUUID().slice(0, 8)}`,
        startDate: new Date(addCalendarDays(end, -364)),
        endDate: new Date(end),
        premiumCents: 52_300,
        issuedAt: h.clock.now(),
        issuedByUserId: randomUUID(),
        status: "ACTIVE",
      },
    });
  });
  return { policy, end, requestId: request.id };
}

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  await acceptAllLegal(h, "bo-verifier");
  customer = {
    token: await h.token({
      sub: "kc-private-renewal-test",
      azp: "astax-web-private",
      roles: ["astax-private"],
      email: EMAIL,
      givenName: "Rita",
      familyName: "Rinnovo",
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

describe("process 10 «Rinnova in asta»", () => {
  it("not before renewal.daysBefore the end", async () => {
    const { policy } = await policyEndingIn(45);
    const early = await r.json<{ errors: { issue: string }[] }>(
      await r.call(customer, `/policies/${policy.id}/renew`, { body: {} }),
      409,
    );
    expect(early.errors[0]?.issue).toBe("NOT_RENEWABLE_YET");
  });

  it("a draft with the saved data: start the day after the end, current insurer and premium, documents kept but the risk certificate", async () => {
    const { policy, end, requestId } = await policyEndingIn(20);
    const listed = await r.json<{ id: string; renewable: boolean }[]>(
      await r.call(customer, "/policies"),
      200,
    );
    expect(listed.find((p) => p.id === policy.id)?.renewable).toBe(true);
    const created = await r.json<{ requestId: string; code: string }>(
      await r.call(customer, `/policies/${policy.id}/renew`, { body: {} }),
      201,
    );
    const [draft, kept, linked] = await system((tx) =>
      Promise.all([
        tx.quoteRequest.findUniqueOrThrow({ where: { id: created.requestId } }),
        tx.document.findMany({ where: { quoteRequestId: created.requestId } }),
        tx.policy.findUniqueOrThrow({ where: { id: policy.id } }),
      ]),
    );
    expect(draft).toMatchObject({
      status: "DRAFT",
      renewalOfPolicyId: policy.id,
      channel: "PRIVATE",
    });
    expect(draft.code).not.toBe("");
    expect(linked.renewalRequestId).toBe(created.requestId);
    const data = JSON.parse(cipher.decrypt(draft.draftEnc ?? "")) as QuoteDraft;
    expect(data.request?.startDate).toBe(addCalendarDays(end, 1));
    expect(data.request?.currentPremiumCents).toBe(52_300);
    expect(data.history?.currentInsurer).toBe("Compagnia Alfa");
    expect(data.history?.currentExpiryDate).toBe(end);
    expect(kept.map((d) => d.kind).sort()).toEqual(["DRIVING_LICENCE", "REGISTRATION_CERTIFICATE"]);
    const original = await system((tx) =>
      tx.document.findMany({ where: { quoteRequestId: requestId } }),
    );
    // New objects, not the same keys (a document belongs to one request).
    expect(kept.some((d) => original.some((o) => o.storageKey === d.storageKey))).toBe(false);
    // The requester sees the draft as its own request.
    const mine = await r.call(customer, `/requests/${created.requestId}`);
    expect(mine.status).toBe(200);
    // Once per policy: the same draft again.
    const again = await r.json<{ requestId: string }>(
      await r.call(customer, `/policies/${policy.id}/renew`, { body: {} }),
      201,
    );
    expect(again.requestId).toBe(created.requestId);
    // PolicyWorkflow is told (outbox).
    const event = await system((tx) =>
      tx.domainEvent.findFirst({ where: { type: "PolicyChanged", aggregateId: requestId } }),
    );
    expect(event).not.toBeNull();
  });

  it("another user cannot renew someone else's policy", async () => {
    const { policy } = await policyEndingIn(10);
    const broker = {
      token: await h.tokenFor("broker-owner"),
      context: membershipId("broker-owner", "broker-demo"),
    };
    await acceptAllLegal(h, "broker-owner");
    expect((await r.call(broker, `/policies/${policy.id}/renew`, { body: {} })).status).toBe(404);
    expect(
      (await r.call(broker, `/policies/${policy.id}/auto-renewal`, { body: { enabled: true } }))
        .status,
    ).toBe(404);
    expect(
      await system((tx) =>
        tx.auditLog.count({ where: { action: "ACCESS_DENIED", targetId: policy.id } }),
      ),
    ).toBe(2);
  });
});
