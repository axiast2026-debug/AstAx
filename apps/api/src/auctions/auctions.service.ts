import { randomUUID } from "node:crypto";
import type { Clock } from "@astax/adapters/clock";
import {
  addRequestEvent,
  asSystem,
  autoCancelAt,
  reconfirmationPending,
  recordDomainEvent,
  settingsAt,
  auctionSettings,
  loadWorkingCalendar,
  withContext,
  type Auction,
  type AuctionSettingsSnapshot,
  type DbClient,
  type DbTransaction,
  requesterExclusions,
} from "@astax/db";
import { backOfficeMayInvite, bestOfferPerCompany } from "@astax/shared/domain";
import { dbDateToCalendarDate } from "@astax/shared/format";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, DB, WORKFLOW_SIGNALS } from "../infra/tokens.js";
import { isOrgRequester, requesterScope } from "../requests/request-support.js";
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

  /** The same counts for many rounds at once: two grouped reads, not two per round. */
  private async countsOf(tx: DbTransaction, auctionIds: string[]) {
    const [offers, invited] = await asSystem(tx, () =>
      Promise.all([
        tx.offer.groupBy({
          by: ["auctionId"],
          where: { auctionId: { in: auctionIds }, status: "SUBMITTED" },
          _count: { _all: true },
        }),
        tx.invitation.groupBy({
          by: ["auctionId"],
          where: { auctionId: { in: auctionIds } },
          _count: { _all: true },
        }),
      ]),
    );
    return (auctionId: string) => ({
      offers: offers.find((o) => o.auctionId === auctionId)?._count._all ?? 0,
      invited: invited.find((i) => i.auctionId === auctionId)?._count._all ?? 0,
    });
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
      const reconfirmation = await this.reconfirmationState(tx, request, this.clock.now());
      if (!auction) return { status: request.status, auction: null, reconfirmation };
      const counts = await this.counts(tx, auction.id);
      return {
        status: request.status,
        reconfirmation,
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

  /** GAR-06: reconfirmations used and allowed, and whether one can be asked now. */
  private async reconfirmationState(
    tx: DbTransaction,
    request: { id: string; status: string; reconfirmationsUsed: number },
    now: Date,
  ) {
    const { "reconfirmation.maxPerRequest": max } = await settingsAt(
      tx,
      ["reconfirmation.maxPerRequest"],
      now,
    );
    // Asked and not yet opened by the worker: a second click changes nothing.
    const pending = request.status === "EXPIRED" && (await reconfirmationPending(tx, request, max));
    return {
      used: request.reconfirmationsUsed,
      max,
      pending,
      available: request.status === "EXPIRED" && request.reconfirmationsUsed < max && !pending,
      // GAR-06: shown to the requester, the same instant the worker schedules.
      autoCancelAt:
        request.status === "EXPIRED"
          ? (await autoCancelAt(tx, request.id, now)).at.toISOString()
          : null,
    };
  }

  /**
   * GAR-06: the requester asks the agencies with a valid offer in the last round
   * to reconfirm. The request must be «Scaduta» with reconfirmations left; the
   * worker opens the round (GAR-07, BC-06) from the outbox event.
   */
  async requestReconfirmation(auth: AuthContext, requestId: string) {
    if (!isRequester(auth)) throw new ProblemError("NOT_FOUND");
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "QuoteRequest" WHERE "id" = ${requestId}::uuid FOR UPDATE`;
      const request = await tx.quoteRequest.findFirst({
        where: { id: requestId, ...requesterScope(auth) },
      });
      if (!request) throw new ProblemError("NOT_FOUND");
      const state = await this.reconfirmationState(tx, request, now);
      if (state.pending) return { requested: true };
      if (!state.available) {
        throw new ProblemError("CONFLICT", "No reconfirmation can be asked now", [
          {
            path: "request",
            issue: request.status === "EXPIRED" ? "RECONFIRMATIONS_USED_UP" : "NOT_EXPIRED",
          },
        ]);
      }
      await addRequestEvent(tx, request, {
        type: "RECONFIRMATION_REQUESTED",
        actorKind: "REQUESTER",
        actorUserId: auth.userId,
        at: now,
        details: { used: state.used },
      });
      await recordDomainEvent(tx, {
        aggregateType: "QuoteRequest",
        aggregateId: request.id,
        type: "ReconfirmationRequested",
        at: now,
        actorUserId: auth.userId,
        data: { used: state.used },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "RECONFIRMATION_REQUESTED",
        targetType: "QuoteRequest",
        targetId: request.id,
        after: { used: state.used, max: state.max },
      });
      return { requested: true };
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
      // In sequence: a system read must not overlap the caller's queries (asSystem).
      const companies = await tx.insuranceCompany.findMany();
      const products = await asSystem(tx, () =>
        tx.insuranceProduct.findMany({
          where: { id: { in: rows.flatMap((r) => (r.productId ? [r.productId] : [])) } },
        }),
      );
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
  async forBackOffice(auth: AuthContext, code?: string) {
    if (auth.membership?.organizationType !== "ASTAX") throw new ProblemError("NOT_FOUND");
    return withContext(this.db, auth.db, async (tx) => {
      const recentDays = (
        await settingsAt(tx, ["backOffice.recentAuctionsDays"], this.clock.now())
      )["backOffice.recentAuctionsDays"];
      const auctions = await tx.auction.findMany({
        // With a code, every round of that request, whatever its age.
        where: code
          ? { quoteRequest: { code } }
          : {
              OR: [
                { status: { in: ["OPEN", "CLOSING"] } },
                {
                  closedAt: { gte: new Date(this.clock.now().getTime() - recentDays * 86_400_000) },
                },
                // Requests still waiting on their offers (guarantees, «Scaduta», reconfirmation):
                // their last rounds stay in the list, however long ago they closed.
                {
                  status: "CLOSED",
                  quoteRequest: {
                    status: { in: ["OFFERS_AVAILABLE", "EXPIRED", "IN_RECONFIRMATION"] },
                  },
                },
              ],
            },
        orderBy: { scheduledCloseAt: "asc" },
        take: 200,
        include: { quoteRequest: true },
      });
      const countsFor = await this.countsOf(
        tx,
        auctions.map((a) => a.id),
      );
      const rows = [];
      for (const a of auctions) {
        const counts = countsFor(a.id);
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
  /**
   * Rule 4: a request that could not reach the workflow is logged as such, with
   * its action id, and the back office is told (500).
   */
  private async deliver(
    auth: AuthContext,
    auctionId: string,
    actionId: string,
    send: () => Promise<void>,
  ): Promise<void> {
    try {
      await send();
    } catch {
      await this.audit.record(actorOf(auth), {
        action: "AUCTION_REQUEST_NOT_DELIVERED",
        targetType: "Auction",
        targetId: auctionId,
        after: { actionId },
      });
      throw new ProblemError("INTERNAL", "The request did not reach the auction");
    }
  }

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
    const auction = await withContext(this.db, auth.db, async (tx) => {
      const a = await this.openAuction(tx, auctionId);
      // ASTA-03, ASTA-09, rule 7: an extension is at most the longest auction duration
      // copied at the opening (the value in force for an auction opened before the copy).
      const snapshot = a.settingsSnapshot as unknown as Partial<AuctionSettingsSnapshot>;
      const durations =
        snapshot["auction.durationsWorkingHours"] ??
        (await settingsAt(tx, ["auction.durationsWorkingHours"], this.clock.now()))[
          "auction.durationsWorkingHours"
        ];
      if (input.workingHours > Math.max(...durations)) {
        throw new ProblemError("VALIDATION_FAILED", undefined, [
          { path: "workingHours", issue: "TOO_LONG" },
        ]);
      }
      return a;
    });
    const actionId = await this.request(
      auth,
      auctionId,
      "AUCTION_EXTENSION_REQUESTED",
      input.reason,
      {
        workingHours: input.workingHours,
      },
    );
    await this.deliver(auth, auctionId, actionId, () =>
      this.signals.extend(auction.quoteRequestId, {
        auctionId,
        actionId,
        workingHours: input.workingHours,
        byUserId: auth.userId,
      }),
    );
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
      // ADR 0015: never the requesting agency, nor the one a section E intermediary works for.
      const request = await tx.quoteRequest.findUniqueOrThrow({ where: { id: a.quoteRequestId } });
      const out = await requesterExclusions(tx, request.ownerOrganizationId);
      if (input.organizationIds.some((id) => out.agencies.includes(id))) {
        throw new ProblemError("CONFLICT", "The requester's agency cannot be invited", [
          { path: "organizationIds", issue: "REQUESTER_AGENCY" },
        ]);
      }
      // ASTA-04, rule 7: at most the invitations allowed for one auction, from its parameters.
      if (input.organizationIds.length > snapshot["invitations.max"]) {
        throw new ProblemError("VALIDATION_FAILED", undefined, [
          { path: "organizationIds", issue: "TOO_MANY" },
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
    await this.deliver(auth, auctionId, actionId, () =>
      this.signals.invite(auction.quoteRequestId, {
        auctionId,
        actionId,
        organizationIds: input.organizationIds,
        byUserId: auth.userId,
      }),
    );
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
    await this.deliver(auth, auctionId, actionId, () =>
      this.signals.cancel(auction.quoteRequestId, { auctionId, actionId, byUserId: auth.userId }),
    );
    return { requested: true, actionId };
  }
}

/** A private user, or a member of a broker or an agency (ADR 0015): the roles that make requests. */
function isRequester(auth: AuthContext): boolean {
  return auth.kind === "PRIVATE" || isOrgRequester(auth.membership);
}
