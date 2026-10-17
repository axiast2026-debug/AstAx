import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import {
  asSystem,
  settingsAt,
  withContext,
  type DbClient,
  type DbTransaction,
  type Penalty,
} from "@astax/db";
import { formatDateTime, formatEuroCents } from "@astax/shared/format";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import type { ApiConfig } from "../config/config.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, CONFIG, DB, FIELD_CIPHER } from "../infra/tokens.js";
import labels from "../notifications/labels.it.json" with { type: "json" };
import { NotificationService } from "../notifications/notification.service.js";
import { Postbox, staffUsers, type PostboxUser } from "../notifications/postbox.js";

const DAY_MS = 86_400_000;

/**
 * EMI-05, decision 29: a penalty is proposed (by the system or the back
 * office), applied by the back office supervisor, contestable by the agency
 * within `penalties.contestDays`, decided by the administrator. Applied and
 * upheld penalties are held back from the remittances (CONT-01); a contested
 * one waits for the decision. EMI-06: the administrator confirms or revokes an
 * automatic suspension.
 */
@Injectable()
export class PenaltiesService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  private postbox() {
    return new Postbox(this.notifications, this.cipher, this.config.WEB_URL);
  }

  private async view(tx: DbTransaction, penalties: Penalty[]) {
    return asSystem(tx, async () => {
      const [orgs, requests] = await Promise.all([
        tx.organization.findMany({ where: { id: { in: penalties.map((p) => p.organizationId) } } }),
        tx.quoteRequest.findMany({
          where: {
            id: { in: penalties.flatMap((p) => (p.quoteRequestId ? [p.quoteRequestId] : [])) },
          },
        }),
      ]);
      return penalties.map((p) => ({
        id: p.id,
        agency: orgs.find((o) => o.id === p.organizationId)?.legalName ?? "",
        organizationId: p.organizationId,
        code: requests.find((r) => r.id === p.quoteRequestId)?.code ?? null,
        type: p.type,
        amountCents: p.amountCents,
        status: p.status,
        reason: p.reason,
        proposedAt: p.proposedAt.toISOString(),
        appliedAt: p.appliedAt?.toISOString() ?? null,
        contestUntil: p.contestUntil?.toISOString() ?? null,
        contestText: p.contestText,
        decision: p.decision,
      }));
    });
  }

  /** The back office and the administrator: every penalty, the open ones first. */
  async list(auth: AuthContext) {
    return withContext(this.db, auth.db, async (tx) => {
      const penalties = await asSystem(tx, () =>
        tx.penalty.findMany({ orderBy: [{ status: "asc" }, { proposedAt: "desc" }], take: 200 }),
      );
      return this.view(tx, penalties);
    });
  }

  /** The agency's own (spec 04 «Contabilità»): applied, contested, decided. */
  async agencyList(auth: AuthContext) {
    const m = auth.membership;
    if (!m || m.organizationType !== "AGENCY") throw new ProblemError("NOT_FOUND");
    return withContext(this.db, auth.db, async (tx) => {
      const penalties = await tx.penalty.findMany({
        where: { organizationId: m.organizationId, status: { not: "PROPOSED" } },
        orderBy: { proposedAt: "desc" },
      });
      return this.view(tx, penalties);
    });
  }

  /** EMI-05, EMI-07: the back office proposes (circumvention: the administrator's case). */
  async propose(
    auth: AuthContext,
    input: {
      organizationId: string;
      type: "LATE_ISSUANCE" | "MISSED_ISSUANCE" | "CIRCUMVENTION";
      quoteRequestId?: string;
      reason: string;
    },
  ) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const s = await settingsAt(
        tx,
        [
          "penalties.lateIssuanceCents",
          "penalties.missedIssuanceCents",
          "penalties.circumventionCents",
        ],
        now,
      );
      const amountCents = {
        LATE_ISSUANCE: s["penalties.lateIssuanceCents"],
        MISSED_ISSUANCE: s["penalties.missedIssuanceCents"],
        CIRCUMVENTION: s["penalties.circumventionCents"],
      }[input.type];
      const agency = await tx.organization.findUnique({ where: { id: input.organizationId } });
      if (!agency || agency.type !== "AGENCY") throw new ProblemError("NOT_FOUND");
      const penalty = await asSystem(tx, () =>
        tx.penalty.create({
          data: {
            organizationId: input.organizationId,
            type: input.type,
            amountCents,
            quoteRequestId: input.quoteRequestId ?? null,
            reason: input.reason,
            proposedByUserId: auth.userId,
            proposedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "PENALTY_PROPOSED",
        targetType: "Penalty",
        targetId: penalty.id,
        reason: input.reason,
        after: { type: input.type, amountCents },
      });
      return { id: penalty.id };
    });
  }

  private async locked(tx: DbTransaction, id: string) {
    const penalty = await asSystem(tx, async () => {
      await tx.$queryRaw`SELECT 1 FROM "Penalty" WHERE "id" = ${id}::uuid FOR UPDATE`;
      return tx.penalty.findUnique({ where: { id } });
    });
    if (!penalty) throw new ProblemError("NOT_FOUND");
    return penalty;
  }

  private async owners(tx: DbTransaction, organizationId: string): Promise<PostboxUser[]> {
    return asSystem(tx, async () =>
      (
        await tx.membership.findMany({
          where: { organizationId, role: "OWNER", status: "ACTIVE" },
          include: { user: true },
        })
      ).map((m) => m.user),
    );
  }

  private async codeOf(tx: DbTransaction, penalty: Penalty) {
    if (!penalty.quoteRequestId) return "";
    const request = await asSystem(tx, () =>
      tx.quoteRequest.findUnique({ where: { id: penalty.quoteRequestId ?? "" } }),
    );
    return request?.code ?? "";
  }

  /** EMI-05: the supervisor applies; the agency may contest within the days. */
  async apply(auth: AuthContext, id: string) {
    const now = this.clock.now();
    const postbox = this.postbox();
    const out = await withContext(this.db, auth.db, async (tx) => {
      const penalty = await this.locked(tx, id);
      if (penalty.status !== "PROPOSED") throw this.wrongState();
      const { "penalties.contestDays": days } = await settingsAt(
        tx,
        ["penalties.contestDays"],
        now,
      );
      const contestUntil = new Date(now.getTime() + days * DAY_MS);
      await asSystem(tx, () =>
        tx.penalty.update({
          where: { id },
          data: { status: "APPLIED", appliedByUserId: auth.userId, appliedAt: now, contestUntil },
        }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "PENALTY_APPLIED",
        targetType: "Penalty",
        targetId: id,
        after: { amountCents: penalty.amountCents },
      });
      const link = `${this.config.WEB_URL}/contabilita`;
      await postbox.tell(
        tx,
        await this.owners(tx, penalty.organizationId),
        "penalty.applied",
        {
          codice: await this.codeOf(tx, penalty),
          tipo_penale: (labels.penaltyType as Record<string, string>)[penalty.type] ?? penalty.type,
          importo: formatEuroCents(penalty.amountCents),
          scadenza_contestazione: formatDateTime(contestUntil),
          link,
        },
        link,
        { penaltyId: id },
      );
      return { id, status: "APPLIED" as const };
    });
    await postbox.flush();
    return out;
  }

  /** The back office withdraws a penalty not yet decided (with the reason, logged). */
  async cancel(auth: AuthContext, id: string, reason: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const penalty = await this.locked(tx, id);
      if (!["PROPOSED", "APPLIED"].includes(penalty.status)) throw this.wrongState();
      await asSystem(tx, () =>
        tx.penalty.update({ where: { id }, data: { status: "CANCELLED", decision: reason } }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "PENALTY_CANCELLED",
        targetType: "Penalty",
        targetId: id,
        reason,
      });
      return { id, status: "CANCELLED" as const };
    });
  }

  /** EMI-05: the agency contests within `penalties.contestDays` from the application. */
  async contest(auth: AuthContext, id: string, text: string) {
    const now = this.clock.now();
    const m = auth.membership;
    if (!m || m.organizationType !== "AGENCY") throw new ProblemError("NOT_FOUND");
    const postbox = this.postbox();
    const out = await withContext(this.db, auth.db, async (tx) => {
      const penalty = await this.locked(tx, id);
      if (penalty.organizationId !== m.organizationId) throw new ProblemError("NOT_FOUND");
      if (penalty.status !== "APPLIED") throw this.wrongState();
      if (!penalty.contestUntil || penalty.contestUntil <= now) {
        throw new ProblemError("CONFLICT", "The time to contest is over", [
          { path: "penalty", issue: "CONTEST_CLOSED" },
        ]);
      }
      await asSystem(tx, () =>
        tx.penalty.update({
          where: { id },
          data: { status: "CONTESTED", contestText: text, contestedAt: now },
        }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "PENALTY_CONTESTED",
        targetType: "Penalty",
        targetId: id,
      });
      const agency = await tx.organization.findUniqueOrThrow({
        where: { id: penalty.organizationId },
      });
      const link = `${this.config.ADMIN_URL}/organizzazioni`;
      await postbox.tell(
        tx,
        await staffUsers(tx, ["ADMIN"]),
        "penalty.contested",
        {
          agenzia: agency.legalName,
          codice: await this.codeOf(tx, penalty),
          tipo_penale: (labels.penaltyType as Record<string, string>)[penalty.type] ?? penalty.type,
          link,
        },
        link,
        { penaltyId: id },
      );
      return { id, status: "CONTESTED" as const };
    });
    await postbox.flush();
    return out;
  }

  /** EMI-05: the administrator's final decision on a contested penalty. */
  async decide(
    auth: AuthContext,
    id: string,
    input: { outcome: "UPHELD" | "CANCELLED"; decision: string },
  ) {
    const now = this.clock.now();
    const postbox = this.postbox();
    const out = await withContext(this.db, auth.db, async (tx) => {
      const penalty = await this.locked(tx, id);
      if (penalty.status !== "CONTESTED") throw this.wrongState();
      await asSystem(tx, () =>
        tx.penalty.update({
          where: { id },
          data: {
            status: input.outcome,
            decision: input.decision,
            decidedByUserId: auth.userId,
            decidedAt: now,
          },
        }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "PENALTY_DECIDED",
        targetType: "Penalty",
        targetId: id,
        reason: input.decision,
        after: { outcome: input.outcome },
      });
      const link = `${this.config.WEB_URL}/contabilita`;
      await postbox.tell(
        tx,
        await this.owners(tx, penalty.organizationId),
        "penalty.contest_decided",
        {
          codice: await this.codeOf(tx, penalty),
          esito: (labels.penaltyOutcome as Record<string, string>)[input.outcome] ?? input.outcome,
          motivazione: input.decision,
          link,
        },
        link,
        { penaltyId: id },
      );
      return { id, status: input.outcome };
    });
    await postbox.flush();
    return out;
  }

  // ---------------------------------------------------------------- suspensions (EMI-06)

  async suspensions(auth: AuthContext) {
    return withContext(this.db, auth.db, async (tx) =>
      asSystem(tx, async () => {
        const rows = await tx.agencySuspension.findMany({
          orderBy: { startedAt: "desc" },
          take: 100,
        });
        const orgs = await tx.organization.findMany({
          where: { id: { in: rows.map((r) => r.organizationId) } },
        });
        return rows.map((r) => ({
          id: r.id,
          agency: orgs.find((o) => o.id === r.organizationId)?.legalName ?? "",
          reason: r.reason,
          startedAt: r.startedAt.toISOString(),
          confirmedAt: r.confirmedAt?.toISOString() ?? null,
          revokedAt: r.revokedAt?.toISOString() ?? null,
        }));
      }),
    );
  }

  /** EMI-06: the administrator confirms the suspension or revokes it (the agency is invited again). */
  async decideSuspension(
    auth: AuthContext,
    id: string,
    outcome: "CONFIRM" | "REVOKE",
    reason: string,
  ) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const suspension = await asSystem(tx, () =>
        tx.agencySuspension.findUnique({ where: { id } }),
      );
      if (!suspension) throw new ProblemError("NOT_FOUND");
      if (suspension.revokedAt || (outcome === "CONFIRM" && suspension.confirmedAt))
        throw this.wrongState();
      await asSystem(tx, () =>
        tx.agencySuspension.update({
          where: { id },
          data:
            outcome === "CONFIRM"
              ? { confirmedByUserId: auth.userId, confirmedAt: now }
              : { revokedByUserId: auth.userId, revokedAt: now },
        }),
      );
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "AGENCY_SUSPENSION_DECIDED",
        targetType: "Organization",
        targetId: suspension.organizationId,
        reason,
        after: { outcome },
      });
      return { id, outcome };
    });
  }

  private wrongState() {
    return new ProblemError("CONFLICT", "Not possible in this state", [
      { path: "penalty", issue: "WRONG_STATE" },
    ]);
  }
}
