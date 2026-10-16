import { randomUUID } from "node:crypto";
import type { Clock } from "@astax/adapters/clock";
import {
  asSystem,
  settingsAt,
  auctionSettings,
  loadWorkingCalendar,
  withContext,
  type Auction,
  type AuctionSettingsSnapshot,
  type DbClient,
  type DbTransaction,
} from "@astax/db";
import { backOfficeMayInvite, bestOfferPerCompany } from "@astax/shared/domain";
import { dbDateToCalendarDate } from "@astax/shared/format";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, DB, WORKFLOW_SIGNALS } from "../infra/tokens.js";
import { requesterScope } from "../requests/request-support.js";
import { OffersService } from "./offers.service.js";
import type { WorkflowSignals } from "./workflow-signals.js";

/**
 * What each role sees of an auction (VIS-03, VIS-04, VIS-05, BC-01) and the
 * back office actions (ASTA-06). Counters only before the closing: no price,
 * no agency name for the requester.
 */
@Injectable()
export class AuctionsService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OffersService) private readonly offers: OffersService,
    @Inject(WORKFLOW_SIGNALS) private readonly signals: WorkflowSignals,
  ) {}

  /** Counts of a round, read in a system step: the caller sees no offer row (BC-01). */
  private counts(tx: DbTransaction, auctionId: string) {
    return asSystem(tx, async () => ({
      offers: await tx.offer.count({ where: { auctionId, status: "SUBMITTED" } }),
      invited: await tx.invitation.count({ where: { auctionId } }),
    }));
  }

  /** VIS-03: countdown and number of offers; the broker also the invited agencies, no names. */
  async forRequester(auth: AuthContext, requestId: string) {
    if (!isRequester(auth)) throw new ProblemError("NOT_FOUND");
    return withContext(this.db, auth.db, async (tx) => {
      const request = await tx.quoteRequest.findFirst({
        where: { id: requestId, ...requesterScope(auth) },
      });
      if (!request) throw new ProblemError("NOT_FOUND");
      const auction = await tx.auction.findFirst({
        where: { quoteRequestId: requestId },
        orderBy: { round: "desc" },
      });
      if (!auction) return { status: request.status, auction: null };
      const counts = await this.counts(tx, auction.id);
      return {
        status: request.status,
        auction: {
          round: auction.round,
          kind: auction.kind,
          status: auction.status,
          scheduledCloseAt: auction.scheduledCloseAt.toISOString(),
          closedAt: auction.closedAt?.toISOString() ?? null,
          offers: auction.status === "OPEN" ? counts.offers : null,
          ...(request.channel === "BROKER" ? { invitedAgencies: counts.invited } : {}),
        },
      };
    });
  }

  /**
   * PRES-02, VIS-04: after the closing, per company the best offer still
   * guaranteed (or the best expired, not acceptable). No agency name.
   */
  async presentedOffers(auth: AuthContext, requestId: string) {
    if (!isRequester(auth)) throw new ProblemError("NOT_FOUND");
    return withContext(this.db, auth.db, async (tx) => {
      const request = await tx.quoteRequest.findFirst({
        where: { id: requestId, ...requesterScope(auth) },
      });
      if (!request) throw new ProblemError("NOT_FOUND");
      const last = await tx.auction.findFirst({
        where: { quoteRequestId: requestId, status: "CLOSED" },
        orderBy: { round: "desc" },
      });
      if (!last) return { offers: [] };
      const rows = await asSystem(tx, () =>
        tx.offer.findMany({
          where: { auctionId: last.id, status: { in: ["AWAITING_CUSTOMER", "EXPIRED"] } },
        }),
      );
      const [companies, products] = await Promise.all([
        tx.insuranceCompany.findMany(),
        asSystem(tx, () =>
          tx.insuranceProduct.findMany({
            where: { id: { in: rows.flatMap((r) => (r.productId ? [r.productId] : [])) } },
          }),
        ),
      ]);
      const ranked = rows.flatMap((o) =>
        o.annualGrossPremiumCents !== null && o.companyId && o.guaranteeUntil
          ? [
              {
                id: o.id,
                companyId: o.companyId,
                annualGrossPremiumCents: o.annualGrossPremiumCents,
                guaranteeUntil: dbDateToCalendarDate(o.guaranteeUntil),
                lastSubmittedAt: o.lastChangedAt,
                productId: o.productId,
                coverage: o.coverage,
                notes: o.notes,
                pdfDocumentId: o.pdfDocumentId,
              },
            ]
          : [],
      );
      return {
        offers: bestOfferPerCompany(ranked, this.clock.now()).map(({ offer, guaranteed }) => ({
          id: offer.id,
          company: companies.find((c) => c.id === offer.companyId)?.name ?? "",
          product: products.find((p) => p.id === offer.productId)?.name ?? "",
          annualGrossPremiumCents: offer.annualGrossPremiumCents,
          guaranteeUntil: offer.guaranteeUntil,
          guaranteed,
          coverage: offer.coverage,
          notes: offer.notes,
          pdfDocumentId: offer.pdfDocumentId,
        })),
      };
    });
  }

  /** The agency's invitations (VIS-01: data useful to quote, never the customer's contacts). */
  async forAgency(auth: AuthContext) {
    const m = auth.membership;
    // Only agencies are invited: everyone else has an empty list.
    if (!m || m.organizationType !== "AGENCY") return [];
    return withContext(this.db, auth.db, async (tx) => {
      const all = await tx.invitation.findMany({
        where: { organizationId: m.organizationId },
        include: { auction: true },
        orderBy: { invitedAt: "desc" },
        take: 100,
      });
      // VIS-06: an operator sees only the requests inside their own filters.
      const invitations: typeof all = [];
      for (const i of all) {
        if (await this.offers.withinMemberFilters(tx, auth, i.auction)) invitations.push(i);
      }
      const requests = await asSystem(tx, () =>
        tx.quoteRequest.findMany({
          where: { id: { in: invitations.map((i) => i.auction.quoteRequestId) } },
        }),
      );
      const offers = await tx.offer.findMany({
        where: {
          organizationId: m.organizationId,
          auctionId: { in: invitations.map((i) => i.auctionId) },
        },
      });
      const claims = await tx.claim.findMany({
        where: {
          organizationId: m.organizationId,
          releasedAt: null,
          auctionId: { in: invitations.map((i) => i.auctionId) },
        },
      });
      return invitations.map((i) => {
        const r = requests.find((q) => q.id === i.auction.quoteRequestId);
        const offer = offers.find((o) => o.auctionId === i.auctionId && o.status !== "WITHDRAWN");
        return {
          auctionId: i.auctionId,
          code: r?.code ?? "",
          vehicleType: r?.vehicleType ?? null,
          province: r?.province ?? null,
          packageCode: r?.packageCode ?? null,
          startDate: r?.startDate ? dbDateToCalendarDate(r.startDate) : null,
          minGuaranteeDate: dbDateToCalendarDate(i.auction.minGuaranteeDate),
          status: i.auction.status,
          scheduledCloseAt: i.auction.scheduledCloseAt.toISOString(),
          invitation: i.status,
          claimedByMe: claims.some((c) => c.auctionId === i.auctionId && c.userId === auth.userId),
          claimedByColleague: claims.some(
            (c) => c.auctionId === i.auctionId && c.userId !== auth.userId,
          ),
          offer: offer ? { id: offer.id, status: offer.status, version: offer.version } : null,
        };
      });
    });
  }

  /** BC-01: before the closing nobody reads the offers of a round, staff included. */
  async offersOfRound(auth: AuthContext, auctionId: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const auction = await asSystem(tx, () => tx.auction.findUnique({ where: { id: auctionId } }));
      if (!auction) throw new ProblemError("NOT_FOUND");
      const m = auth.membership;
      if (m?.organizationType === "AGENCY") {
        // An agency not invited does not even learn that the auction exists.
        const invited = await tx.invitation.count({
          where: { auctionId, organizationId: m.organizationId },
        });
        if (invited === 0) throw new ProblemError("NOT_FOUND");
        // An agency sees only its own offers (VIS-05), as identifiers and statuses.
        const own = await tx.offer.findMany({
          where: { auctionId, organizationId: m.organizationId },
        });
        return own.map((o) => ({ id: o.id, status: o.status, version: o.version }));
      }
      if (auction.status !== "CLOSED" || m?.organizationType !== "ASTAX") {
        return this.offers.sealedDenied(auth, "Auction", auctionId);
      }
      const rows = await tx.offer.findMany({ where: { auctionId }, orderBy: { rank: "asc" } });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "OFFERS_VIEWED",
        targetType: "Auction",
        targetId: auctionId,
      });
      return rows.map((o) => ({
        id: o.id,
        organizationId: o.organizationId,
        status: o.status,
        rank: o.rank,
        annualGrossPremiumCents: o.annualGrossPremiumCents,
        companyId: o.companyId,
        guaranteeUntil: o.guaranteeUntil ? dbDateToCalendarDate(o.guaranteeUntil) : null,
        exclusionReason: o.exclusionReason,
      }));
    });
  }

  /** The back office list in real time: counters and times, no price (BC-01). */
  async forBackOffice(auth: AuthContext) {
    if (auth.membership?.organizationType !== "ASTAX") throw new ProblemError("NOT_FOUND");
    return withContext(this.db, auth.db, async (tx) => {
      const recentDays = (
        await settingsAt(tx, ["backOffice.recentAuctionsDays"], this.clock.now())
      )["backOffice.recentAuctionsDays"];
      const auctions = await tx.auction.findMany({
        where: {
          OR: [
            { status: { in: ["OPEN", "CLOSING"] } },
            { closedAt: { gte: new Date(this.clock.now().getTime() - recentDays * 86_400_000) } },
          ],
        },
        orderBy: { scheduledCloseAt: "asc" },
        take: 200,
        include: { quoteRequest: true },
      });
      const rows = [];
      for (const a of auctions) {
        const counts = await this.counts(tx, a.id);
        rows.push({
          auctionId: a.id,
          requestId: a.quoteRequestId,
          code: a.quoteRequest.code,
          kind: a.kind,
          round: a.round,
          status: a.status,
          requestStatus: a.quoteRequest.status,
          openedAt: a.openedAt.toISOString(),
          scheduledCloseAt: a.scheduledCloseAt.toISOString(),
          originalCloseAt: a.originalCloseAt.toISOString(),
          extended: a.scheduledCloseAt.getTime() !== a.originalCloseAt.getTime(),
          invited: counts.invited,
          offers: a.status === "OPEN" ? counts.offers : null,
          closedAt: a.closedAt?.toISOString() ?? null,
        });
      }
      // Active agencies, for the invitations by the back office (ASTA-06).
      const agencies = await tx.organization.findMany({
        where: { type: "AGENCY", status: "ACTIVE" },
        orderBy: { legalName: "asc" },
        select: { id: true, legalName: true },
      });
      return { auctions: rows, agencies: agencies.map((a) => ({ id: a.id, name: a.legalName })) };
    });
  }

  private async openAuction(tx: DbTransaction, auctionId: string): Promise<Auction> {
    const auction = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!auction) throw new ProblemError("NOT_FOUND");
    // BC-05: past the scheduled closing the auction is over, even before the worker closes it.
    if (auction.status !== "OPEN" || this.clock.now() >= auction.scheduledCloseAt) {
      throw new ProblemError("AUCTION_CLOSED");
    }
    return auction;
  }

  /** ASTA-06: extension with reason; the minimum guarantee does not move (GAR-01). */
  /**
   * The back office request goes to the audit log first, with its reason and
   * an action id; the workflow gets only the ids (BC-07: no free text in
   * Temporal) and applies it once, to that auction only (ADR 0008).
   */
  private async request(
    auth: AuthContext,
    auctionId: string,
    action:
      | "AUCTION_EXTENSION_REQUESTED"
      | "AUCTION_INVITATIONS_REQUESTED"
      | "AUCTION_CANCELLATION_REQUESTED",
    reason: string,
    after: Record<string, unknown>,
  ): Promise<string> {
    const actionId = randomUUID();
    await this.audit.record(actorOf(auth), {
      action,
      targetType: "Auction",
      targetId: auctionId,
      after: { actionId, ...after },
      reason,
    });
    return actionId;
  }

  /** ASTA-06: extension with reason, before the scheduled closing; GAR-01 unchanged. */
  async extend(
    auth: AuthContext,
    auctionId: string,
    input: { workingHours: number; reason: string },
  ) {
    const auction = await withContext(this.db, auth.db, (tx) => this.openAuction(tx, auctionId));
    const actionId = await this.request(
      auth,
      auctionId,
      "AUCTION_EXTENSION_REQUESTED",
      input.reason,
      {
        workingHours: input.workingHours,
      },
    );
    await this.signals.extend(auction.quoteRequestId, {
      auctionId,
      actionId,
      workingHours: input.workingHours,
      byUserId: auth.userId,
    });
    return { requested: true, actionId };
  }

  /** ASTA-06: invitations only in the first half of the auction (after: 409). */
  async invite(
    auth: AuthContext,
    auctionId: string,
    input: { organizationIds: string[]; reason: string },
  ) {
    const auction = await withContext(this.db, auth.db, async (tx) => {
      const a = await this.openAuction(tx, auctionId);
      const snapshot = a.settingsSnapshot as unknown as AuctionSettingsSnapshot;
      const calendar = await loadWorkingCalendar(tx, snapshot["calendar.workingHours"], snapshot);
      if (
        !backOfficeMayInvite(
          calendar,
          a.openedAt,
          a.originalCloseAt,
          this.clock.now(),
          auctionSettings(snapshot),
        )
      ) {
        throw new ProblemError("CONFLICT", "Invitations only in the first half of the auction", [
          { path: "auction", issue: "AFTER_FIRST_HALF" },
        ]);
      }
      const agencies = await tx.organization.count({
        where: { id: { in: input.organizationIds }, type: "AGENCY", status: "ACTIVE" },
      });
      if (agencies !== input.organizationIds.length) {
        throw new ProblemError("VALIDATION_FAILED", undefined, [
          { path: "organizationIds", issue: "NOT_AN_ACTIVE_AGENCY" },
        ]);
      }
      return a;
    });
    const actionId = await this.request(
      auth,
      auctionId,
      "AUCTION_INVITATIONS_REQUESTED",
      input.reason,
      {
        organizationIds: input.organizationIds,
      },
    );
    await this.signals.invite(auction.quoteRequestId, {
      auctionId,
      actionId,
      organizationIds: input.organizationIds,
      byUserId: auth.userId,
    });
    return { requested: true, actionId };
  }

  async cancel(auth: AuthContext, auctionId: string, input: { reason: string }) {
    const auction = await withContext(this.db, auth.db, (tx) => this.openAuction(tx, auctionId));
    const actionId = await this.request(
      auth,
      auctionId,
      "AUCTION_CANCELLATION_REQUESTED",
      input.reason,
      {},
    );
    await this.signals.cancel(auction.quoteRequestId, {
      auctionId,
      actionId,
      byUserId: auth.userId,
    });
    return { requested: true, actionId };
  }
}

/** A private user, or a member of a broker: the roles that make requests. */
function isRequester(auth: AuthContext): boolean {
  return auth.kind === "PRIVATE" || auth.membership?.organizationType === "BROKER";
}
