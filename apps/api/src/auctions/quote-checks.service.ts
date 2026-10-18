import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import { asSystem, withContext, type DbClient } from "@astax/db";
import { transitionOffer } from "@astax/shared/domain";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import type { ApiConfig } from "../config/config.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, CONFIG, DB, FIELD_CIPHER } from "../infra/tokens.js";
import { NotificationService } from "../notifications/notification.service.js";

/**
 * OFF-09, decision 16: the back office sees the PDF quotes that differ from the
 * declared offer and decides: exclude the offer, with a reason, until the
 * customer has accepted it, or keep it. The check never excludes by itself.
 */
@Injectable()
export class QuoteChecksService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  /** The flags still to decide, and the last decided ones. */
  async list(auth: AuthContext) {
    return withContext(this.db, auth.db, async (tx) => {
      const checks = await tx.offerQuoteCheck.findMany({
        where: { result: "MISMATCH" },
        include: { offer: true },
        orderBy: [{ decision: { sort: "asc", nulls: "first" } }, { checkedAt: "desc" }],
        take: 100,
      });
      const [requests, organizations, companies] = await Promise.all([
        tx.quoteRequest.findMany({
          where: { id: { in: checks.map((c) => c.quoteRequestId) } },
          select: { id: true, code: true, status: true },
        }),
        tx.organization.findMany({
          where: { id: { in: checks.map((c) => c.offer.organizationId) } },
          select: { id: true, legalName: true },
        }),
        tx.insuranceCompany.findMany(),
      ]);
      return checks.map((c) => {
        const request = requests.find((r) => r.id === c.quoteRequestId);
        return {
          id: c.id,
          requestCode: request?.code ?? "",
          agency: organizations.find((o) => o.id === c.offer.organizationId)?.legalName ?? "",
          company: companies.find((x) => x.id === c.offer.companyId)?.name ?? "",
          offerStatus: c.offer.status,
          differences: c.differences,
          checkedAt: c.checkedAt.toISOString(),
          decision: c.decision,
          decidedAt: c.decidedAt?.toISOString() ?? null,
          // OFF-09: only until the customer has accepted it.
          excludable:
            c.decision === null &&
            c.offer.status === "AWAITING_CUSTOMER" &&
            request?.status === "OFFERS_AVAILABLE",
        };
      });
    });
  }

  async decide(
    auth: AuthContext,
    checkId: string,
    input: { decision: "EXCLUDED" | "KEPT"; reason: string },
  ) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const check = await tx.offerQuoteCheck.findUnique({
        where: { id: checkId },
        include: { offer: true },
      });
      if (!check || check.result !== "MISMATCH") throw new ProblemError("NOT_FOUND");
      await tx.$queryRaw`SELECT 1 FROM "QuoteRequest" WHERE "id" = ${check.quoteRequestId}::uuid FOR UPDATE`;
      const request = await tx.quoteRequest.findUniqueOrThrow({
        where: { id: check.quoteRequestId },
      });
      const offer = await tx.offer.findUniqueOrThrow({ where: { id: check.offerId } });
      if (check.decision !== null) {
        throw new ProblemError("CONFLICT", "Already decided", [
          { path: "check", issue: "ALREADY_DECIDED" },
        ]);
      }
      if (
        input.decision === "EXCLUDED" &&
        (offer.status !== "AWAITING_CUSTOMER" || request.status !== "OFFERS_AVAILABLE")
      ) {
        throw new ProblemError("CONFLICT", "The customer has already accepted", [
          { path: "offer", issue: "ALREADY_ACCEPTED" },
        ]);
      }
      await tx.offerQuoteCheck.update({
        where: { id: check.id },
        data: { decision: input.decision, decidedAt: now, decidedByUserId: auth.userId },
      });
      if (input.decision === "EXCLUDED") {
        transitionOffer("AWAITING_CUSTOMER", "EXCLUDED");
        // A system step after the permission check: offers are written by the worker only.
        await asSystem(tx, () =>
          tx.offer.update({
            where: { id: offer.id },
            data: { status: "EXCLUDED", exclusionReason: input.reason },
          }),
        );
      }
      await this.audit.inTransaction(tx, actorOf(auth), {
        action:
          input.decision === "EXCLUDED" ? "OFFER_EXCLUDED_AFTER_REVIEW" : "OFFER_KEPT_AFTER_REVIEW",
        targetType: "Offer",
        targetId: offer.id,
        reason: input.reason,
      });
      if (input.decision === "EXCLUDED") {
        const members = await asSystem(tx, () =>
          // VIS-06: only who may see this offer: owner, supervisors, its author,
          // operators allowed to see their colleagues' offers.
          tx.membership.findMany({
            where: {
              organizationId: offer.organizationId,
              status: "ACTIVE",
              OR: [
                { role: { in: ["OWNER", "SUPERVISOR"] } },
                { userId: offer.userId },
                { canSeeColleagueOffers: true },
              ],
            },
            include: { user: true },
          }),
        );
        const variables = {
          codice: request.code,
          link: `${this.config.WEB_URL}/le-mie-offerte`,
        };
        const outbound = await this.notifications.deliver(
          tx,
          members.map((m) => ({
            userId: m.user.id,
            locale: m.user.locale,
            email: m.user.emailEnc ? this.cipher.decrypt(m.user.emailEnc) : null,
            phone: null,
          })),
          "offer.excluded_after_review",
          () => variables,
          "/le-mie-offerte",
          { offerId: offer.id },
        );
        return { decision: input.decision, outbound };
      }
      return { decision: input.decision, outbound: [] };
    }).then(async (outcome) => {
      // After the commit, identifiers only in the logs (rule 8).
      await this.notifications.send(outcome.outbound);
      return { decision: outcome.decision };
    });
  }
}
