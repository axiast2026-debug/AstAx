import { loadAgencyCandidates, SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, orgId, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 6: the cycle of a penalty (EMI-05, decision 29) and the suspension
// confirmed or revoked by the administrator (EMI-06, decision 30).
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);
const who = async (key: Parameters<Harness["tokenFor"]>[0], org: string): Promise<Who> => ({
  token: await h.tokenFor(key),
  context: membershipId(key, org),
});

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  for (const key of ["bo-verifier", "bo-supervisor", "admin", "agenzia-nove-owner"] as const) {
    await acceptAllLegal(h, key);
  }
});

afterAll(async () => {
  await h.close();
});

describe("EMI-05 the cycle of a penalty", () => {
  let penaltyId: string;

  it("EMI-05 proposed by the back office; only the supervisor applies; the agency has 10 days", async () => {
    const proposed = await r.json<{ id: string }>(
      await r.call(await who("bo-verifier", "astax"), "/back-office/penalties", {
        body: {
          organizationId: orgId("agenzia-nove"),
          type: "LATE_ISSUANCE",
          reason: "Termine superato di un giorno",
        },
      }),
      201,
    );
    penaltyId = proposed.id;
    const byVerifier = await r.call(
      await who("bo-verifier", "astax"),
      `/back-office/penalties/${penaltyId}/apply`,
      { body: {} },
    );
    expect(byVerifier.status).toBe(403);
    await r.json(
      await r.call(
        await who("bo-supervisor", "astax"),
        `/back-office/penalties/${penaltyId}/apply`,
        {
          body: {},
        },
      ),
      200,
    );
    const penalty = await system((tx) =>
      tx.penalty.findUniqueOrThrow({ where: { id: penaltyId } }),
    );
    expect(penalty).toMatchObject({ status: "APPLIED", amountCents: 2500 });
    expect((penalty.contestUntil?.getTime() ?? 0) - (penalty.appliedAt?.getTime() ?? 0)).toBe(
      10 * 86_400_000,
    );
    const note = await system((tx) =>
      tx.notification.findFirst({
        where: { eventKey: "penalty.applied", payload: { path: ["penaltyId"], equals: penaltyId } },
      }),
    );
    expect(note).not.toBeNull();
  });

  it("EMI-05 the agency contests within the time; the administrator decides", async () => {
    const owner = await who("agenzia-nove-owner", "agenzia-nove");
    const mine = await r.json<{ id: string; status: string }[]>(
      await r.call(owner, "/agency/penalties"),
      200,
    );
    expect(mine.find((p) => p.id === penaltyId)?.status).toBe("APPLIED");
    await r.json(
      await r.call(owner, `/agency/penalties/${penaltyId}/contest`, {
        body: { text: "Il cliente ha cambiato la decorrenza al telefono" },
      }),
      200,
    );
    const bySupervisor = await r.call(
      await who("bo-supervisor", "astax"),
      `/admin/penalties/${penaltyId}/decide`,
      { body: { outcome: "CANCELLED", decision: "x" } },
    );
    expect(bySupervisor.status).toBe(403);
    await r.json(
      await r.call(await who("admin", "astax"), `/admin/penalties/${penaltyId}/decide`, {
        body: { outcome: "UPHELD", decision: "La decorrenza non era cambiata nei dati" },
      }),
      200,
    );
    const penalty = await system((tx) =>
      tx.penalty.findUniqueOrThrow({ where: { id: penaltyId } }),
    );
    expect(penalty).toMatchObject({
      status: "UPHELD",
      decision: "La decorrenza non era cambiata nei dati",
    });
  });

  it("EMI-05 after 10 days the penalty can no longer be contested", async () => {
    const proposed = await r.json<{ id: string }>(
      await r.call(await who("bo-verifier", "astax"), "/back-office/penalties", {
        body: {
          organizationId: orgId("agenzia-nove"),
          type: "LATE_ISSUANCE",
          reason: "Ritardo",
        },
      }),
      201,
    );
    await r.json(
      await r.call(
        await who("bo-supervisor", "astax"),
        `/back-office/penalties/${proposed.id}/apply`,
        {
          body: {},
        },
      ),
      200,
    );
    const saved = h.clock.now();
    h.clock.set(new Date(saved.getTime() + 10 * 86_400_000 + 60_000));
    try {
      const late = await r.json<{ errors: { issue: string }[] }>(
        await r.call(
          await who("agenzia-nove-owner", "agenzia-nove"),
          `/agency/penalties/${proposed.id}/contest`,
          {
            body: { text: "Troppo tardi" },
          },
        ),
        409,
      );
      expect(late.errors.map((e) => e.issue)).toEqual(["CONTEST_CLOSED"]);
    } finally {
      h.clock.set(saved);
    }
  });
});

describe("EMI-06 the suspension, out of the invitations until revoked", () => {
  it("EMI-06 a suspended agency is not a candidate; the administrator revokes and it is again", async () => {
    const suspension = await system((tx) =>
      tx.agencySuspension.create({
        data: {
          organizationId: orgId("agenzia-nove"),
          reason: "EMI-06",
          startedAt: h.clock.now(),
        },
      }),
    );
    const candidates = () =>
      system((tx) => loadAgencyCandidates(tx, h.clock.now())).then((c) =>
        c.map((x) => x.organizationId),
      );
    expect(await candidates()).not.toContain(orgId("agenzia-nove"));
    await r.json(
      await r.call(await who("admin", "astax"), `/admin/suspensions/${suspension.id}/decide`, {
        body: { outcome: "REVOKE", reason: "Mancate emissioni dovute al cliente" },
      }),
      200,
    );
    expect(await candidates()).toContain(orgId("agenzia-nove"));
    const logged = await system((tx) =>
      tx.auditLog.count({
        where: { action: "AGENCY_SUSPENSION_DECIDED", targetId: orgId("agenzia-nove") },
      }),
    );
    expect(logged).toBe(1);
  });
});
