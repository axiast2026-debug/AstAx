import type { Clock } from "@astax/adapters/clock";
import {
  auctionSettings,
  auctionSettingsAt,
  filterableRequest,
  conflictedAgencies,
  loadAgencyCandidates,
  loadWorkingCalendar,
  withContext,
  type DbClient,
  type DbTransaction,
} from "@astax/db";
import { auctionTimes, selectAgencies } from "@astax/shared/domain";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import { CLOCK, DB } from "../infra/tokens.js";

/**
 * The preview of the agencies an approval would invite now (fase 3, «Scheda
 * di verifica»): how many, which companies they cover, and the agencies the
 * back office leaves out, with the reason (ASTA-06). The worker applies the
 * same rules at the opening, with the exclusions recorded here.
 */
@Injectable()
export class AgencyPreviewService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async waiting(tx: DbTransaction, id: string) {
    const request = await tx.quoteRequest.findUnique({ where: { id } });
    if (!request) throw new ProblemError("NOT_FOUND");
    if (request.status !== "IN_VERIFICATION") {
      throw new ProblemError("CONFLICT", "The request is not waiting for a verification decision");
    }
    return request;
  }

  async preview(auth: AuthContext, id: string) {
    staffOnly(auth);
    const now = this.clock.now();
    return withContext(this.db, auth.db, async (tx) => {
      const request = await this.waiting(tx, id);
      const filterable = filterableRequest(request, now);
      if (!filterable || !request.auctionDurationHours || request.minValidityDays === null) {
        throw new ProblemError("CONFLICT", "The request has no submitted data");
      }
      const snapshot = await auctionSettingsAt(tx, now);
      const settings = auctionSettings(snapshot);
      const calendar = await loadWorkingCalendar(tx, snapshot["calendar.workingHours"]);
      const times = auctionTimes(
        calendar,
        now,
        request.auctionDurationHours,
        request.minValidityDays,
        settings,
      );
      const exclusions = await tx.invitationExclusion.findMany({
        where: { quoteRequestId: id },
        orderBy: { createdAt: "asc" },
      });
      const selection = selectAgencies({
        request: filterable,
        candidates: await loadAgencyCandidates(tx, now),
        calendar,
        openedAt: now,
        closeAt: times.scheduledCloseAt,
        minReceptionOverlapMinutes: settings.minReceptionOverlapWorkingHours * 60,
        limit: settings.invitationsMax,
        alreadyInvited: [],
        // Answer 2A: the agency of an intermediary of section E is never invited.
        excluded: [
          ...exclusions.map((e) => e.organizationId),
          ...(await conflictedAgencies(tx, request.ownerOrganizationId)),
        ],
        rotation: true,
      });
      const orgIds = [
        ...selection.selected.map((s) => s.organizationId),
        ...exclusions.map((e) => e.organizationId),
      ];
      const [organizations, companies] = await Promise.all([
        tx.organization.findMany({ where: { id: { in: orgIds } } }),
        tx.insuranceCompany.findMany(),
      ]);
      const orgName = (orgId: string) =>
        organizations.find((o) => o.id === orgId)?.legalName ?? orgId;
      const companyName = (companyId: string) =>
        companies.find((c) => c.id === companyId)?.name ?? companyId;
      return {
        scheduledCloseAt: times.scheduledCloseAt.toISOString(),
        invited: selection.selected.map((s) => ({
          organizationId: s.organizationId,
          name: orgName(s.organizationId),
          companies: s.companies.map(companyName),
        })),
        companies: [...new Set(selection.selected.flatMap((s) => s.companies))]
          .map(companyName)
          .sort(),
        compatibleNotChosen: selection.compatibleNotChosen.length,
        excluded: exclusions.map((e) => ({
          organizationId: e.organizationId,
          name: orgName(e.organizationId),
          reason: e.reason,
          at: e.createdAt.toISOString(),
        })),
      };
    });
  }

  /** ASTA-06: leaves an agency out of the auction of this request, with the reason. */
  async exclude(auth: AuthContext, id: string, organizationId: string, reason: string) {
    staffOnly(auth);
    return withContext(this.db, auth.db, async (tx) => {
      await this.waiting(tx, id);
      const agency = await tx.organization.findFirst({
        where: { id: organizationId, type: "AGENCY" },
      });
      if (!agency) throw new ProblemError("NOT_FOUND");
      await tx.invitationExclusion.upsert({
        where: { quoteRequestId_organizationId: { quoteRequestId: id, organizationId } },
        create: { quoteRequestId: id, organizationId, reason, byUserId: auth.userId },
        update: { reason, byUserId: auth.userId },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "AGENCY_EXCLUDED_FROM_AUCTION",
        targetType: "QuoteRequest",
        targetId: id,
        after: { organizationId },
        reason,
      });
      return { organizationId, excluded: true };
    });
  }

  /** Takes an agency back into the preview. */
  async include(auth: AuthContext, id: string, organizationId: string) {
    staffOnly(auth);
    return withContext(this.db, auth.db, async (tx) => {
      await this.waiting(tx, id);
      const removed = await tx.invitationExclusion.deleteMany({
        where: { quoteRequestId: id, organizationId },
      });
      if (removed.count > 0) {
        await this.audit.inTransaction(tx, actorOf(auth), {
          action: "AGENCY_INCLUDED_IN_AUCTION",
          targetType: "QuoteRequest",
          targetId: id,
          after: { organizationId },
        });
      }
      return { organizationId, excluded: false };
    });
  }
}

function staffOnly(auth: AuthContext): void {
  if (auth.membership?.organizationType !== "ASTAX") throw new ProblemError("NOT_FOUND");
}
