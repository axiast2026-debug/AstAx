import { asSystem, requesterExclusions, type Auction, type DbTransaction } from "@astax/db";

/**
 * Dan, 2026-10-29 (ADR 0024): every active agency sees every open auction and
 * may offer; the filters decide only the emails. An agency that opens an
 * auction it was not emailed about joins it here: the invitation row (source
 * OPEN_LIST) keeps working as its participation, for the claim, the offer, the
 * decline and the logs.
 *
 * Out: the reconfirmation rounds (GAR-07, only the agencies with a valid offer),
 * a suspended agency (EMI-06), one the back office left out (ASTA-06), the
 * requesting agency and those in conflict (ADR 0015), an agency without a
 * verified mandate it may offer with.
 */
export async function mayJoin(
  tx: DbTransaction,
  auction: Pick<Auction, "id" | "kind" | "status" | "quoteRequestId">,
  organizationId: string,
): Promise<boolean> {
  if (auction.status !== "OPEN" || auction.kind === "RECONFIRMATION") return false;
  return asSystem(tx, async () => {
    const [organization, suspension, request] = await Promise.all([
      tx.organization.findUnique({ where: { id: organizationId } }),
      tx.agencySuspension.findFirst({ where: { organizationId, revokedAt: null } }),
      tx.quoteRequest.findUniqueOrThrow({ where: { id: auction.quoteRequestId } }),
    ]);
    if (organization?.type !== "AGENCY" || organization.status !== "ACTIVE" || suspension) {
      return false;
    }
    const left = await tx.invitationExclusion.findUnique({
      where: { quoteRequestId_organizationId: { quoteRequestId: request.id, organizationId } },
    });
    if (left) return false;
    const excluded = await requesterExclusions(tx, request.ownerOrganizationId);
    if (excluded.agencies.includes(organizationId)) return false;
    const mandates = await tx.agencyMandate.findMany({
      where: { organizationId, verifiedAt: { not: null } },
      select: { companyId: true },
    });
    return mandates.some((x) => !excluded.companies.includes(x.companyId));
  });
}

/** Joins the open auction, once; the invitation of the agency, or null when it may not. */
export async function joinOpenAuction(
  tx: DbTransaction,
  auction: Pick<Auction, "id" | "kind" | "status" | "quoteRequestId">,
  organizationId: string,
  now: Date,
) {
  if (!(await mayJoin(tx, auction, organizationId))) return null;
  return asSystem(tx, async () => {
    await tx.invitation.createMany({
      data: [{ auctionId: auction.id, organizationId, source: "OPEN_LIST", invitedAt: now }],
      skipDuplicates: true,
    });
    return tx.invitation.findUniqueOrThrow({
      where: { auctionId_organizationId: { auctionId: auction.id, organizationId } },
      include: { auction: true },
    });
  });
}
