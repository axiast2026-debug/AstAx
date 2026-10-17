import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import {
  addRequestEvent,
  asSystem,
  recordDomainEvent,
  settingsAt,
  SYSTEM_CONTEXT,
  withContext,
  type DbClient,
  type DbTransaction,
  type QuoteRequest,
} from "@astax/db";
import {
  secondOfferTerms,
  suspensionDue,
  transitionOffer,
  transitionRequest,
} from "@astax/shared/domain";
import {
  dbDateToCalendarDate,
  formatDate,
  formatDateTime,
  romeCalendarDate,
} from "@astax/shared/format";
import { Inject, Injectable } from "@nestjs/common";
import { AcceptanceService } from "../acceptance/acceptance.service.js";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import type { ApiConfig } from "../config/config.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, CONFIG, DB, FIELD_CIPHER } from "../infra/tokens.js";
import labels from "../notifications/labels.it.json" with { type: "json" };
import { NotificationService } from "../notifications/notification.service.js";
import { Postbox, staffUsers, type PostboxUser } from "../notifications/postbox.js";
import { RefundsService } from "../refunds/refunds.service.js";

const HOUR_MS = 3_600_000;
const SYSTEM_ACTOR = {
  userId: null,
  membershipId: null,
  organizationId: null,
  ip: null,
  userAgent: null,
};

/**
 * EMI-04, EMI-05, EMI-06, decisions 27, 28, 30 (spec 06 «Eccezioni»): the
 * back office decides whose fault a missed issuance is. The agency's: the
 * penalty for the missed issuance replaces the one for the delay, the offer is
 * «Mancata emissione», the customer gets the best offer still guaranteed of
 * another agency with 24 hours to confirm (or a full refund), and the third
 * missed issuance in six months suspends the agency. The customer's wrong
 * data: the agency's new price, to confirm or be refunded.
 */
@Injectable()
export class ExceptionsService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(AcceptanceService) private readonly acceptance: AcceptanceService,
    @Inject(RefundsService) private readonly refunds: RefundsService,
  ) {}

  private postbox() {
    return new Postbox(this.notifications, this.cipher, this.config.WEB_URL);
  }

  /** «Eccezioni», the issuance cases (open first). */
  async list(auth: AuthContext) {
    return withContext(this.db, auth.db, async (tx) =>
      asSystem(tx, async () => {
        const problems = await tx.issuanceProblem.findMany({
          orderBy: [{ status: "asc" }, { openedAt: "desc" }],
          take: 100,
        });
        const [requests, orgs] = await Promise.all([
          tx.quoteRequest.findMany({
            where: { id: { in: problems.map((p) => p.quoteRequestId) } },
          }),
          tx.organization.findMany({
            where: { id: { in: problems.map((p) => p.organizationId) } },
          }),
        ]);
        return problems.map((p) => {
          const request = requests.find((r) => r.id === p.quoteRequestId);
          return {
            id: p.id,
            requestId: p.quoteRequestId,
            code: request?.code ?? "",
            requestStatus: request?.status ?? "",
            startDate: request?.startDate ? request.startDate.toISOString().slice(0, 10) : null,
            agency: orgs.find((o) => o.id === p.organizationId)?.legalName ?? "",
            type: p.type,
            description: p.description,
            openedAt: p.openedAt.toISOString(),
            status: p.status,
            fault: p.fault,
            decisionReason: p.decisionReason,
          };
        });
      }),
    );
  }

  async decide(
    auth: AuthContext,
    problemId: string,
    input: { fault: "AGENCY" | "CUSTOMER"; reason: string; newPremiumCents?: number },
  ) {
    const now = this.clock.now();
    const postbox = this.postbox();
    const out = await withContext(this.db, auth.db, async (tx) => {
      const problem = await asSystem(tx, () =>
        tx.issuanceProblem.findUnique({ where: { id: problemId } }),
      );
      if (!problem) throw new ProblemError("NOT_FOUND");
      await tx.$queryRaw`SELECT 1 FROM "QuoteRequest" WHERE "id" = ${problem.quoteRequestId}::uuid FOR UPDATE`;
      const [fresh, request] = await asSystem(tx, () =>
        Promise.all([
          tx.issuanceProblem.findUniqueOrThrow({ where: { id: problemId } }),
          tx.quoteRequest.findUniqueOrThrow({ where: { id: problem.quoteRequestId } }),
        ]),
      );
      if (fresh.status !== "OPEN" || request.status !== "IN_ISSUANCE") {
        throw new ProblemError("CONFLICT", "The case is decided already", [
          { path: "problem", issue: "ALREADY_DECIDED" },
        ]);
      }
      const paid = await asSystem(tx, () =>
        tx.acceptance.findFirstOrThrow({ where: { quoteRequestId: request.id, status: "PAID" } }),
      );
      // EMI-04, decision 27, EMI-06: a case only for the offer still to be issued;
      // one judged already never gets a second penalty or counts twice.
      const offer = await asSystem(tx, () =>
        tx.offer.findUniqueOrThrow({ where: { id: fresh.offerId } }),
      );
      if (offer.status !== "WINNING" || offer.id !== paid.offerId) {
        throw new ProblemError("CONFLICT", "The offer is no longer the one to issue", [
          { path: "problem", issue: "OFFER_NOT_WINNING" },
        ]);
      }
      let outcome: "SECOND_OFFER" | "REPRICE" | "REFUND";
      if (input.fault === "AGENCY") {
        outcome = await this.agencyFault(
          tx,
          postbox,
          auth,
          request,
          fresh.organizationId,
          fresh.offerId,
          paid,
          now,
        );
      } else {
        if (
          !input.newPremiumCents ||
          !Number.isInteger(input.newPremiumCents) ||
          input.newPremiumCents <= 0
        ) {
          throw new ProblemError("VALIDATION_FAILED", "The agency's new price is needed", [
            { path: "newPremiumCents", issue: "PREMIUM_INVALID" },
          ]);
        }
        await this.propose(
          tx,
          postbox,
          request,
          paid,
          {
            kind: "REPRICE",
            toOfferId: paid.offerId,
            premiumCents: input.newPremiumCents,
          },
          now,
        );
        outcome = "REPRICE";
      }
      await asSystem(tx, async () => {
        await tx.issuanceProblem.update({
          where: { id: fresh.id },
          data: {
            status: "DECIDED",
            fault: input.fault,
            decidedByUserId: auth.userId,
            decidedAt: now,
            decisionReason: input.reason,
          },
        });
        await addRequestEvent(tx, request, {
          type: "ISSUANCE_PROBLEM_DECIDED",
          actorKind: "BACK_OFFICE",
          actorUserId: auth.userId,
          at: now,
          details: { problemId: fresh.id, fault: input.fault, outcome },
        });
        await recordDomainEvent(tx, {
          aggregateType: "QuoteRequest",
          aggregateId: request.id,
          type: "IssuanceChanged",
          at: now,
          actorUserId: auth.userId,
          data: { problemId: fresh.id },
        });
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "ISSUANCE_FAULT_DECIDED",
        targetType: "QuoteRequest",
        targetId: request.id,
        reason: input.reason,
        after: { problemId: fresh.id, fault: input.fault, outcome },
      });
      return { outcome };
    });
    await postbox.flush();
    return out;
  }

  private async agencyFault(
    tx: DbTransaction,
    postbox: Postbox,
    auth: AuthContext,
    request: QuoteRequest,
    organizationId: string,
    offerId: string,
    paid: { premiumCents: number; feeCents: number; offerId: string },
    now: Date,
  ): Promise<"SECOND_OFFER" | "REFUND"> {
    const s = await settingsAt(
      tx,
      [
        "penalties.missedIssuanceCents",
        "penalties.suspension.missedIssuances",
        "penalties.suspension.windowMonths",
      ],
      now,
    );
    await asSystem(tx, async () => {
      // Decision 27: the missed issuance replaces the penalty for the delay.
      const late = await tx.penalty.findFirst({
        where: {
          quoteRequestId: request.id,
          organizationId,
          type: "LATE_ISSUANCE",
          status: { in: ["PROPOSED", "APPLIED"] },
        },
      });
      if (late) {
        await tx.penalty.update({ where: { id: late.id }, data: { status: "CANCELLED" } });
      }
      await tx.penalty.create({
        data: {
          organizationId,
          type: "MISSED_ISSUANCE",
          amountCents: s["penalties.missedIssuanceCents"],
          quoteRequestId: request.id,
          reason: "EMI-04",
          proposedByUserId: auth.userId,
          proposedAt: now,
          replacesId: late?.id ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });
      const current = await tx.offer.findUniqueOrThrow({ where: { id: offerId } });
      transitionOffer(current.status, "MISSED_ISSUANCE");
      await tx.offer.update({ where: { id: offerId }, data: { status: "MISSED_ISSUANCE" } });
    });
    await this.audit.inTransaction(tx, actorOf(auth), {
      action: "PENALTY_PROPOSED",
      targetType: "Organization",
      targetId: organizationId,
      after: { quoteRequestId: request.id, type: "MISSED_ISSUANCE" },
    });
    await this.checkSuspension(tx, postbox, organizationId, now, s);
    // Decision 28: the best offer still guaranteed of another agency (PRES-01).
    const { rows } = await this.acceptance.rows(tx, request, null);
    const next = rows.find((r) => r.organizationId !== organizationId && r.guaranteed && !r.block);
    if (!next) {
      await this.refunds.request(tx, postbox, {
        quoteRequestId: request.id,
        reason: "BEFORE_ISSUANCE",
        premiumCents: paid.premiumCents,
        feeCents: paid.feeCents,
        requestedByUserId: auth.userId,
        requestedByLabel: labels.refundRequester.system,
      });
      return "REFUND";
    }
    await asSystem(tx, async () => {
      transitionOffer("NOT_CHOSEN", "AWAITING_CUSTOMER");
      await tx.offer.update({ where: { id: next.id }, data: { status: "AWAITING_CUSTOMER" } });
    });
    await this.propose(
      tx,
      postbox,
      request,
      paid,
      {
        kind: "SECOND_OFFER",
        toOfferId: next.id,
        premiumCents: next.annualGrossPremiumCents,
      },
      now,
    );
    return "SECOND_OFFER";
  }

  /** EMI-06, decision 30: the third missed issuance in six months suspends the agency. */
  private async checkSuspension(
    tx: DbTransaction,
    postbox: Postbox,
    organizationId: string,
    now: Date,
    s: {
      "penalties.suspension.missedIssuances": number;
      "penalties.suspension.windowMonths": number;
    },
  ) {
    await asSystem(tx, async () => {
      const missed = await tx.penalty.findMany({
        where: { organizationId, type: "MISSED_ISSUANCE", status: { not: "CANCELLED" } },
      });
      const today = romeCalendarDate(now);
      const due = suspensionDue(
        missed.map((p) => romeCalendarDate(p.proposedAt)),
        today,
        {
          missedIssuances: s["penalties.suspension.missedIssuances"],
          windowMonths: s["penalties.suspension.windowMonths"],
        },
      );
      if (!due) return;
      const live = await tx.agencySuspension.findFirst({
        where: { organizationId, revokedAt: null },
      });
      if (live) return;
      await this.audit.inTransaction(tx, SYSTEM_ACTOR, {
        action: "AGENCY_SUSPENDED",
        targetType: "Organization",
        targetId: organizationId,
      });
      const agency = await tx.organization.findUniqueOrThrow({ where: { id: organizationId } });
      await tx.agencySuspension.create({
        data: {
          organizationId,
          reason: "EMI-06",
          startedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      });
      const owners: PostboxUser[] = (
        await tx.membership.findMany({
          where: { organizationId, role: "OWNER", status: "ACTIVE" },
          include: { user: true },
        })
      ).map((m) => m.user);
      await postbox.tell(
        tx,
        owners,
        "agency.suspended",
        { motivo: labels.suspension.reason, link: `${this.config.WEB_URL}/assistenza` },
        "/assistenza",
        { organizationId },
      );
      const adminLink = `${this.config.ADMIN_URL}/organizzazioni`;
      await postbox.tell(
        tx,
        await staffUsers(tx, ["ADMIN"]),
        "agency.suspended.admin",
        {
          agenzia: agency.legalName,
          numero: String(s["penalties.suspension.missedIssuances"]),
          mesi: String(s["penalties.suspension.windowMonths"]),
          link: adminLink,
        },
        adminLink,
        { organizationId },
      );
    });
  }

  /** The proposal to the customer, with 24 hours (`secondOffer.customerConfirmHours`). */
  private async propose(
    tx: DbTransaction,
    postbox: Postbox,
    request: QuoteRequest,
    paid: { premiumCents: number; feeCents: number; offerId: string },
    next: { kind: "SECOND_OFFER" | "REPRICE"; toOfferId: string; premiumCents: number },
    now: Date,
  ) {
    const [{ "secondOffer.customerConfirmHours": hours }, fees] = await Promise.all([
      settingsAt(tx, ["secondOffer.customerConfirmHours"], now),
      this.acceptance.feeSettings(tx, now),
    ]);
    const terms = secondOfferTerms(
      paid,
      { premiumCents: next.premiumCents },
      { channel: request.channel, aiUsed: request.aiComparisonUsed },
      fees,
    );
    const expiresAt = new Date(now.getTime() + hours * HOUR_MS);
    const proposal = await asSystem(tx, async () => {
      transitionRequest("IN_ISSUANCE", "ACCEPTED");
      await tx.quoteRequest.update({ where: { id: request.id }, data: { status: "ACCEPTED" } });
      const created = await tx.nextOfferProposal.create({
        data: {
          quoteRequestId: request.id,
          ownerUserId: request.ownerUserId,
          ownerOrganizationId: request.ownerOrganizationId,
          kind: next.kind,
          fromOfferId: paid.offerId,
          toOfferId: next.toOfferId,
          premiumCents: terms.premiumCents,
          feeCents: terms.feeCents,
          differenceCents: terms.differenceCents,
          expiresAt,
          createdAt: now,
          updatedAt: now,
        },
      });
      await addRequestEvent(tx, request, {
        type: "SECOND_OFFER_PROPOSED",
        actorKind: "BACK_OFFICE",
        actorUserId: null,
        at: now,
        details: { proposalId: created.id, kind: next.kind },
      });
      return created;
    });
    const offer = await asSystem(tx, () =>
      tx.offer.findUniqueOrThrow({ where: { id: next.toOfferId } }),
    );
    const company = offer.companyId
      ? await tx.insuranceCompany.findUnique({ where: { id: offer.companyId } })
      : null;
    const data = await this.acceptance.quoteDataOf(tx, request);
    const requester = await asSystem(tx, () =>
      tx.user.findUniqueOrThrow({ where: { id: request.requesterUserId } }),
    );
    const link = `${this.config.WEB_URL}${request.channel === "PRIVATE" ? "/preventivi" : "/richieste"}/${request.id}`;
    await postbox.tell(
      tx,
      [requester],
      next.kind === "SECOND_OFFER" ? "issuance.second_offer_proposed" : "issuance.reprice_proposed",
      {
        nome: requester.firstName,
        veicolo: `${data.vehicle.make} ${data.vehicle.model}`,
        compagnia: company?.name ?? "",
        garanzia: offer.guaranteeUntil
          ? formatDate(dbDateToCalendarDate(offer.guaranteeUntil))
          : "",
        termine: formatDateTime(expiresAt),
        link,
      },
      link,
      { quoteRequestId: request.id },
    );
    return proposal;
  }

  // ---------------------------------------------------------------- the customer

  private async open(tx: DbTransaction, auth: AuthContext, requestId: string) {
    const request = await this.acceptance.requestOf(tx, auth, requestId);
    const proposal = await tx.nextOfferProposal.findFirst({
      where: { quoteRequestId: request.id },
      orderBy: { createdAt: "desc" },
    });
    return { request, proposal };
  }

  /** What the customer sees: the new offer, the fee, the difference, the time to answer. */
  async view(auth: AuthContext, requestId: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const { request, proposal } = await this.open(tx, auth, requestId);
      if (!proposal || request.status !== "ACCEPTED") return null;
      const { rows } = await this.acceptance.rows(tx, request, [proposal.toOfferId]);
      const row = rows[0];
      return {
        id: proposal.id,
        kind: proposal.kind,
        status: proposal.status,
        company: row?.company ?? "",
        product: row?.product ?? "",
        guaranteeUntil: row?.guaranteeUntil ?? null,
        premiumCents: proposal.premiumCents,
        feeCents: proposal.feeCents,
        differenceCents: proposal.differenceCents,
        expiresAt: proposal.expiresAt.toISOString(),
      };
    });
  }

  /** EMI-04: confirmed; the customer signs the new documents and pays the difference. */
  async confirm(auth: AuthContext, requestId: string, returnUrl: string) {
    if (auth.kind !== "PRIVATE") throw new ProblemError("FORBIDDEN");
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const { request, proposal } = await this.open(tx, auth, requestId);
      await tx.$queryRaw`SELECT 1 FROM "QuoteRequest" WHERE "id" = ${request.id}::uuid FOR UPDATE`;
      if (!proposal || proposal.status !== "PROPOSED" || proposal.expiresAt <= now) {
        throw new ProblemError("CONFLICT", "No proposal to confirm", [
          { path: "proposal", issue: "PROPOSAL_CLOSED" },
        ]);
      }
      await asSystem(tx, () =>
        tx.nextOfferProposal.update({
          where: { id: proposal.id },
          data: { status: "ACCEPTED", decidedAt: now },
        }),
      );
      const user = await tx.user.findUniqueOrThrow({ where: { id: auth.userId } });
      const id = await this.acceptance.acceptNextOffer(
        tx,
        request,
        proposal,
        { kind: "PRIVATE", userId: auth.userId, customerLinkId: null, offerIds: null },
        { firstName: user.firstName, lastName: user.lastName },
        returnUrl,
        actorOf(auth),
      );
      await asSystem(tx, () =>
        addRequestEvent(tx, request, {
          type: "SECOND_OFFER_DECIDED",
          actorKind: "REQUESTER",
          actorUserId: auth.userId,
          at: now,
          details: { proposalId: proposal.id, decision: "ACCEPTED" },
        }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "SECOND_OFFER_DECIDED",
        targetType: "QuoteRequest",
        targetId: request.id,
        after: { proposalId: proposal.id, decision: "ACCEPTED" },
      });
      return this.acceptance.view(tx, id);
    });
  }

  /** EMI-04: refused (or not answered in time): the full refund, fee included. */
  async refuse(auth: AuthContext | null, requestId: string, expired = false) {
    const now = this.clock.now();
    const postbox = this.postbox();
    const out = await withContext(this.db, auth?.db ?? SYSTEM_CONTEXT, async (tx) => {
      const { request, proposal } = auth
        ? await this.open(tx, auth, requestId)
        : await asSystem(tx, async () => ({
            request: await tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } }),
            proposal: await tx.nextOfferProposal.findFirst({
              where: { quoteRequestId: requestId },
              orderBy: { createdAt: "desc" },
            }),
          }));
      await tx.$queryRaw`SELECT 1 FROM "QuoteRequest" WHERE "id" = ${request.id}::uuid FOR UPDATE`;
      if (!proposal || proposal.status !== "PROPOSED") {
        throw new ProblemError("CONFLICT", "No proposal to refuse", [
          { path: "proposal", issue: "PROPOSAL_CLOSED" },
        ]);
      }
      const paid = await asSystem(tx, () =>
        tx.acceptance.findFirstOrThrow({ where: { quoteRequestId: request.id, status: "PAID" } }),
      );
      await asSystem(tx, async () => {
        await tx.nextOfferProposal.update({
          where: { id: proposal.id },
          data: { status: expired ? "EXPIRED" : "REFUSED", decidedAt: now },
        });
        if (proposal.kind === "SECOND_OFFER") {
          transitionOffer("AWAITING_CUSTOMER", "NOT_CHOSEN");
          await tx.offer.update({
            where: { id: proposal.toOfferId },
            data: { status: "NOT_CHOSEN" },
          });
        }
        // Back «In emissione» until the refund closes the request (PAG-04).
        transitionRequest("ACCEPTED", "IN_ISSUANCE");
        await tx.quoteRequest.update({
          where: { id: request.id },
          data: { status: "IN_ISSUANCE" },
        });
        await addRequestEvent(tx, request, {
          type: "SECOND_OFFER_DECIDED",
          actorKind: auth ? "REQUESTER" : "SYSTEM",
          actorUserId: auth?.userId ?? null,
          at: now,
          details: { proposalId: proposal.id, decision: expired ? "EXPIRED" : "REFUSED" },
        });
        await recordDomainEvent(tx, {
          aggregateType: "QuoteRequest",
          aggregateId: request.id,
          type: "IssuanceChanged",
          at: now,
          actorUserId: auth?.userId ?? null,
          data: { proposalId: proposal.id },
        });
      });
      const refund = await this.refunds.request(tx, postbox, {
        quoteRequestId: request.id,
        reason: "BEFORE_ISSUANCE",
        premiumCents: paid.premiumCents,
        feeCents: paid.feeCents,
        requestedByUserId: auth?.userId ?? null,
        requestedByLabel: auth ? labels.refundRequester.customer : labels.refundRequester.system,
      });
      return { refundId: refund.id };
    });
    await postbox.flush();
    return out;
  }
}
