import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendAudit, asSystem, SYSTEM_CONTEXT, withContext, type DbClient } from "../src/index.js";
import { appDb, asMember, asPrivate, createWorld, type World } from "./fixtures.js";

// Phase 3, before the auctions: row rules that until now only the API enforced
// (migration 20261017080000_row_roles_and_consent).
let db: DbClient;
let w: World;
let customerId: string;
let consentId: string;
const tag = Math.random().toString(36).slice(2, 8);
const AT = "2026-10-17T08:00:00.000Z";

beforeAll(async () => {
  db = appDb();
  w = await createWorld(db);
  ({ customerId, consentId } = await withContext(db, asPrivate(w.giuliaNeri), async (tx) => {
    const person = await tx.person.create({
      data: { ownerUserId: w.giuliaNeri, kind: "PERSON", surname: "Neri", givenName: "Giulia" },
    });
    const customer = await tx.customer.create({
      data: { ownerUserId: w.giuliaNeri, personId: person.id },
    });
    const consent = await asSystem(tx, () =>
      tx.consent.create({
        data: {
          customerId: customer.id,
          ownerUserId: w.giuliaNeri,
          type: "DATA_SHARING_AGENCIES",
          method: "OTP_PRIVATE",
          evidence: {},
          acceptedAt: new Date("2026-10-16T08:00:00.000Z"),
        },
      }),
    );
    return { customerId: customer.id, consentId: consent.id };
  }));
});

afterAll(async () => {
  await db.$disconnect();
});

describe("phase 3: row roles, consents and notifications", () => {
  it("LEG-04: the owner cannot create a consent outside the API's checked step", async () => {
    await expect(
      withContext(db, asPrivate(w.giuliaNeri), (tx) =>
        tx.consent.create({
          data: {
            customerId,
            ownerUserId: w.giuliaNeri,
            type: "DATA_SHARING_AGENCIES",
            method: "OTP_PRIVATE",
            evidence: {},
            acceptedAt: new Date(AT),
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("LEG-04: the owner can only revoke a consent, once, and never delete it", async () => {
    await expect(
      withContext(db, asPrivate(w.giuliaNeri), (tx) =>
        tx.consent.update({
          where: { id: consentId },
          data: { acceptedAt: new Date("2026-10-17T08:00:00.000Z") },
        }),
      ),
    ).rejects.toThrow(/can only be revoked/);
    await expect(
      withContext(db, asPrivate(w.giuliaNeri), (tx) =>
        tx.consent.delete({ where: { id: consentId } }),
      ),
    ).rejects.toThrow(/permission denied/i);
    await withContext(db, asPrivate(w.giuliaNeri), (tx) =>
      tx.consent.update({ where: { id: consentId }, data: { revokedAt: new Date(AT) } }),
    );
    await expect(
      withContext(db, asPrivate(w.giuliaNeri), (tx) =>
        tx.consent.update({ where: { id: consentId }, data: { revokedAt: null } }),
      ),
    ).rejects.toThrow(/can only be revoked/);
  });

  it("a user creates notifications only for themself, unless in the notifier's system step", async () => {
    const note = (userId: string) => ({ userId, eventKey: "test.rls", title: "T", body: "B" });
    await withContext(db, asPrivate(w.giuliaNeri), (tx) =>
      tx.notification.createMany({ data: [note(w.giuliaNeri)] }),
    );
    await expect(
      withContext(db, asPrivate(w.giuliaNeri), (tx) =>
        tx.notification.createMany({ data: [note(w.ownerUno)] }),
      ),
    ).rejects.toThrow();
    await withContext(db, asPrivate(w.giuliaNeri), (tx) =>
      asSystem(tx, () => tx.notification.createMany({ data: [note(w.ownerUno)] })),
    );
  });

  it("asSystem gives the caller's context back afterwards, also when the work fails", async () => {
    await withContext(db, asPrivate(w.giuliaNeri), async (tx) => {
      await expect(asSystem(tx, () => Promise.reject(new Error("work failed")))).rejects.toThrow(
        "work failed",
      );
      const [row] = await tx.$queryRaw<{ value: string }[]>`
        SELECT current_setting('app.is_system', true) AS value`;
      expect(row?.value).toBe("false");
    });
    await withContext(db, SYSTEM_CONTEXT, async (tx) => {
      await asSystem(tx, () => Promise.resolve());
      const [row] = await tx.$queryRaw<{ value: string }[]>`
        SELECT current_setting('app.is_system', true) AS value`;
      expect(row?.value).toBe("true");
    });
  });

  it("rule 7: only the administrator writes parameters and holidays, not the rest of the back office", async () => {
    const setting = (key: string) => ({
      key,
      value: 1,
      version: 1,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
    });
    await expect(
      withContext(db, asMember(w.boVerifier, w.astax, true, "BO_VERIFIER"), (tx) =>
        tx.setting.create({ data: setting(`test.verifier.${tag}`) }),
      ),
    ).rejects.toThrow();
    await expect(
      withContext(db, asMember(w.boVerifier, w.astax, true, "BO_SUPERVISOR"), (tx) =>
        tx.holiday.create({ data: { date: new Date("2031-01-02"), name: `Test ${tag}` } }),
      ),
    ).rejects.toThrow();
    await withContext(db, asMember(w.boVerifier, w.astax, true, "ADMIN"), (tx) =>
      tx.setting.create({ data: setting(`test.admin.${tag}`) }),
    );
  });

  it("VIS-08: the audit log of an organization is read by its owner, not by its operators", async () => {
    await withContext(db, asMember(w.ownerUno, w.agenziaUno), (tx) =>
      appendAudit(tx, {
        at: new Date(AT),
        actorUserId: w.ownerUno,
        actorMembershipId: null,
        actorOrganizationId: w.agenziaUno,
        action: "TEST",
        targetType: null,
        targetId: null,
        before: null,
        after: null,
        reason: null,
        ip: null,
        userAgent: null,
      }),
    );
    const visible = (role: string) =>
      withContext(db, asMember(w.ownerUno, w.agenziaUno, false, role), (tx) =>
        tx.auditLog.count({ where: { actorOrganizationId: w.agenziaUno } }),
      );
    expect(await visible("OWNER")).toBeGreaterThan(0);
    expect(await visible("OPERATOR")).toBe(0);
    const staff = (role: string) =>
      withContext(db, asMember(w.boVerifier, w.astax, true, role), (tx) =>
        tx.auditLog.count({ where: { actorOrganizationId: w.agenziaUno } }),
      );
    expect(await staff("BO_VERIFIER")).toBe(0);
    expect(await staff("BO_SUPERVISOR")).toBeGreaterThan(0);
  });
});
