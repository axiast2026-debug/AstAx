import type { DbClient } from "./client.js";
import { SYSTEM_CONTEXT, withContext } from "./context.js";

const CURSOR = "audit.archive";

/**
 * SIC-04 (phase 8): the copies of the audit log in the archive that nobody
 * can change (S3 with Object Lock in COMPLIANCE mode). The entries after the
 * last copied one go out as JSON lines, with their hashes, so the chain can be
 * checked on the copy too. One file per batch, named by its first and last
 * sequence number; the cursor moves only after the file is written, so a
 * failure writes the same batch again (a copy twice, never a gap).
 */
export async function archiveAuditLog(
  db: DbClient,
  put: (key: string, body: Uint8Array) => Promise<void>,
  now: Date,
  batchSize = 5000,
): Promise<{ entries: number; files: number }> {
  let entries = 0;
  let files = 0;
  for (;;) {
    const cursor = await withContext(db, SYSTEM_CONTEXT, (tx) =>
      tx.jobCursor.findUnique({ where: { key: CURSOR } }),
    );
    const after = BigInt(cursor?.value ?? "0");
    const rows = await withContext(db, SYSTEM_CONTEXT, (tx) =>
      tx.auditLog.findMany({
        where: { seq: { gt: after } },
        orderBy: { seq: "asc" },
        take: batchSize,
      }),
    );
    if (rows.length === 0) return { entries, files };
    const first = rows[0]?.seq ?? after;
    const last = rows.at(-1)?.seq ?? after;
    const day = now.toISOString().slice(0, 10).replaceAll("-", "/");
    const body = rows
      .map((r) => JSON.stringify(r, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v)))
      .join("\n");
    await put(`audit/${day}/${first}-${last}.jsonl`, new TextEncoder().encode(`${body}\n`));
    await withContext(db, SYSTEM_CONTEXT, (tx) =>
      tx.jobCursor.upsert({
        where: { key: CURSOR },
        create: { key: CURSOR, value: last.toString(), updatedAt: now },
        update: { value: last.toString(), updatedAt: now },
      }),
    );
    entries += rows.length;
    files += 1;
    if (rows.length < batchSize) return { entries, files };
  }
}
