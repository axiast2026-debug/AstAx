import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, orgId, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 7, spec 06 «Agenzie e broker» and spec 07: the list with
// participation and penalties, suspension and reactivation with a reason,
// notes, the exclusion proposed by the back office and decided by the admin.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
let supervisor: Who;
let admin: Who;
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  await acceptAllLegal(h, "bo-supervisor");
  await acceptAllLegal(h, "admin");
  supervisor = {
    token: await h.tokenFor("bo-supervisor"),
    context: membershipId("bo-supervisor", "astax"),
  };
  admin = { token: await h.tokenFor("admin"), context: membershipId("admin", "astax") };
});

afterAll(async () => {
  await h.close();
});

describe("phase 7 agencies and brokers", () => {
  it("lists them with participation counts, never offer contents", async () => {
    const list = await r.json<
      { id: string; legalName: string; invitations: number; offers: number; wins: number }[]
    >(await r.call(supervisor, "/back-office/organizations?type=AGENCY"), 200);
    expect(list.map((o) => o.legalName)).toContain("Agenzia Nove");
    expect(list.every((o) => typeof o.invitations === "number")).toBe(true);
    expect(JSON.stringify(list)).not.toMatch(/premium|Cents/);
  });

  it("an agency suspended by hand gets no new invitations and is reactivated with a reason", async () => {
    const id = orgId("agenzia-nove");
    const noReason = await r.call(supervisor, `/back-office/organizations/${id}/suspend`, {
      body: {},
    });
    expect(noReason.status).toBe(400);
    await r.json(
      await r.call(supervisor, `/back-office/organizations/${id}/suspend`, {
        body: { reason: "Documenti scaduti" },
      }),
      200,
    );
    const live = await system((tx) =>
      tx.agencySuspension.findFirst({ where: { organizationId: id, revokedAt: null } }),
    );
    expect(live?.confirmedAt).not.toBeNull();
    // Its users keep working on what is in progress: the organization stays active.
    const org = await system((tx) => tx.organization.findUniqueOrThrow({ where: { id } }));
    expect(org.status).toBe("ACTIVE");
    const again = await r.call(supervisor, `/back-office/organizations/${id}/suspend`, {
      body: { reason: "Di nuovo" },
    });
    expect(again.status).toBe(409);

    await r.json(
      await r.call(supervisor, `/back-office/organizations/${id}/reactivate`, {
        body: { reason: "Documenti rinnovati" },
      }),
      200,
    );
    const detail = await r.json<{ history: { action: string; reason: string }[] }>(
      await r.call(supervisor, `/back-office/organizations/${id}`),
      200,
    );
    expect(detail.history.map((x) => x.action)).toEqual([
      "ORGANIZATION_REACTIVATED",
      "ORGANIZATION_SUSPENDED",
    ]);
  });

  it("the back office proposes an exclusion; only the administrator decides it", async () => {
    const id = await system(
      async (tx) =>
        (
          await tx.organization.create({
            data: { type: "AGENCY", legalName: "Agenzia Da Escludere", status: "ACTIVE" },
          })
        ).id,
    );
    await r.json(
      await r.call(supervisor, `/back-office/organizations/${id}/notes`, {
        body: { kind: "NOTE", text: "Chiamata al titolare: nessuna risposta." },
      }),
      201,
    );
    await r.json(
      await r.call(supervisor, `/back-office/organizations/${id}/notes`, {
        body: { kind: "EXCLUSION_PROPOSAL", text: "Tre mancate emissioni in un mese." },
      }),
      201,
    );
    const twice = await r.call(supervisor, `/back-office/organizations/${id}/notes`, {
      body: { kind: "EXCLUSION_PROPOSAL", text: "Ancora." },
    });
    expect(twice.status).toBe(409);
    // The supervisor cannot decide it.
    expect((await r.call(supervisor, "/admin/exclusion-proposals")).status).toBe(403);

    const proposals = await r.json<{ id: string; organizationId: string }[]>(
      await r.call(admin, "/admin/exclusion-proposals"),
      200,
    );
    const proposal = proposals.find((p) => p.organizationId === id);
    await r.json(
      await r.call(admin, `/admin/exclusion-proposals/${proposal?.id}/decide`, {
        body: { accept: true, reason: "Violazioni ripetute dell'accordo" },
      }),
      200,
    );
    const org = await system((tx) => tx.organization.findUniqueOrThrow({ where: { id } }));
    expect(org).toMatchObject({
      status: "EXCLUDED",
      statusReason: "Violazioni ripetute dell'accordo",
    });
    const reactivate = await r.call(supervisor, `/back-office/organizations/${id}/reactivate`, {
      body: { reason: "Prova" },
    });
    expect(reactivate.status).toBe(409);
  });
});
