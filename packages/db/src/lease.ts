import type { DbClient } from "./client.js";
import { SYSTEM_CONTEXT, withContext } from "./context.js";

/**
 * Phase 8: a turn that only one process holds at a time, kept in JobCursor
 * (key «lease.<name>», value the holder). With two workers or several API
 * instances, a periodic job or a delivery runs once: whoever takes the turn
 * runs it, the others skip. A turn not renewed within `ttlMs` lapses, so a
 * stopped process never blocks the job for good.
 */
export async function acquireLease(
  db: DbClient,
  name: string,
  holder: string,
  now: Date,
  ttlMs: number,
): Promise<boolean> {
  const key = `lease.${name}`;
  const expired = new Date(now.getTime() - ttlMs);
  const rows = await withContext(
    db,
    SYSTEM_CONTEXT,
    (tx) =>
      tx.$queryRaw<{ key: string }[]>`
      INSERT INTO "JobCursor" ("key", "value", "updatedAt") VALUES (${key}, ${holder}, ${now})
      ON CONFLICT ("key") DO UPDATE SET "value" = ${holder}, "updatedAt" = ${now}
      WHERE "JobCursor"."updatedAt" < ${expired} OR "JobCursor"."value" = ${holder}
      RETURNING "key"`,
  );
  return rows.length > 0;
}

export async function releaseLease(db: DbClient, name: string, holder: string): Promise<void> {
  await withContext(db, SYSTEM_CONTEXT, (tx) =>
    tx.jobCursor.deleteMany({ where: { key: `lease.${name}`, value: holder } }),
  );
}

/** Runs `work` only if the turn is taken, and gives the turn back after. */
export async function withLease<T>(
  db: DbClient,
  name: string,
  holder: string,
  now: Date,
  ttlMs: number,
  work: () => Promise<T>,
): Promise<T | null> {
  if (!(await acquireLease(db, name, holder, now, ttlMs))) return null;
  try {
    return await work();
  } finally {
    await releaseLease(db, name, holder).catch(() => undefined);
  }
}
