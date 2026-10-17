import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import type { PaymentsPort } from "@astax/adapters/payments";
import {
  addRequestEvent,
  asSystem,
  recordDomainEvent,
  withContext,
  type DbClient,
  type DbTransaction,
  type QuoteRequest,
  type RefundReason,
} from "@astax/db";
import { transitionRequest, type RequestStatus } from "@astax/shared/domain";
import { Inject, Injectable } from "@nestjs/common";
import { AcceptanceService } from "../acceptance/acceptance.service.js";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import type { ApiConfig } from "../config/config.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, CONFIG, DB, FIELD_CIPHER, PAYMENTS } from "../infra/tokens.js";
import labels from "../notifications/labels.it.json" with { type: "json" };
import { NotificationService } from "../notifications/notification.service.js";
import { Postbox, staffUsers } from "../notifications/postbox.js";

/**
 * PAG-04, PAG-05, decision 23: every refund is requested (by the system or
 * the back office), approved by the back office supervisor, and executed on
 * the same payment through the provider. Before the issuance everything,
 * fee included; after (withdrawal), the premium the agency indicates, the
 * fees kept; the premium is then recovered from the agency's next
 * remittance (RemittanceLine RECOVERY).
 */
@Injectable()
export class RefundsService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(PAYMENTS) private readonly payments: PaymentsPort,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(AcceptanceService) private readonly acceptance: AcceptanceService,
  ) {}

  /** A refund to approve, on the last captured payment of the request. */
  async request(
    tx: DbTransaction,
    postbox: Postbox,
    input: {
      quoteRequestId: string;
      reason: RefundReason;
      premiumCents: number;
      feeCents: number;
      recoverFromOrganizationId?: string | null;
      requestedByUserId: string | null;
      requestedByLabel: string;
    },
  ) {
    const now = this.clock.now();
    return asSystem(tx, async () => {
      const request = await tx.quoteRequest.findUniqueOrThrow({
        where: { id: input.quoteRequestId },
      });
      const payment = await tx.payment.findFirst({
        where: {
          status: { in: ["CAPTURED", "PARTIALLY_REFUNDED"] },
          acceptance: { quoteRequestId: request.id },
        },
        orderBy: { capturedAt: "asc" },
      });
      if (!payment)
        throw new ProblemError("CONFLICT", "No payment to refund", [
          { path: "payment", issue: "NOT_PAID" },
        ]);
      const refund = await tx.refund.create({
        data: {
          paymentId: payment.id,
          quoteRequestId: request.id,
          ownerUserId: request.ownerUserId,
          ownerOrganizationId: request.ownerOrganizationId,
          reason: input.reason,
          premiumCents: input.premiumCents,
          feeCents: input.feeCents,
          recoverFromOrganizationId: input.recoverFromOrganizationId ?? null,
          requestedByUserId: input.requestedByUserId,
          requestedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      });
      const link = `${this.config.ADMIN_URL}/pagamenti`;
      await postbox.tell(
        tx,
        await staffUsers(tx, ["BO_SUPERVISOR"]),
        "refund.approval_needed.bo",
        {
          codice: request.code,
          motivo: (labels.refundReason as Record<string, string>)[input.reason] ?? input.reason,
          richiedente_rimborso: input.requestedByLabel,
          link,
        },
        link,
        { quoteRequestId: request.id },
      );
      return refund;
    });
  }

  /** «Pagamenti», refunds (spec 06). */
  async list(auth: AuthContext) {
    return withContext(this.db, auth.db, async (tx) => {
      const refunds = await asSystem(tx, () =>
        tx.refund.findMany({ orderBy: { requestedAt: "desc" }, take: 200 }),
      );
      const requests = await asSystem(tx, () =>
        tx.quoteRequest.findMany({ where: { id: { in: refunds.map((r) => r.quoteRequestId) } } }),
      );
      return refunds.map((r) => ({
        id: r.id,
        code: requests.find((q) => q.id === r.quoteRequestId)?.code ?? "",
        reason: r.reason,
        premiumCents: r.premiumCents,
        feeCents: r.feeCents,
        status: r.status,
        requestedAt: r.requestedAt.toISOString(),
        approvedAt: r.approvedAt?.toISOString() ?? null,
        executedAt: r.executedAt?.toISOString() ?? null,
      }));
    });
  }

  /** PAG-05: the supervisor approves; the provider gives the money back. */
  async approve(auth: AuthContext, refundId: string) {
    const now = this.clock.now();
    const postbox = new Postbox(this.notifications, this.cipher, this.config.WEB_URL);
    const out = await withContext(this.db, auth.db, async (tx) => {
      const refund = await asSystem(tx, () => tx.refund.findUnique({ where: { id: refundId } }));
      if (!refund) throw new ProblemError("NOT_FOUND");
      await tx.$queryRaw`SELECT 1 FROM "QuoteRequest" WHERE "id" = ${refund.quoteRequestId}::uuid FOR UPDATE`;
      const fresh = await asSystem(tx, () =>
        tx.refund.findUniqueOrThrow({ where: { id: refundId } }),
      );
      if (fresh.status !== "REQUESTED") {
        throw new ProblemError("CONFLICT", "Already decided", [
          { path: "refund", issue: "ALREADY_DECIDED" },
        ]);
      }
      const payment = await asSystem(tx, () =>
        tx.payment.findUniqueOrThrow({ where: { id: fresh.paymentId } }),
      );
      const executed = await this.payments.refund({
        providerRef: payment.providerRef ?? "",
        idempotencyKey: fresh.id,
        amountCents: fresh.premiumCents + fresh.feeCents,
      });
      if (executed.status !== "EXECUTED") {
        await asSystem(tx, () =>
          tx.refund.update({ where: { id: fresh.id }, data: { status: "FAILED" } }),
        );
        throw new ProblemError("CONFLICT", "The provider refused the refund", [
          { path: "refund", issue: "REFUND_FAILED" },
        ]);
      }
      await asSystem(tx, async () => {
        await tx.refund.update({
          where: { id: fresh.id },
          data: {
            status: "EXECUTED",
            approvedByUserId: auth.userId,
            approvedAt: now,
            providerRef: executed.refundRef,
            executedAt: now,
          },
        });
        const refunded = await tx.refund.aggregate({
          where: { paymentId: payment.id, status: "EXECUTED" },
          _sum: { premiumCents: true, feeCents: true },
        });
        const total = (refunded._sum.premiumCents ?? 0) + (refunded._sum.feeCents ?? 0);
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status:
              total >= payment.premiumCents + payment.feeCents ? "REFUNDED" : "PARTIALLY_REFUNDED",
          },
        });
      });
      const request = await asSystem(tx, () =>
        tx.quoteRequest.findUniqueOrThrow({ where: { id: fresh.quoteRequestId } }),
      );
      // PAG-04: a full refund before the issuance closes the request.
      if (fresh.reason === "BEFORE_ISSUANCE" && request.status !== "CANCELLED") {
        transitionRequest(request.status as RequestStatus, "CANCELLED");
        await asSystem(tx, async () => {
          await tx.quoteRequest.update({
            where: { id: request.id },
            data: { status: "CANCELLED" },
          });
          await recordDomainEvent(tx, {
            aggregateType: "QuoteRequest",
            aggregateId: request.id,
            type: "IssuanceChanged",
            at: now,
            actorUserId: auth.userId,
            data: { refundId: fresh.id },
          });
        });
      }
      await asSystem(tx, () =>
        addRequestEvent(tx, request, {
          type: "REFUNDED",
          actorKind: "BACK_OFFICE",
          actorUserId: auth.userId,
          at: now,
          details: { refundId: fresh.id },
        }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "REFUND_APPROVED",
        targetType: "Refund",
        targetId: fresh.id,
        after: { premiumCents: fresh.premiumCents, feeCents: fresh.feeCents, reason: fresh.reason },
      });
      const requester = await asSystem(tx, () =>
        tx.user.findUniqueOrThrow({ where: { id: request.requesterUserId } }),
      );
      await postbox.tell(
        tx,
        [requester],
        "refund.executed",
        { nome: requester.firstName, veicolo: await this.vehicle(tx, request) },
        request.channel === "PRIVATE" ? `/preventivi/${request.id}` : `/richieste/${request.id}`,
        { quoteRequestId: request.id },
      );
      return { id: fresh.id, status: "EXECUTED" as const };
    });
    await postbox.flush();
    return out;
  }

  async reject(auth: AuthContext, refundId: string, reason: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const refund = await asSystem(tx, () => tx.refund.findUnique({ where: { id: refundId } }));
      if (!refund) throw new ProblemError("NOT_FOUND");
      if (refund.status !== "REQUESTED") throw new ProblemError("CONFLICT");
      await asSystem(tx, () =>
        tx.refund.update({ where: { id: refund.id }, data: { status: "REJECTED" } }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "REFUND_REJECTED",
        targetType: "Refund",
        targetId: refund.id,
        reason,
      });
      return { id: refund.id, status: "REJECTED" as const };
    });
  }

  /** Make and model only: no plate in notifications (rule 8). */
  private async vehicle(tx: DbTransaction, request: QuoteRequest) {
    const data = await this.acceptance.quoteDataOf(tx, request);
    return `${data.vehicle.make} ${data.vehicle.model}`;
  }
}
