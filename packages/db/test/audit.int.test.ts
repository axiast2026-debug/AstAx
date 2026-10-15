import type { AuditEntryContent } from "@astax/shared/audit";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appendAudit,
  SYSTEM_CONTEXT,
  verifyAuditLog,
  withContext,
  type DbClient,
} from "../src/index.js";
import {
  appDb,
  asMember,
  asPrivate,
  createWorld,
  ownerDb,
  superDb,
  type World,
} from "./fixtures.js";

let db: DbClient;
let owner: DbClient;
let superuser: DbClient;
let w: World;
let minute = 0;

function entry(overrides: Partial<AuditEntryContent> = {}): AuditEntryContent {
  minute += 1;
  return {
    at: new Date(Date.UTC(2026, 10, 16, 9, 0, minute)),
    actorUserId: w.ownerUno,
    actorMembershipId: null,
    actorOrganizationId: w.agenziaUno,
    action: "QUOTE_REQUEST_VIEWED",
    targetType: "QuoteRequest",
    targetId: "req-1",
    before: null,
    after: { status: "AUCTION_OPEN", nested: { b: 2, a: 1 } },
    reason: null,
    ip: "203.0.113.10",
    userAgent: "vitest",
    ...overrides,
  };
}

beforeAll(async () => {
  db = appDb();
  owner = ownerDb();
  superuser = superDb();
  w = await createWorld(db);
});

afterAll(async () => {
  await Promise.all([db.$disconnect(), owner.$disconnect(), superuser.$disconnect()]);
});

describe("SIC-04 audit log in the database", () => {
  it("appends chained entries that verify", async () => {
    await withContext(db, asMember(w.ownerUno, w.agenziaUno), async (tx) => {
      await appendAudit(tx, entry());
      await appendAudit(tx, entry({ action: "SEALED_BID_ACCESS_DENIED", targetType: "Offer" }));
    });
    const check = await verifyAuditLog(db);
    expect(check.ok).toBe(true);
    expect(check.checked).toBeGreaterThanOrEqual(2);
  });

  it("a writer who cannot read the log can still append to it (private customer)", async () => {
    await withContext(db, asPrivate(w.giuliaNeri), (tx) =>
      appendAudit(tx, entry({ actorUserId: w.giuliaNeri, actorOrganizationId: null })),
    );
    expect((await verifyAuditLog(db)).ok).toBe(true);
  });

  it("keeps the chain valid with concurrent writers", async () => {
    await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        withContext(db, asMember(w.ownerDue, w.agenziaDue), (tx) =>
          appendAudit(
            tx,
            entry({
              actorUserId: w.ownerDue,
              actorOrganizationId: w.agenziaDue,
              targetId: `c-${i}`,
            }),
          ),
        ),
      ),
    );
    expect((await verifyAuditLog(db)).ok).toBe(true);
  });

  it("UPDATE and DELETE fail for the application", async () => {
    await expect(
      withContext(db, SYSTEM_CONTEXT, (tx) => tx.auditLog.updateMany({ data: { reason: "x" } })),
    ).rejects.toThrow(/permission denied/i);
    await expect(withContext(db, SYSTEM_CONTEXT, (tx) => tx.auditLog.deleteMany())).rejects.toThrow(
      /permission denied/i,
    );
  });

  it("UPDATE, DELETE and TRUNCATE fail even for the schema owner", async () => {
    await expect(owner.auditLog.updateMany({ data: { reason: "x" } })).rejects.toThrow(
      /append-only/,
    );
    await expect(owner.auditLog.deleteMany()).rejects.toThrow(/append-only/);
    await expect(owner.$executeRawUnsafe('TRUNCATE "AuditLog"')).rejects.toThrow(/append-only/);
  });

  it("refuses an entry that does not link to the last one", async () => {
    await expect(
      withContext(db, SYSTEM_CONTEXT, (tx) =>
        tx.auditLog.create({
          data: {
            ...entry(),
            before: undefined,
            after: undefined,
            prevHash: "f".repeat(64),
            hash: "e".repeat(64),
          },
        }),
      ),
    ).rejects.toThrow(/does not link/);
  });

  it("an agency reads only its own organization's entries", async () => {
    const rows = await withContext(db, asMember(w.ownerUno, w.agenziaUno), (tx) =>
      tx.auditLog.findMany(),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.actorOrganizationId === w.agenziaUno)).toBe(true);
  });

  it("pnpm audit:verify finds a row altered behind the triggers' back", async () => {
    const target = await withContext(db, SYSTEM_CONTEXT, (tx) =>
      tx.auditLog.findFirstOrThrow({ orderBy: { seq: "asc" }, skip: 1 }),
    );
    const total = await withContext(db, SYSTEM_CONTEXT, (tx) => tx.auditLog.count());
    const position = await withContext(db, SYSTEM_CONTEXT, (tx) =>
      tx.auditLog.count({ where: { seq: { lt: target.seq } } }),
    );

    const tamper = (reason: string | null) =>
      superuser.$transaction([
        superuser.$executeRawUnsafe(
          'ALTER TABLE "AuditLog" DISABLE TRIGGER audit_log_no_update_delete',
        ),
        superuser.$executeRaw`UPDATE "AuditLog" SET "reason" = ${reason} WHERE "seq" = ${target.seq}`,
        superuser.$executeRawUnsafe(
          'ALTER TABLE "AuditLog" ENABLE TRIGGER audit_log_no_update_delete',
        ),
      ]);

    await tamper("rewritten by a database administrator");
    try {
      expect(await verifyAuditLog(db)).toMatchObject({
        ok: false,
        index: position,
        problem: "HASH_MISMATCH",
      });
    } finally {
      await tamper(target.reason);
    }
    expect(await verifyAuditLog(db)).toEqual({
      ok: true,
      checked: total,
      lastHash: expect.any(String),
    });
  });
});
