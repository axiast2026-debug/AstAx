import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SYSTEM_CONTEXT, withContext, type DbClient } from "../src/index.js";
import { appDb, asMember, asPrivate, createWorld, type World } from "./fixtures.js";

let db: DbClient;
let w: World;

beforeAll(async () => {
  db = appDb();
  w = await createWorld(db);
});

afterAll(async () => {
  await db.$disconnect();
});

describe("SIC-02 row level security, as astax_app", () => {
  it("with the context of Agenzia Uno, queries without filters return no rows of Agenzia Due", async () => {
    await withContext(db, asMember(w.ownerUno, w.agenziaUno), async (tx) => {
      const orgs = await tx.organization.findMany();
      expect(orgs.map((o) => o.id)).toEqual([w.agenziaUno]);

      const memberships = await tx.membership.findMany();
      expect(memberships.length).toBeGreaterThan(0);
      expect(memberships.every((m) => m.organizationId === w.agenziaUno)).toBe(true);

      const invites = await tx.teamInvite.findMany();
      expect(invites.map((i) => i.organizationId)).toEqual([w.agenziaUno]);

      const users = await tx.user.findMany();
      expect(users.map((u) => u.id)).not.toContain(w.ownerDue);
      expect(users.map((u) => u.id)).toEqual(expect.arrayContaining([w.ownerUno, w.marcoRossi]));
    });
  });

  it("cannot change or create rows of another organization", async () => {
    await withContext(db, asMember(w.ownerUno, w.agenziaUno), async (tx) => {
      const updated = await tx.organization.updateMany({
        where: { id: w.agenziaDue },
        data: { legalName: "Rubata" },
      });
      expect(updated.count).toBe(0);
      const removed = await tx.membership.deleteMany({ where: { organizationId: w.agenziaDue } });
      expect(removed.count).toBe(0);
    });
    await expect(
      withContext(db, asMember(w.ownerUno, w.agenziaUno), (tx) =>
        tx.membership.create({
          data: { userId: w.ownerUno, organizationId: w.agenziaDue, role: "OWNER" },
        }),
      ),
    ).rejects.toThrow();
  });

  it("Marco Rossi sees only the data of the active context", async () => {
    const inUno = await withContext(db, asMember(w.marcoRossi, w.agenziaUno), (tx) =>
      tx.teamInvite.findMany(),
    );
    expect(inUno.map((i) => i.organizationId)).toEqual([w.agenziaUno]);

    const inTre = await withContext(db, asMember(w.marcoRossi, w.agenziaTre), async (tx) => ({
      invites: await tx.teamInvite.findMany(),
      colleagues: await tx.membership.findMany({ where: { organizationId: w.agenziaUno } }),
    }));
    expect(inTre.invites).toEqual([]);
    // From Agenzia Tre he still sees his own membership in Uno (context selector), not his colleagues there.
    expect(inTre.colleagues.map((m) => m.userId)).toEqual([w.marcoRossi]);
  });

  it("without a context nothing is visible", async () => {
    const result = await withContext(
      db,
      asPrivate("00000000-0000-7000-8000-000000000000"),
      async (tx) => ({
        orgs: await tx.organization.count(),
        memberships: await tx.membership.count(),
        users: await tx.user.count(),
      }),
    );
    expect(result).toEqual({ orgs: 0, memberships: 0, users: 0 });
    // Outside withContext the variables are empty as well.
    expect(await db.organization.count()).toBe(0);
  });

  it("a private user sees only his own user row", async () => {
    const users = await withContext(db, asPrivate(w.giuliaNeri), (tx) => tx.user.findMany());
    expect(users.map((u) => u.id)).toEqual([w.giuliaNeri]);
  });

  it("back office staff and system jobs see every organization", async () => {
    const staff = await withContext(db, asMember(w.boVerifier, w.astax, true), (tx) =>
      tx.organization.findMany({ where: { id: { in: [w.agenziaUno, w.agenziaDue] } } }),
    );
    expect(staff).toHaveLength(2);
    const system = await withContext(db, SYSTEM_CONTEXT, (tx) =>
      tx.organization.count({ where: { id: { in: [w.agenziaUno, w.agenziaDue, w.agenziaTre] } } }),
    );
    expect(system).toBe(3);
  });

  it("the context does not leak to the next transaction on the same pool", async () => {
    await withContext(db, SYSTEM_CONTEXT, (tx) => tx.organization.count());
    expect(
      await withContext(db, asMember(w.ownerDue, w.agenziaDue), (tx) => tx.organization.count()),
    ).toBe(1);
  });

  it("astax_app cannot switch row level security off", async () => {
    await expect(
      withContext(db, asMember(w.ownerUno, w.agenziaUno), async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL row_security = off");
        return tx.organization.findMany();
      }),
    ).rejects.toThrow();
  });

  it("parameter history cannot be rewritten by the application", async () => {
    await withContext(db, SYSTEM_CONTEXT, (tx) =>
      tx.setting.create({
        data: {
          key: "test.rls",
          value: 1,
          version: 1,
          validFrom: new Date("2026-01-01T00:00:00.000Z"),
        },
      }),
    );
    await expect(
      withContext(db, SYSTEM_CONTEXT, (tx) =>
        tx.setting.updateMany({ where: { key: "test.rls" }, data: { value: 2 } }),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
