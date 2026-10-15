import {
  chainAuditEntry,
  GENESIS_HASH,
  verifyAuditChain,
  type AuditChainCheck,
  type AuditEntryContent,
  type ChainedAuditEntry,
} from "@astax/shared/audit";
import type { DbClient, DbTransaction } from "./client.js";
import { SYSTEM_CONTEXT, withContext } from "./context.js";
import { Prisma } from "./generated/prisma/client.js";

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

/**
 * Appends one entry to the audit log inside the caller's transaction (SIC-04).
 * The database function takes the chain lock and returns the true head, so
 * concurrent writers queue up and the chain never forks.
 */
export async function appendAudit(
  tx: DbTransaction,
  content: AuditEntryContent,
): Promise<ChainedAuditEntry> {
  const [row] = await tx.$queryRaw<{ head: string }[]>`SELECT audit_log_lock_head() AS head`;
  const entry = chainAuditEntry(content, row?.head ?? GENESIS_HASH);
  await tx.auditLog.create({
    data: { ...entry, before: toJson(entry.before), after: toJson(entry.after) },
  });
  return entry;
}

const BATCH = 1000;

/** Reads the whole log in order and checks the chain: `pnpm audit:verify`. */
export async function verifyAuditLog(db: DbClient): Promise<AuditChainCheck> {
  let lastSeq = -1n;
  let startHash = GENESIS_HASH;
  let checked = 0;
  for (;;) {
    const rows = await withContext(db, SYSTEM_CONTEXT, (tx) =>
      tx.auditLog.findMany({
        where: { seq: { gt: lastSeq } },
        orderBy: { seq: "asc" },
        take: BATCH,
      }),
    );
    if (rows.length === 0) return { ok: true, checked, lastHash: startHash };
    const result = verifyAuditChain(rows, startHash);
    if (!result.ok) {
      return { ...result, checked: checked + result.checked, index: checked + result.index };
    }
    checked += result.checked;
    startHash = result.lastHash;
    lastSeq = rows[rows.length - 1]?.seq ?? lastSeq;
  }
}
