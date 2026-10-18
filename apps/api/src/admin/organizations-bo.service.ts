import type { Clock } from "@astax/adapters/clock";
import { asSystem, withContext, type DbClient, type DbTransaction } from "@astax/db";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, DB } from "../infra/tokens.js";

const isoDay = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

/**
 * Spec 06 «Agenzie e broker» and spec 07 (exclusions): the list with
 * participation, penalties, flags and expiring documents; suspend and
 * reactivate with a reason (an agency keeps its work in progress and gets no
 * new invitations, as with EMI-06; a broker is blocked); notes and the
 * exclusion proposal, which the administrator accepts or rejects.
 * Counts only: never the content of offers (rule 1).
 */
@Injectable()
export class OrganizationsBackOfficeService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(auth: AuthContext, filter: { type?: "AGENCY" | "BROKER"; q?: string }) {
    return withContext(this.db, auth.db, (tx) =>
      asSystem(tx, async () => {
        const q = filter.q?.trim();
        const organizations = await tx.organization.findMany({
          where: {
            type: filter.type ? filter.type : { in: ["AGENCY", "BROKER"] },
            ...(q
              ? {
                  OR: [
                    { legalName: { contains: q, mode: "insensitive" } },
                    { ruiNumber: { contains: q.toUpperCase() } },
                  ],
                }
              : {}),
          },
          orderBy: { legalName: "asc" },
          take: 200,
        });
        const ids = organizations.map((o) => o.id);
        const [invitations, offers, wins, penalties, flags, suspensions, proposals] =
          await Promise.all([
            tx.invitation.groupBy({
              by: ["organizationId"],
              where: { organizationId: { in: ids } },
              _count: true,
            }),
            tx.offer.groupBy({
              by: ["organizationId"],
              where: { organizationId: { in: ids } },
              _count: true,
            }),
            tx.offer.groupBy({
              by: ["organizationId"],
              where: { organizationId: { in: ids }, status: { in: ["WINNING", "ISSUED"] } },
              _count: true,
            }),
            tx.penalty.groupBy({
              by: ["organizationId"],
              where: {
                organizationId: { in: ids },
                status: { in: ["APPLIED", "UPHELD", "CONTESTED"] },
              },
              _count: true,
            }),
            tx.flag.groupBy({
              by: ["organizationId"],
              where: { organizationId: { in: ids }, status: "OPEN" },
              _count: true,
            }),
            tx.agencySuspension.findMany({
              where: { organizationId: { in: ids }, revokedAt: null },
            }),
            tx.organizationNote.findMany({
              where: { organizationId: { in: ids }, kind: "EXCLUSION_PROPOSAL", decidedAt: null },
            }),
          ]);
        const count = (rows: { organizationId: string | null; _count: number }[], id: string) =>
          rows.find((r) => r.organizationId === id)?._count ?? 0;
        return organizations.map((o) => ({
          id: o.id,
          type: o.type,
          legalName: o.legalName,
          ruiNumber: o.ruiNumber,
          status: o.status,
          suspended: o.status === "SUSPENDED" || suspensions.some((s) => s.organizationId === o.id),
          exclusionProposed: proposals.some((p) => p.organizationId === o.id),
          profInsuranceExpiresOn: isoDay(o.profInsuranceExpiresOn),
          invitations: count(invitations, o.id),
          offers: count(offers, o.id),
          wins: count(wins, o.id),
          penalties: count(penalties, o.id),
          openFlags: count(flags, o.id),
        }));
      }),
    );
  }

  private async organization(tx: DbTransaction, id: string) {
    const o = await asSystem(tx, () => tx.organization.findUnique({ where: { id } }));
    if (!o || (o.type !== "AGENCY" && o.type !== "BROKER")) throw new ProblemError("NOT_FOUND");
    return o;
  }

  async detail(auth: AuthContext, id: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const o = await this.organization(tx, id);
      // One after the other: a system step must not run beside the caller's queries.
      const notes = await tx.organizationNote.findMany({
        where: { organizationId: id },
        orderBy: { createdAt: "desc" },
      });
      const { suspensions, mandates } = await asSystem(tx, async () => ({
        suspensions: await tx.agencySuspension.findMany({
          where: { organizationId: id },
          orderBy: { startedAt: "desc" },
        }),
        mandates: await tx.agencyMandate.findMany({
          where: { organizationId: id },
          include: { company: true },
        }),
      }));
      const history = await tx.auditLog.findMany({
        where: {
          targetType: "Organization",
          targetId: id,
          action: {
            in: [
              "ORGANIZATION_SUSPENDED",
              "ORGANIZATION_REACTIVATED",
              "ORGANIZATION_EXCLUSION_PROPOSED",
              "ORGANIZATION_EXCLUDED",
              "ORGANIZATION_EXCLUSION_REJECTED",
            ],
          },
        },
        orderBy: { seq: "desc" },
        take: 50,
      });
      return {
        id: o.id,
        type: o.type,
        legalName: o.legalName,
        ruiNumber: o.ruiNumber,
        status: o.status,
        statusReason: o.statusReason,
        profInsuranceExpiresOn: isoDay(o.profInsuranceExpiresOn),
        mandates: mandates.map((m) => ({ company: m.company.name, source: m.source })),
        suspensions: suspensions.map((s) => ({
          reason: s.reason,
          startedAt: s.startedAt.toISOString(),
          revokedAt: s.revokedAt?.toISOString() ?? null,
        })),
        notes: notes.map((n) => ({
          id: n.id,
          kind: n.kind,
          text: n.text,
          createdAt: n.createdAt.toISOString(),
          decision: n.decision,
          decisionReason: n.decisionReason,
          decidedAt: n.decidedAt?.toISOString() ?? null,
        })),
        history: history.map((h) => ({
          action: h.action,
          at: h.at.toISOString(),
          reason: h.reason,
        })),
      };
    });
  }

  /** An agency: no new invitations (as EMI-06), the work in progress goes on. A broker: blocked. */
  async suspend(auth: AuthContext, id: string, reason: string) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const o = await this.organization(tx, id);
      if (o.status === "EXCLUDED") throw new ProblemError("CONFLICT");
      if (o.type === "AGENCY") {
        const live = await asSystem(tx, () =>
          tx.agencySuspension.findFirst({ where: { organizationId: id, revokedAt: null } }),
        );
        if (live)
          throw new ProblemError("CONFLICT", "Already suspended", [
            { path: "organization", issue: "ALREADY_SUSPENDED" },
          ]);
        await asSystem(tx, () =>
          tx.agencySuspension.create({
            data: {
              organizationId: id,
              reason,
              startedAt: now,
              confirmedByUserId: auth.userId,
              confirmedAt: now,
              createdAt: now,
            },
          }),
        );
      } else {
        if (o.status === "SUSPENDED")
          throw new ProblemError("CONFLICT", "Already suspended", [
            { path: "organization", issue: "ALREADY_SUSPENDED" },
          ]);
        await asSystem(tx, () =>
          tx.organization.update({
            where: { id },
            data: { status: "SUSPENDED", statusReason: reason, updatedAt: now },
          }),
        );
      }
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "ORGANIZATION_SUSPENDED",
        targetType: "Organization",
        targetId: id,
        before: { status: o.status },
        after: { suspended: true, type: o.type },
        reason,
      });
      return { id, suspended: true };
    });
  }

  async reactivate(auth: AuthContext, id: string, reason: string) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const o = await this.organization(tx, id);
      if (o.status === "EXCLUDED") throw new ProblemError("CONFLICT");
      const live = await asSystem(tx, () =>
        tx.agencySuspension.findMany({ where: { organizationId: id, revokedAt: null } }),
      );
      if (live.length === 0 && o.status !== "SUSPENDED") {
        throw new ProblemError("CONFLICT", "Not suspended", [
          { path: "organization", issue: "NOT_SUSPENDED" },
        ]);
      }
      await asSystem(tx, async () => {
        await tx.agencySuspension.updateMany({
          where: { organizationId: id, revokedAt: null },
          data: { revokedAt: now, revokedByUserId: auth.userId, updatedAt: now },
        });
        if (o.status === "SUSPENDED") {
          await tx.organization.update({
            where: { id },
            data: { status: "ACTIVE", statusReason: null, updatedAt: now },
          });
        }
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "ORGANIZATION_REACTIVATED",
        targetType: "Organization",
        targetId: id,
        before: { status: o.status, suspensions: live.length },
        after: { status: "ACTIVE" },
        reason,
      });
      return { id, suspended: false };
    });
  }

  async addNote(auth: AuthContext, id: string, kind: "NOTE" | "EXCLUSION_PROPOSAL", text: string) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const o = await this.organization(tx, id);
      if (kind === "EXCLUSION_PROPOSAL") {
        if (o.status === "EXCLUDED") throw new ProblemError("CONFLICT");
        const open = await tx.organizationNote.findFirst({
          where: { organizationId: id, kind, decidedAt: null },
        });
        if (open)
          throw new ProblemError("CONFLICT", "A proposal is open", [
            { path: "organization", issue: "PROPOSAL_OPEN" },
          ]);
      }
      const note = await tx.organizationNote.create({
        data: { organizationId: id, kind, text, authorUserId: auth.userId, createdAt: now },
      });
      if (kind === "EXCLUSION_PROPOSAL") {
        await this.audit.inTransaction(tx, actorOf(auth), {
          action: "ORGANIZATION_EXCLUSION_PROPOSED",
          targetType: "Organization",
          targetId: id,
          after: { noteId: note.id },
          reason: text,
        });
      }
      return { id: note.id };
    });
  }

  // --- Administrator (spec 07 «Agenzie e broker») ------------------------------

  async proposals(auth: AuthContext) {
    return withContext(this.db, auth.db, async (tx) => {
      const open = await tx.organizationNote.findMany({
        where: { kind: "EXCLUSION_PROPOSAL", decidedAt: null },
        orderBy: { createdAt: "asc" },
      });
      const orgs = await asSystem(tx, () =>
        tx.organization.findMany({ where: { id: { in: open.map((p) => p.organizationId) } } }),
      );
      return open.map((p) => ({
        id: p.id,
        organizationId: p.organizationId,
        organization: orgs.find((o) => o.id === p.organizationId)?.legalName ?? "",
        text: p.text,
        createdAt: p.createdAt.toISOString(),
      }));
    });
  }

  /** The exclusion: the organization leaves AstAx; its users cannot work for it any more. */
  async decideExclusion(auth: AuthContext, noteId: string, accept: boolean, reason: string) {
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const proposal = await tx.organizationNote.findUnique({ where: { id: noteId } });
      if (!proposal || proposal.kind !== "EXCLUSION_PROPOSAL") throw new ProblemError("NOT_FOUND");
      if (proposal.decidedAt)
        throw new ProblemError("CONFLICT", "Already decided", [
          { path: "proposal", issue: "PROPOSAL_CLOSED" },
        ]);
      const o = await this.organization(tx, proposal.organizationId);
      await tx.organizationNote.update({
        where: { id: noteId },
        data: {
          decision: accept ? "EXCLUDED" : "REJECTED",
          decisionReason: reason,
          decidedByUserId: auth.userId,
          decidedAt: now,
        },
      });
      if (accept) {
        await asSystem(tx, () =>
          tx.organization.update({
            where: { id: o.id },
            data: { status: "EXCLUDED", statusReason: reason, updatedAt: now },
          }),
        );
      }
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: accept ? "ORGANIZATION_EXCLUDED" : "ORGANIZATION_EXCLUSION_REJECTED",
        targetType: "Organization",
        targetId: o.id,
        before: { status: o.status },
        after: { status: accept ? "EXCLUDED" : o.status, proposalId: noteId },
        reason,
      });
      return { id: o.id, status: accept ? "EXCLUDED" : o.status };
    });
  }
}
