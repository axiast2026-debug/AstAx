import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  dispatchOutbox,
  recordDomainEvent,
  retryDelayMs,
  SYSTEM_CONTEXT,
  withContext,
  type DbClient,
  type OutboxMessage,
} from "../src/index.js";
import { appDb, asMember, asPrivate, createWorld, type World } from "./fixtures.js";

let db: DbClient;
let w: World;
const T0 = new Date("2026-11-16T09:00:00.000Z");

beforeAll(async () => {
  db = appDb();
  w = await createWorld(db);
});

afterAll(async () => {
  await db.$disconnect();
});

const clearOutbox = () =>
  withContext(db, SYSTEM_CONTEXT, (tx) =>
    tx.outboxEvent.updateMany({ where: { status: "PENDING" }, data: { status: "DELIVERED" } }),
  );

describe("domain events and outbox (fase 1, passo 9)", () => {
  it("are written in the same transaction as the change: a rollback leaves neither", async () => {
    await clearOutbox();
    await expect(
      withContext(db, asMember(w.ownerUno, w.agenziaUno), async (tx) => {
        await tx.membership.updateMany({
          where: { organizationId: w.agenziaUno },
          data: { canIssue: true },
        });
        await recordDomainEvent(tx, {
          aggregateType: "Organization",
          aggregateId: w.agenziaUno,
          type: "membership.updated",
          at: T0,
          actorUserId: w.ownerUno,
        });
        throw new Error("use case failed after writing");
      }),
    ).rejects.toThrow("use case failed");
    const counts = await withContext(db, SYSTEM_CONTEXT, async (tx) => ({
      events: await tx.domainEvent.count({ where: { aggregateId: w.agenziaUno } }),
      outbox: await tx.outboxEvent.count({ where: { status: "PENDING" } }),
    }));
    expect(counts).toEqual({ events: 0, outbox: 0 });
  });

  it("any user may write them, even one who cannot read them back (private customer)", async () => {
    await withContext(db, asPrivate(w.giuliaNeri), (tx) =>
      recordDomainEvent(tx, {
        aggregateType: "User",
        aggregateId: w.giuliaNeri,
        type: "user.legalAccepted",
        at: T0,
        actorUserId: w.giuliaNeri,
      }),
    );
    const visibleToHer = await withContext(db, asPrivate(w.giuliaNeri), (tx) =>
      tx.domainEvent.count(),
    );
    expect(visibleToHer).toBe(0);
  });

  it("the dispatcher delivers each due event once and retries failures with growing delays", async () => {
    await clearOutbox();
    for (const type of ["ok.one", "fails.always", "ok.two"]) {
      await withContext(db, SYSTEM_CONTEXT, (tx) =>
        recordDomainEvent(tx, {
          aggregateType: "Test",
          aggregateId: w.agenziaDue,
          type,
          at: T0,
          actorUserId: null,
        }),
      );
    }
    const seen: OutboxMessage[] = [];
    const handler = async (message: OutboxMessage) => {
      seen.push(message);
      if (message.type === "fails.always") throw new TypeError("provider down");
    };

    expect(await dispatchOutbox(db, handler, { now: T0 })).toEqual({
      delivered: 2,
      retried: 1,
      failed: 0,
    });
    expect(seen.map((m) => m.type).sort()).toEqual(["fails.always", "ok.one", "ok.two"]);
    expect(seen[0]?.payload).toMatchObject({ aggregateType: "Test", aggregateId: w.agenziaDue });

    // Not due yet: nothing happens.
    expect(await dispatchOutbox(db, handler, { now: new Date(T0.getTime() + 30_000) })).toEqual({
      delivered: 0,
      retried: 0,
      failed: 0,
    });
    const failing = await withContext(db, SYSTEM_CONTEXT, (tx) =>
      tx.outboxEvent.findFirstOrThrow({ where: { type: "fails.always" } }),
    );
    expect(failing).toMatchObject({ status: "PENDING", attempts: 1, lastErrorCode: "TypeError" });
    expect(failing.nextAttemptAt.getTime() - T0.getTime()).toBe(retryDelayMs(1));
  });

  it("gives up after the maximum attempts and marks the event FAILED", async () => {
    let now = new Date(T0.getTime() + 10 * 3_600_000);
    let result = { delivered: 0, retried: 0, failed: 0 };
    for (let i = 0; i < 3 && result.failed === 0; i += 1) {
      result = await dispatchOutbox(db, async () => Promise.reject(new RangeError("x")), {
        now,
        maxAttempts: 3,
      });
      now = new Date(now.getTime() + 3_600_000);
    }
    expect(result.failed).toBe(1);
    const failing = await withContext(db, SYSTEM_CONTEXT, (tx) =>
      tx.outboxEvent.findFirstOrThrow({ where: { type: "fails.always" } }),
    );
    expect(failing.status).toBe("FAILED");
  });

  it("retry delays grow and are capped", () => {
    expect([1, 2, 3, 10].map(retryDelayMs)).toEqual([60_000, 120_000, 240_000, 3_600_000]);
  });
});
