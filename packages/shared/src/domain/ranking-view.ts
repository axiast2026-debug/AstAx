/**
 * CLA-03, decision 33: what an agency sees of a published ranking. The
 * premium of the first and second offer, never their agency or company; the
 * position of its own offer «N su M», where M is the number of valid offers;
 * the gap from the first in percent. An excluded offer sees «esclusa» with
 * the reason (CLA-03), and before the publication only the state of its own
 * offer (CLA-04).
 */
export interface RankingEntry {
  offerId: string;
  organizationId: string | null;
  rank: number;
  annualGrossPremiumCents: number;
}

export type AgencyRankingView =
  | {
      kind: "RANKED";
      firstCents: number;
      secondCents: number | null;
      position: number;
      total: number;
      ownCents: number;
      /** Gap from the first, in hundredths of a percent (297 = +2,97 %). */
      gapBasisPoints: number;
    }
  | { kind: "EXCLUDED"; reason: string | null }
  | { kind: "NOT_PUBLISHED" }
  | { kind: "NOT_PARTICIPATING" };

export function agencyRankingView(input: {
  published: boolean;
  entries: readonly RankingEntry[];
  organizationId: string;
  /** The agency's own offer excluded at the closing or after the PDF check. */
  excluded: { reason: string | null } | null;
}): AgencyRankingView {
  if (!input.published) return { kind: "NOT_PUBLISHED" };
  if (input.excluded) return { kind: "EXCLUDED", reason: input.excluded.reason };
  const sorted = [...input.entries].sort((a, b) => a.rank - b.rank);
  const own = sorted.find((e) => e.organizationId === input.organizationId);
  const first = sorted[0];
  if (!own || !first) return { kind: "NOT_PARTICIPATING" };
  const gap = own.annualGrossPremiumCents - first.annualGrossPremiumCents;
  return {
    kind: "RANKED",
    firstCents: first.annualGrossPremiumCents,
    secondCents: sorted[1]?.annualGrossPremiumCents ?? null,
    position: own.rank,
    total: sorted.length,
    ownCents: own.annualGrossPremiumCents,
    // Integer arithmetic, rounded half up: no decimals for money (rule 5).
    gapBasisPoints: Math.floor(
      (gap * 10_000 + Math.floor(first.annualGrossPremiumCents / 2)) /
        first.annualGrossPremiumCents,
    ),
  };
}

/** «+2,97 %» from the basis points of the gap. */
export function formatGapPercent(basisPoints: number): string {
  const sign = basisPoints > 0 ? "+" : basisPoints < 0 ? "−" : "";
  const abs = Math.abs(basisPoints);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")} %`;
}
