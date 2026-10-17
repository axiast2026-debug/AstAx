import { randomUUID } from "node:crypto";
import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import type { ObjectStoragePort } from "@astax/adapters/storage";
import {
  asSystem,
  createRenewalDraft,
  recordDomainEvent,
  settingsAt,
  withContext,
  type DbClient,
  type DbTransaction,
  type Policy,
} from "@astax/db";
import { addCalendarDays, monthBounds, renewalNoticeDate } from "@astax/shared/domain";
import { dbDateToCalendarDate, romeCalendarDate } from "@astax/shared/format";
import { Inject, Injectable } from "@nestjs/common";
import { AcceptanceService } from "../acceptance/acceptance.service.js";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, DB, FIELD_CIPHER, OBJECT_STORAGE } from "../infra/tokens.js";
import { requesterScope } from "../requests/request-support.js";

/**
 * Process 10, spec 03 «Rinnova in asta», spec 02 «Rinnovi», proposal E: the
 * renewal is a new request, a draft filled with the saved data, from the
 * `renewal.daysBefore` before the end; the requester adds the new risk
 * certificate and submits it. The broker sees the ends of the next
 * `renewal.brokerHorizonDays`, switches the automatic renewal per customer
 * (the draft is then prepared by PolicyWorkflow) and starts the renewals of a
 * month at once. The agency that issued the policy is invited to the auction.
 */
@Injectable()
export class RenewalsService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AcceptanceService) private readonly acceptance: AcceptanceService,
  ) {}

  /** Rule 4: an access to something not one's own is a denial in the audit log, then 404. */
  private async denied(auth: AuthContext, targetType: string, targetId: string): Promise<never> {
    await this.audit.record(actorOf(auth), { action: "ACCESS_DENIED", targetType, targetId });
    throw new ProblemError("NOT_FOUND");
  }

  /** The caller's policies (row security, and VIS-13 for a broker's operator). */
  private async ownPolicies(tx: DbTransaction, auth: AuthContext, where: object = {}) {
    const requests = await tx.quoteRequest.findMany({
      where: requesterScope(auth),
      select: { id: true },
    });
    return tx.policy.findMany({
      where: { quoteRequestId: { in: requests.map((r) => r.id) }, ...where },
      orderBy: { endDate: "asc" },
    });
  }

  private async draft(tx: DbTransaction, auth: AuthContext, policy: Policy) {
    const now = this.clock.now();
    const out = await asSystem(tx, () =>
      createRenewalDraft(
        tx,
        this.cipher,
        async (key, mime) => {
          const copy = `renewals/${randomUUID()}`;
          await this.storage.put({
            key: copy,
            body: await this.storage.get(key),
            contentType: mime,
          });
          return copy;
        },
        { policyId: policy.id, actorKind: "REQUESTER", actorUserId: auth.userId },
        now,
      ),
    );
    if (out.created) {
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "RENEWAL_STARTED",
        targetType: "Policy",
        targetId: policy.id,
        after: { requestId: out.requestId },
      });
      // PolicyWorkflow reads the policy again (decision 39).
      await asSystem(tx, () =>
        recordDomainEvent(tx, {
          aggregateType: "QuoteRequest",
          aggregateId: policy.quoteRequestId,
          type: "PolicyChanged",
          at: now,
          actorUserId: auth.userId,
          data: { policyId: policy.id },
        }),
      );
    }
    return out;
  }

  /** «Rinnova in asta»: from the renewal notice day until the end of the policy. */
  async renew(auth: AuthContext, policyId: string) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const [policy] = await this.ownPolicies(tx, auth, { id: policyId });
      if (!policy) return this.denied(auth, "Policy", policyId);
      const { "renewal.daysBefore": days } = await settingsAt(tx, ["renewal.daysBefore"], now);
      const today = romeCalendarDate(now);
      const end = dbDateToCalendarDate(policy.endDate);
      const open =
        ["ACTIVE", "EXPIRING"].includes(policy.status) &&
        today >= renewalNoticeDate(end, days) &&
        today <= end;
      if (!open && !policy.renewalRequestId) {
        throw new ProblemError("CONFLICT", "Not renewable now", [
          { path: "policy", issue: "NOT_RENEWABLE_YET" },
        ]);
      }
      const out = await this.draft(tx, auth, policy);
      return { requestId: out.requestId, code: out.code };
    });
  }

  /** Spec 02 «Rinnovi»: the ends of the next days, with the automatic renewal and the draft. */
  async brokerRenewals(auth: AuthContext) {
    if (auth.membership?.organizationType !== "BROKER") throw new ProblemError("NOT_FOUND");
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const s = await settingsAt(tx, ["renewal.brokerHorizonDays", "renewal.daysBefore"], now);
      const today = romeCalendarDate(now);
      const policies = await this.ownPolicies(tx, auth, {
        status: { in: ["ACTIVE", "EXPIRING"] },
        endDate: {
          gte: new Date(today),
          lte: new Date(addCalendarDays(today, s["renewal.brokerHorizonDays"])),
        },
      });
      const companies = await tx.insuranceCompany.findMany({ select: { id: true, name: true } });
      const out = [];
      for (const p of policies) {
        const request = await tx.quoteRequest.findUniqueOrThrow({
          where: { id: p.quoteRequestId },
        });
        const data = await this.acceptance.quoteDataOf(tx, request);
        const holder = data.policyHolder;
        const renewal = p.renewalRequestId
          ? await tx.quoteRequest.findUnique({
              where: { id: p.renewalRequestId },
              select: { id: true, code: true, status: true },
            })
          : null;
        const end = dbDateToCalendarDate(p.endDate);
        out.push({
          id: p.id,
          policyNumber: p.policyNumber,
          client:
            holder.kind === "COMPANY"
              ? holder.companyName
              : `${holder.givenName} ${holder.surname}`,
          vehicle: `${data.vehicle.make} ${data.vehicle.model}`,
          company: companies.find((c) => c.id === p.companyId)?.name ?? "",
          endDate: end,
          premiumCents: p.premiumCents,
          autoRenewal: p.autoRenewal,
          renewable: today >= renewalNoticeDate(end, s["renewal.daysBefore"]),
          renewal,
        });
      }
      // Rule 4: the customers' names and vehicles were opened.
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "RENEWALS_VIEWED",
        targetType: "Organization",
        targetId: auth.membership?.organizationId ?? null,
        after: { policies: out.length },
      });
      return {
        horizonDays: s["renewal.brokerHorizonDays"],
        noticeDays: s["renewal.daysBefore"],
        policies: out,
      };
    });
  }

  /** The automatic renewal of one customer's policy, on or off. */
  async setAutoRenewal(auth: AuthContext, policyId: string, enabled: boolean) {
    if (auth.membership?.organizationType !== "BROKER") throw new ProblemError("NOT_FOUND");
    return withContext(this.db, auth.db, async (tx) => {
      const [policy] = await this.ownPolicies(tx, auth, { id: policyId });
      if (!policy) return this.denied(auth, "Policy", policyId);
      await asSystem(tx, () =>
        tx.policy.update({
          where: { id: policy.id },
          data: { autoRenewal: enabled, updatedAt: this.clock.now() },
        }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "AUTO_RENEWAL_SET",
        targetType: "Policy",
        targetId: policy.id,
        before: { autoRenewal: policy.autoRenewal },
        after: { autoRenewal: enabled },
      });
      return { id: policy.id, autoRenewal: enabled };
    });
  }

  /**
   * Spec 02: the renewal drafts of every policy ending in a month, at once,
   * for those whose renewal is open (`renewal.daysBefore`, as «Rinnova in
   * asta»); one transaction per policy, so a long list never times out.
   */
  async bulk(auth: AuthContext, period: string) {
    if (auth.membership?.organizationType !== "BROKER") throw new ProblemError("NOT_FOUND");
    const { from, to } = monthBounds(period);
    const now = this.clock.now();
    const { open, notYet } = await withContext(this.db, auth.db, async (tx) => {
      const { "renewal.daysBefore": days } = await settingsAt(tx, ["renewal.daysBefore"], now);
      const today = romeCalendarDate(now);
      const policies = await this.ownPolicies(tx, auth, {
        status: { in: ["ACTIVE", "EXPIRING"] },
        renewalRequestId: null,
        endDate: { gte: new Date(from), lte: new Date(to) },
      });
      const ready = policies.filter(
        (p) => today >= renewalNoticeDate(dbDateToCalendarDate(p.endDate), days),
      );
      return { open: ready, notYet: policies.length - ready.length };
    });
    let created = 0;
    for (const p of open) {
      const out = await withContext(this.db, auth.db, (tx) => this.draft(tx, auth, p));
      if (out.created) created += 1;
    }
    return { period, created, notYet };
  }
}
