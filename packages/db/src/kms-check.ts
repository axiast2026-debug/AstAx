import type { KeyDecryptEvent, KeyEventsSource } from "@astax/adapters/kms";
import { KMS_KEYS } from "@astax/adapters/kms";
import type { DbClient } from "./client.js";
import { SYSTEM_CONTEXT, withContext } from "./context.js";

export type KeyAnomalyKind = "EARLY" | "NO_AUCTION" | "UNKNOWN_AUCTION" | "WRONG_PRINCIPAL";

export interface KeyAnomaly {
  kind: KeyAnomalyKind;
  at: Date;
  auctionId: string | null;
  principal: string;
}

/** A closing fires within seconds of its time: a decryption this much earlier is not a closing. */
const TOLERANCE_MS = 5_000;

/**
 * BC-03 (docs/busta-chiusa.md): a decryption with the sealed bids' key is
 * legitimate only by the worker, for a known auction, at or after its
 * closing (the scheduled time, or the actual closing if it came first).
 */
export function keyAnomalies(
  events: readonly KeyDecryptEvent[],
  auctions: ReadonlyMap<string, { scheduledCloseAt: Date; closedAt: Date | null }>,
  allowedPrincipals: readonly string[],
): KeyAnomaly[] {
  const out: KeyAnomaly[] = [];
  for (const e of events) {
    const base = { at: e.at, auctionId: e.auctionId, principal: e.principal };
    if (!allowedPrincipals.includes(e.principal)) {
      out.push({ kind: "WRONG_PRINCIPAL", ...base });
      continue;
    }
    if (!e.auctionId) {
      out.push({ kind: "NO_AUCTION", ...base });
      continue;
    }
    const auction = auctions.get(e.auctionId);
    if (!auction) {
      out.push({ kind: "UNKNOWN_AUCTION", ...base });
      continue;
    }
    const closing = Math.min(
      auction.scheduledCloseAt.getTime(),
      auction.closedAt?.getTime() ?? Number.POSITIVE_INFINITY,
    );
    if (e.at.getTime() < closing - TOLERANCE_MS) out.push({ kind: "EARLY", ...base });
  }
  return out;
}

/** The application's own record of the key uses (KmsEvent), as a source. */
export function kmsEventSource(db: DbClient): KeyEventsSource {
  return {
    async decrypts(from, to) {
      const rows = await withContext(db, SYSTEM_CONTEXT, (tx) =>
        tx.kmsEvent.findMany({
          where: {
            keyId: KMS_KEYS.sealedBids,
            operation: "DECRYPT",
            at: { gte: from, lt: to },
          },
          orderBy: { seq: "asc" },
        }),
      );
      return rows.map((r) => ({
        at: r.at,
        key: r.keyId,
        auctionId: ((r.context ?? {}) as Record<string, string>).auctionId ?? null,
        principal: r.process,
        ok: r.ok,
      }));
    },
  };
}

/** The anomalies of the decryptions in [from, to), read from `source`. */
export async function checkSealedBidDecryptions(
  db: DbClient,
  source: KeyEventsSource,
  window: { from: Date; to: Date },
  allowedPrincipals: readonly string[],
): Promise<{ checked: number; anomalies: KeyAnomaly[] }> {
  const events = await source.decrypts(window.from, window.to);
  const ids = [...new Set(events.map((e) => e.auctionId).filter((id): id is string => !!id))];
  const auctions = await withContext(db, SYSTEM_CONTEXT, (tx) =>
    tx.auction.findMany({
      where: { id: { in: ids } },
      select: { id: true, scheduledCloseAt: true, closedAt: true },
    }),
  );
  const byId = new Map(auctions.map((a) => [a.id, a]));
  return { checked: events.length, anomalies: keyAnomalies(events, byId, allowedPrincipals) };
}
