import type { Clock } from "@astax/adapters/clock";
import { asSystem, withContext, type DbClient } from "@astax/db";
import { romeInstant } from "@astax/shared/domain";
import { romeCalendarDate } from "@astax/shared/format";
import { can, type Action } from "@astax/shared/permissions";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthContext } from "../auth/auth-context.js";
import { CLOCK, DB } from "../infra/tokens.js";

export interface Queue {
  key: string;
  count: number;
  /** The oldest item waiting (or, for open auctions, the next closing). */
  since: string | null;
  link: string;
}

const MINUTE_MS = 60_000;

/**
 * Spec 06 «Dashboard operativa»: every queue with its counter and the longest
 * wait, only those the role works on; the indicators of the day (Rome).
 * Counts and times only: no customer data, no prices (rule 1 and 8).
 */
@Injectable()
export class OperationsDashboardService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async overview(auth: AuthContext) {
    const now = this.clock.now();
    const startOfDay = romeInstant(romeCalendarDate(now), "00:00");
    const may = (action: Action) => can(auth.actor, action);
    return withContext(this.db, auth.db, (tx) =>
      asSystem(tx, async () => {
        const queues: Queue[] = [];
        const add = async (
          key: string,
          action: Action,
          link: string,
          read: () => Promise<{ count: number; since: Date | null }>,
        ) => {
          if (!may(action)) return;
          const { count, since } = await read();
          queues.push({ key, count, since: since?.toISOString() ?? null, link });
        };
        const oldestRequest = async (
          status: "IN_VERIFICATION" | "INTEGRATION_REQUESTED" | "DESERTED",
        ) => {
          const [count, first] = await Promise.all([
            tx.quoteRequest.count({ where: { status } }),
            tx.quoteRequest.findFirst({
              where: { status },
              orderBy: { updatedAt: "asc" },
              select: { submittedAt: true, updatedAt: true },
            }),
          ]);
          const since = status === "IN_VERIFICATION" ? first?.submittedAt : first?.updatedAt;
          return { count, since: since ?? null };
        };
        await add("verification", "verification.viewQueue", "/verifiche", () =>
          oldestRequest("IN_VERIFICATION"),
        );
        await add("integration", "verification.viewQueue", "/verifiche", () =>
          oldestRequest("INTEGRATION_REQUESTED"),
        );
        await add("openAuctions", "backOffice.dashboard", "/aste", async () => {
          const [count, next] = await Promise.all([
            tx.auction.count({ where: { status: { in: ["OPEN", "CLOSING"] } } }),
            tx.auction.findFirst({
              where: { status: { in: ["OPEN", "CLOSING"] } },
              orderBy: { scheduledCloseAt: "asc" },
              select: { scheduledCloseAt: true },
            }),
          ]);
          return { count, since: next?.scheduledCloseAt ?? null };
        });
        await add("deserted", "issuance.decideMissed", "/eccezioni", () =>
          oldestRequest("DESERTED"),
        );
        await add("issuanceProblems", "issuance.decideMissed", "/eccezioni", async () => {
          const [count, first] = await Promise.all([
            tx.issuanceProblem.count({ where: { status: "OPEN" } }),
            tx.issuanceProblem.findFirst({
              where: { status: "OPEN" },
              orderBy: { openedAt: "asc" },
              select: { openedAt: true },
            }),
          ]);
          return { count, since: first?.openedAt ?? null };
        });
        await add("remittances", "accounting.view", "/pagamenti", async () => {
          const where = {
            status: { in: ["DRAFT" as const, "READY" as const, "FILE_GENERATED" as const] },
          };
          const [count, first] = await Promise.all([
            tx.remittance.count({ where }),
            tx.remittance.findFirst({
              where,
              orderBy: { cutoffAt: "asc" },
              select: { cutoffAt: true },
            }),
          ]);
          return { count, since: first?.cutoffAt ?? null };
        });
        await add("unmatchedLines", "accounting.view", "/riconciliazione", async () => {
          const [count, first] = await Promise.all([
            tx.bankStatementLine.count({ where: { status: "UNMATCHED" } }),
            tx.bankStatementLine.findFirst({
              where: { status: "UNMATCHED" },
              orderBy: { bookingDate: "asc" },
              select: { bookingDate: true },
            }),
          ]);
          return { count, since: first?.bookingDate ?? null };
        });
        await add("refunds", "refund.approve", "/pagamenti", async () => {
          const [count, first] = await Promise.all([
            tx.refund.count({ where: { status: "REQUESTED" } }),
            tx.refund.findFirst({
              where: { status: "REQUESTED" },
              orderBy: { requestedAt: "asc" },
              select: { requestedAt: true },
            }),
          ]);
          return { count, since: first?.requestedAt ?? null };
        });
        await add("onboarding", "organization.approveOnboarding", "/ingressi", async () => {
          const [count, first] = await Promise.all([
            tx.onboardingApplication.count({ where: { status: "SUBMITTED" } }),
            tx.onboardingApplication.findFirst({
              where: { status: "SUBMITTED" },
              orderBy: { submittedAt: "asc" },
              select: { submittedAt: true },
            }),
          ]);
          return { count, since: first?.submittedAt ?? null };
        });

        await add("tickets", "support.tickets", "/assistenza", async () => {
          const [count, first] = await Promise.all([
            tx.supportTicket.count({ where: { status: "OPEN" } }),
            tx.supportTicket.findFirst({
              where: { status: "OPEN" },
              orderBy: { dueAt: "asc" },
              select: { dueAt: true },
            }),
          ]);
          return { count, since: first?.dueAt ?? null };
        });

        await add("complaints", "complaint.manage", "/reclami", async () => {
          const [count, first] = await Promise.all([
            tx.complaint.count({ where: { status: "OPEN" } }),
            tx.complaint.findFirst({
              where: { status: "OPEN" },
              orderBy: { dueAt: "asc" },
              select: { dueAt: true },
            }),
          ]);
          return { count, since: first?.dueAt ?? null };
        });

        // The nearest legal term first: the date shown is the due date.
        await add("dataRequests", "dataSubjectRequest.manage", "/clienti", async () => {
          const [count, first] = await Promise.all([
            tx.dataSubjectRequest.count({ where: { status: "OPEN" } }),
            tx.dataSubjectRequest.findFirst({
              where: { status: "OPEN" },
              orderBy: { dueAt: "asc" },
              select: { dueAt: true },
            }),
          ]);
          return { count, since: first?.dueAt ?? null };
        });

        // Indicators of the day: verifications decided, how long they took, how many alone.
        const decided = may("verification.viewQueue")
          ? await tx.verification.findMany({
              where: { decidedAt: { gte: startOfDay, lte: now } },
              select: { createdAt: true, decidedAt: true, decidedByUserId: true },
            })
          : [];
        const minutes = decided.map(
          (v) => ((v.decidedAt?.getTime() ?? 0) - v.createdAt.getTime()) / MINUTE_MS,
        );
        const desertedToday = may("issuance.decideMissed")
          ? await tx.quoteRequest.count({
              where: { status: "DESERTED", updatedAt: { gte: startOfDay } },
            })
          : null;
        return {
          at: now.toISOString(),
          queues,
          indicators: {
            verificationsToday: decided.length,
            averageVerificationMinutes:
              minutes.length > 0
                ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length)
                : null,
            automaticShare:
              decided.length > 0
                ? decided.filter((v) => v.decidedByUserId === null).length / decided.length
                : null,
            desertedToday,
          },
        };
      }),
    );
  }
}
