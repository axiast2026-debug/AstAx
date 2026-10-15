import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical-json.js";

/** prevHash of the very first entry of the log. */
export const GENESIS_HASH = "0".repeat(64);

/** Content of an `AuditLog` row, everything except the chain fields (SIC-04). */
export interface AuditEntryContent {
  at: Date;
  actorUserId: string | null;
  actorMembershipId: string | null;
  actorOrganizationId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
}

export interface ChainedAuditEntry extends AuditEntryContent {
  prevHash: string;
  hash: string;
}

export function hashAuditEntry(content: AuditEntryContent, prevHash: string): string {
  const payload = canonicalJson({
    at: content.at,
    actorUserId: content.actorUserId,
    actorMembershipId: content.actorMembershipId,
    actorOrganizationId: content.actorOrganizationId,
    action: content.action,
    targetType: content.targetType,
    targetId: content.targetId,
    before: content.before ?? null,
    after: content.after ?? null,
    reason: content.reason,
    ip: content.ip,
    userAgent: content.userAgent,
    prevHash,
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/** Links a new entry to the previous one: each entry contains the hash of the one before. */
export function chainAuditEntry(content: AuditEntryContent, prevHash: string): ChainedAuditEntry {
  return { ...content, prevHash, hash: hashAuditEntry(content, prevHash) };
}

export type AuditChainCheck =
  | { ok: true; checked: number; lastHash: string }
  | { ok: false; checked: number; index: number; problem: "BROKEN_LINK" | "HASH_MISMATCH" };

/**
 * Verifies entries in log order, starting from `startHash` (the genesis, or the
 * last hash of an already verified segment). Used by `pnpm audit:verify`.
 */
export function verifyAuditChain(
  entries: Iterable<ChainedAuditEntry>,
  startHash: string = GENESIS_HASH,
): AuditChainCheck {
  let expectedPrev = startHash;
  let index = 0;
  for (const entry of entries) {
    if (entry.prevHash !== expectedPrev) {
      return { ok: false, checked: index, index, problem: "BROKEN_LINK" };
    }
    if (hashAuditEntry(entry, entry.prevHash) !== entry.hash) {
      return { ok: false, checked: index, index, problem: "HASH_MISMATCH" };
    }
    expectedPrev = entry.hash;
    index += 1;
  }
  return { ok: true, checked: index, lastHash: expectedPrev };
}
