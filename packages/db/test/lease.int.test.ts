import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbClient } from "../src/client.js";
import { acquireLease, releaseLease, withLease } from "../src/lease.js";
import { appDb } from "./fixtures.js";

// Phase 8: with two workers or several API instances, a job runs once.
let db: DbClient;

beforeAll(() => {
  db = appDb();
});

afterAll(async () => {
  await db.$disconnect();
});

const at = (iso: string) => new Date(iso);

describe("phase 8 leases", () => {
  it("one holder at a time; the turn lapses after the time; given back, it is free", async () => {
    const t0 = at("2031-10-01T10:00:00Z");
    expect(await acquireLease(db, "test.a", "worker-1", t0, 60_000)).toBe(true);
    expect(await acquireLease(db, "test.a", "worker-2", t0, 60_000)).toBe(false);
    // The holder renews its own turn.
    expect(await acquireLease(db, "test.a", "worker-1", at("2031-10-01T10:00:30Z"), 60_000)).toBe(
      true,
    );
    // A turn not renewed lapses.
    expect(await acquireLease(db, "test.a", "worker-2", at("2031-10-01T10:02:00Z"), 60_000)).toBe(
      true,
    );
    await releaseLease(db, "test.a", "worker-2");
    expect(await acquireLease(db, "test.a", "worker-1", at("2031-10-01T10:02:01Z"), 60_000)).toBe(
      true,
    );
  });

  it("withLease runs the work for one of two concurrent holders only", async () => {
    let runs = 0;
    const work = async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 50));
      return runs;
    };
    const now = at("2031-10-02T10:00:00Z");
    const results = await Promise.all([
      withLease(db, "test.b", "a", now, 60_000, work),
      withLease(db, "test.b", "b", now, 60_000, work),
    ]);
    expect(runs).toBe(1);
    expect(results.filter((r) => r === null)).toHaveLength(1);
  });
});
