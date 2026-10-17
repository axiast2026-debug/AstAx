import type { RankingEntry } from "@astax/shared/domain";
import type { DbTransaction } from "./client.js";

export interface PublishedRanking {
  auctionId: string;
  validCount: number;
  entries: RankingEntry[];
  /** The excluded offers of that round: their agencies see «esclusa» with the reason. */
  excluded: { organizationId: string; userId: string | null }[];
  /** The authors of the ranked offers, for the operators' own results. */
  authors: Record<string, string | null>;
}

/**
 * CLA-02, decision 32: the ranking of the last round with valid offers is
 * published once, at the customer's acceptance or at the cancellation of a
 * request without acceptance. Never before: a ranking known during a possible
 * reconfirmation would break the sealed envelope. Null when there is nothing
 * to publish or it already was. A system step: the caller runs it in the
 * system context, sends the notifications and writes the audit.
 */
export async function publishLastRanking(
  tx: DbTransaction,
  quoteRequestId: string,
  now: Date,
): Promise<PublishedRanking | null> {
  const rankings = await tx.ranking.findMany({
    where: { quoteRequestId, validCount: { gt: 0 } },
  });
  if (rankings.length === 0) return null;
  const auctions = await tx.auction.findMany({
    where: { id: { in: rankings.map((r) => r.auctionId) }, status: "CLOSED" },
    orderBy: { round: "desc" },
  });
  const last = auctions[0];
  const ranking = rankings.find((r) => r.auctionId === last?.id);
  if (!last || !ranking || ranking.publishedAt) return null;
  if (rankings.some((r) => r.publishedAt)) return null;
  await tx.ranking.update({ where: { id: ranking.id }, data: { publishedAt: now } });
  const entries = ranking.entries as unknown as RankingEntry[];
  const offers = await tx.offer.findMany({
    where: { auctionId: last.id },
    select: { id: true, organizationId: true, userId: true, status: true },
  });
  return {
    auctionId: last.id,
    validCount: ranking.validCount,
    entries,
    excluded: offers
      .filter((o) => o.status === "EXCLUDED")
      .map((o) => ({ organizationId: o.organizationId, userId: o.userId })),
    authors: Object.fromEntries(offers.map((o) => [o.id, o.userId])),
  };
}
