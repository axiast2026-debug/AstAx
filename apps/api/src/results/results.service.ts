import { asSystem, withContext, type DbClient } from "@astax/db";
import { agencyRankingView, type RankingEntry } from "@astax/shared/domain";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import { DB } from "../infra/tokens.js";

const WON = ["WINNING", "ISSUED"] as const;

export interface ResultsBucket {
  key: string;
  invited: number;
  offers: number;
  wins: number;
}

/**
 * Spec 04 «Risultati». CLA-02, CLA-03: for each published ranking the first
 * two premiums (no agency, no company), the position of the agency's offer
 * and the gap from the first; an excluded offer sees «esclusa» with the
 * reason. Question 17: while the request is back in a reconfirmation the
 * ranking already published is hidden, until that round closes. The owner
 * and the supervisors see the whole agency, an operator only its own offers.
 * The statistics are on the agency's own data only: invitations, offers and
 * wins by province, CU class, vehicle type and company.
 */
/** Whole-number average, null when there is nothing to average. */
function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

@Injectable()
export class ResultsService {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  async results(auth: AuthContext) {
    const m = auth.membership;
    if (!m || m.organizationType !== "AGENCY") throw new ProblemError("NOT_FOUND");
    const onlyOwn = m.role === "OPERATOR";
    return withContext(this.db, auth.db, async (tx) =>
      asSystem(tx, async () => {
        const offers = await tx.offer.findMany({
          where: {
            organizationId: m.organizationId,
            status: { not: "WITHDRAWN" },
            ...(onlyOwn ? { userId: auth.userId } : {}),
          },
          include: { auction: true },
          orderBy: { submittedAt: "desc" },
          take: 1000,
        });
        const auctionIds = offers.map((o) => o.auctionId);
        const requestIds = [...new Set(offers.map((o) => o.auction.quoteRequestId))];
        const [rankings, requests, rounds, companies, invitations] = await Promise.all([
          tx.ranking.findMany({
            where: { auctionId: { in: auctionIds }, publishedAt: { not: null } },
          }),
          tx.quoteRequest.findMany({
            where: { id: { in: requestIds } },
            select: { id: true, code: true, province: true, cuClass: true, vehicleType: true },
          }),
          tx.auction.findMany({
            where: { quoteRequestId: { in: requestIds } },
            select: { quoteRequestId: true, round: true, status: true },
          }),
          tx.insuranceCompany.findMany({ select: { id: true, name: true } }),
          onlyOwn
            ? Promise.resolve([])
            : tx.invitation.findMany({
                where: { organizationId: m.organizationId },
                include: { auction: { select: { quoteRequestId: true } } },
                take: 5000,
              }),
        ]);
        const reconfirming = (requestId: string, round: number) =>
          rounds.some(
            (a) =>
              a.quoteRequestId === requestId &&
              a.round > round &&
              (a.status === "OPEN" || a.status === "CLOSING"),
          );

        const published = rankings.flatMap((ranking) => {
          const offer = offers.find((o) => o.auctionId === ranking.auctionId);
          if (!offer) return [];
          if (reconfirming(offer.auction.quoteRequestId, offer.auction.round)) return [];
          // One offer per agency and round: the agency's entry is this offer.
          const view = agencyRankingView({
            published: true,
            entries: ranking.entries as unknown as RankingEntry[],
            organizationId: m.organizationId,
            excluded: offer.status === "EXCLUDED" ? { reason: offer.exclusionReason } : null,
          });
          return [
            {
              auctionId: ranking.auctionId,
              code: requests.find((q) => q.id === offer.auction.quoteRequestId)?.code ?? "",
              round: offer.auction.round,
              publishedAt: ranking.publishedAt?.toISOString() ?? "",
              view,
            },
          ];
        });

        const issued = await tx.policy.findMany({
          where: {
            organizationId: m.organizationId,
            ...(onlyOwn ? { issuedByUserId: auth.userId } : {}),
          },
          select: { acceptanceId: true, issuedAt: true },
          take: 1000,
        });
        const paid = await tx.acceptance.findMany({
          where: { id: { in: issued.map((p) => p.acceptanceId) } },
          select: { id: true, paidAt: true },
        });

        // Statistics on the closed rounds (before the closing the offers are sealed).
        const closed = offers.filter((o) => o.auction.status === "CLOSED");
        const requestOf = (id: string) => requests.find((q) => q.id === id);
        const group = (keyOf: (requestId: string, companyId: string | null) => string | null) => {
          const buckets = new Map<string, ResultsBucket>();
          const bucket = (key: string) => {
            const found = buckets.get(key) ?? { key, invited: 0, offers: 0, wins: 0 };
            buckets.set(key, found);
            return found;
          };
          for (const i of invitations) {
            const key = keyOf(i.auction.quoteRequestId, null);
            if (key) bucket(key).invited += 1;
          }
          for (const o of closed) {
            const key = keyOf(o.auction.quoteRequestId, o.companyId);
            if (!key) continue;
            const b = bucket(key);
            b.offers += 1;
            if ((WON as readonly string[]).includes(o.status)) b.wins += 1;
          }
          return [...buckets.values()]
            .filter((b) => b.offers > 0 || b.invited > 0)
            .sort((a, b) => b.offers - a.offers || a.key.localeCompare(b.key));
        };
        return {
          scope: onlyOwn ? ("OWN" as const) : ("AGENCY" as const),
          published,
          totals: {
            invited: invitations.length,
            offers: closed.length,
            wins: closed.filter((o) => (WON as readonly string[]).includes(o.status)).length,
            // Spec 04: the average gap from the winner when not first, in basis points.
            averageGapBasisPoints: average(
              published.flatMap((p) =>
                p.view.kind === "RANKED" && p.view.position > 1 ? [p.view.gapBasisPoints] : [],
              ),
            ),
            // Spec 04: the average time from the payment to the issuance, in minutes.
            averageIssuanceMinutes: average(
              issued.flatMap((p) => {
                const paidAt = paid.find((a) => a.id === p.acceptanceId)?.paidAt;
                return paidAt ? [Math.round((+p.issuedAt - +paidAt) / 60_000)] : [];
              }),
            ),
          },
          byProvince: group((r) => requestOf(r)?.province ?? null),
          byClass: group((r) => {
            const cu = requestOf(r)?.cuClass;
            return cu === null || cu === undefined ? null : String(cu);
          }),
          byVehicleType: group((r) => requestOf(r)?.vehicleType ?? null),
          // The company is known only for the offers: no invitations here.
          byCompany: group((_r, companyId) =>
            companyId ? (companies.find((c) => c.id === companyId)?.name ?? null) : null,
          ),
        };
      }),
    );
  }
}
