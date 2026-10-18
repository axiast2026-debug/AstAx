import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import {
  asSystem,
  settingsAt,
  withContext,
  type DbClient,
  type DbTransaction,
  type Policy,
} from "@astax/db";
import { addCalendarDays } from "@astax/shared/domain";
import { romeCalendarDate } from "@astax/shared/format";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import type { ApiConfig } from "../config/config.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, CONFIG, DB, FIELD_CIPHER } from "../infra/tokens.js";
import labels from "../notifications/labels.it.json" with { type: "json" };
import { NotificationService } from "../notifications/notification.service.js";
import { agencyUsers, Postbox } from "../notifications/postbox.js";
import { RefundsService } from "../refunds/refunds.service.js";
import { requesterScope } from "../requests/request-support.js";

/**
 * S08, PAG-04, PAG-05: the withdrawal within `withdrawal.days` of the
 * issuance (to be validated by the lawyer). The customer (or the back office
 * for them) asks; the agency that issued indicates the refundable premium
 * under the company's terms; that refund goes to the supervisor's approval;
 * once executed the policy is «Receduta», the request «Annullata», and the
 * premium is recovered from the agency in the next remittance (RECOVERY). The
 * customer's and the agency's fees stay due: no credit note.
 */
@Injectable()
export class WithdrawalsService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(RefundsService) private readonly refunds: RefundsService,
  ) {}

  /** Rule 4: an access to something not one's own is a denial in the audit log, then 404. */
  private async denied(auth: AuthContext, targetType: string, targetId: string): Promise<never> {
    await this.audit.record(actorOf(auth), { action: "ACCESS_DENIED", targetType, targetId });
    throw new ProblemError("NOT_FOUND");
  }

  private postbox() {
    return new Postbox(this.notifications, this.cipher, this.config.WEB_URL);
  }

  private wrong(issue: string) {
    return new ProblemError("CONFLICT", "Not possible", [{ path: "withdrawal", issue }]);
  }

  private async open(tx: DbTransaction, auth: AuthContext, policy: Policy) {
    const now = this.clock.now();
    const { "withdrawal.days": days, "withdrawal.onPlatform": onPlatform } = await settingsAt(
      tx,
      ["withdrawal.days", "withdrawal.onPlatform"],
      now,
    );
    // Question 18 (Dan, answer A): after the issuance withdrawal and cancellation
    // happen outside AstAx, for the customer and for the back office alike.
    if (!onPlatform) throw this.wrong("NOT_ON_PLATFORM");
    if (!["ACTIVE", "EXPIRING"].includes(policy.status)) throw this.wrong("NOT_ACTIVE");
    if (romeCalendarDate(now) > addCalendarDays(romeCalendarDate(policy.issuedAt), days)) {
      throw this.wrong("OUT_OF_TERM");
    }
    const existing = await asSystem(tx, () =>
      tx.consumerWithdrawal.findUnique({ where: { policyId: policy.id } }),
    );
    if (existing && existing.status !== "REJECTED") throw this.wrong("ALREADY_REQUESTED");
    const postbox = this.postbox();
    // A rejected withdrawal may be asked again: the same row starts over.
    const fields = {
      requestedAt: now,
      requestedByUserId: auth.userId,
      refundableCents: null,
      pricedByUserId: null,
      pricedAt: null,
      status: "REQUESTED" as const,
      decidedByUserId: null,
      decidedAt: null,
      refundId: null,
      updatedAt: now,
    };
    const withdrawal = await asSystem(tx, () =>
      existing
        ? tx.consumerWithdrawal.update({ where: { id: existing.id }, data: fields })
        : tx.consumerWithdrawal.create({
            data: {
              ...fields,
              policyId: policy.id,
              quoteRequestId: policy.quoteRequestId,
              organizationId: policy.organizationId,
              ownerUserId: policy.ownerUserId,
              ownerOrganizationId: policy.ownerOrganizationId,
              createdAt: now,
            },
          }),
    );
    await this.audit.inTransaction(tx, actorOf(auth), {
      action: "WITHDRAWAL_REQUESTED",
      targetType: "Policy",
      targetId: policy.id,
    });
    const request = await asSystem(tx, () =>
      tx.quoteRequest.findUniqueOrThrow({ where: { id: policy.quoteRequestId } }),
    );
    const link = `${this.config.WEB_URL}/polizze`;
    await postbox.tell(
      tx,
      await agencyUsers(tx, policy.organizationId, policy.issuedByUserId),
      "withdrawal.requested.agency",
      { codice: request.code, numero_polizza: policy.policyNumber, link },
      link,
      { withdrawalId: withdrawal.id },
    );
    return { withdrawal, postbox };
  }

  /** Spec 03: the requester's own policy (row security and VIS-13). */
  async request(auth: AuthContext, policyId: string) {
    const out = await withContext(this.db, auth.db, async (tx) => {
      const requests = await tx.quoteRequest.findMany({
        where: requesterScope(auth),
        select: { id: true },
      });
      const policy = await tx.policy.findFirst({
        where: { id: policyId, quoteRequestId: { in: requests.map((r) => r.id) } },
      });
      if (!policy) return this.denied(auth, "Policy", policyId);
      return this.open(tx, auth, policy);
    });
    await out.postbox.flush();
    return { id: out.withdrawal.id, status: out.withdrawal.status };
  }

  /** Spec 06 «Recessi e annullamenti»: the back office for the customer (a PEC, a call). */
  async requestForCustomer(auth: AuthContext, policyId: string) {
    const out = await withContext(this.db, auth.db, async (tx) => {
      const policy = await asSystem(tx, () => tx.policy.findUnique({ where: { id: policyId } }));
      if (!policy) throw new ProblemError("NOT_FOUND");
      return this.open(tx, auth, policy);
    });
    await out.postbox.flush();
    return { id: out.withdrawal.id, status: out.withdrawal.status };
  }

  private async rows(tx: DbTransaction, where: object) {
    const withdrawals = await asSystem(tx, () =>
      tx.consumerWithdrawal.findMany({ where, orderBy: { requestedAt: "desc" }, take: 200 }),
    );
    const [policies, requests] = await asSystem(tx, () =>
      Promise.all([
        tx.policy.findMany({ where: { id: { in: withdrawals.map((w) => w.policyId) } } }),
        tx.quoteRequest.findMany({
          where: { id: { in: withdrawals.map((w) => w.quoteRequestId) } },
          select: { id: true, code: true },
        }),
      ]),
    );
    return withdrawals.map((w) => {
      const p = policies.find((x) => x.id === w.policyId);
      return {
        id: w.id,
        code: requests.find((q) => q.id === w.quoteRequestId)?.code ?? "",
        policyNumber: p?.policyNumber ?? "",
        premiumCents: p?.premiumCents ?? 0,
        requestedAt: w.requestedAt.toISOString(),
        refundableCents: w.refundableCents,
        status: w.status,
      };
    });
  }

  /** The issuing agency's withdrawals to price (withdrawal.indicateRefundablePremium). */
  async agencyList(auth: AuthContext) {
    const m = auth.membership;
    if (!m || m.organizationType !== "AGENCY") throw new ProblemError("NOT_FOUND");
    return withContext(this.db, auth.db, (tx) =>
      this.rows(tx, { organizationId: m.organizationId }),
    );
  }

  async backOfficeList(auth: AuthContext) {
    return withContext(this.db, auth.db, (tx) => this.rows(tx, {}));
  }

  /** PAG-04: the refundable premium under the company's terms, never above the premium. */
  async price(auth: AuthContext, id: string, refundableCents: number) {
    const m = auth.membership;
    if (!m || m.organizationType !== "AGENCY") throw new ProblemError("NOT_FOUND");
    const postbox = this.postbox();
    const out = await withContext(this.db, auth.db, async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "ConsumerWithdrawal" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const w = await asSystem(tx, () => tx.consumerWithdrawal.findUnique({ where: { id } }));
      if (!w || w.organizationId !== m.organizationId)
        return this.denied(auth, "ConsumerWithdrawal", id);
      if (w.status !== "REQUESTED") throw this.wrong("ALREADY_PRICED");
      const policy = await asSystem(tx, () =>
        tx.policy.findUniqueOrThrow({ where: { id: w.policyId } }),
      );
      if (refundableCents > policy.premiumCents) {
        throw new ProblemError("VALIDATION_FAILED", undefined, [
          { path: "refundableCents", issue: "ABOVE_PREMIUM" },
        ]);
      }
      const now = this.clock.now();
      const refund = await this.refunds.request(tx, postbox, {
        quoteRequestId: w.quoteRequestId,
        reason: "WITHDRAWAL",
        premiumCents: refundableCents,
        // PAG-04: the customer's fee stays due.
        feeCents: 0,
        recoverFromOrganizationId: policy.organizationId,
        requestedByUserId: auth.userId,
        requestedByLabel: labels.refundRequester.agency,
      });
      await asSystem(tx, () =>
        tx.consumerWithdrawal.update({
          where: { id },
          data: {
            refundableCents,
            pricedByUserId: auth.userId,
            pricedAt: now,
            status: "PRICED",
            refundId: refund.id,
            updatedAt: now,
          },
        }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "WITHDRAWAL_PRICED",
        targetType: "ConsumerWithdrawal",
        targetId: id,
        after: { refundableCents, refundId: refund.id },
      });
      return { id, status: "PRICED" as const };
    });
    await postbox.flush();
    return out;
  }
}
