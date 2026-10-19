import {
  addRequestEvent,
  settingsAt,
  SYSTEM_CONTEXT,
  withContext,
  type DbTransaction,
} from "@astax/db";
import {
  coverStartAt,
  missedIssuanceAt,
  transitionOffer,
  transitionRequest,
} from "@astax/shared/domain";
import { dbDateToCalendarDate, formatDateTime, formatEuroCents } from "@astax/shared/format";
import { startForNotice } from "@astax/shared/notifications";
import type { PendingEmail } from "../notifier.js";
import { agencyRecipients, staffRecipients, type ActivityDeps } from "./support.js";
import type { AuctionActivities, IssuanceSchedule, IssuanceSteps } from "./types.js";

type StepKind = "REMINDER" | "DEADLINE" | "MISSED" | "PROPOSAL";
const STEP_EVENT = {
  REMINDER: "ISSUANCE_REMINDER_SENT",
  DEADLINE: "ISSUANCE_DEADLINE_PASSED",
  MISSED: "ISSUANCE_PROBLEM_OPENED",
  PROPOSAL: "SECOND_OFFER_DECIDED",
} as const;

/**
 * EMI-01, EMI-03, EMI-04: the steps after the payment, for the acceptance
 * paid now (a second offer brings its own): the reminder
 * issuance.reminderMinutesBefore the deadline; at the deadline the penalty
 * for the delay is proposed (decision 27); at the start of cover (00:00 in
 * Rome, question 1) with no policy, a case for the back office. Each step
 * happens once: an event of the request, with the acceptance, records it.
 */
export function issuanceActivities(
  deps: ActivityDeps,
): Pick<
  AuctionActivities,
  "issuanceSchedule" | "sendIssuanceReminder" | "issuanceSteps" | "runIssuanceStep"
> {
  const { db, clock, cipher, notifier, urls } = deps;

  async function issuanceSchedule(input: { requestId: string }): Promise<IssuanceSchedule> {
    return withContext(db, SYSTEM_CONTEXT, async (tx) => {
      const paid = await tx.acceptance.findFirst({
        where: { quoteRequestId: input.requestId, status: "PAID" },
      });
      if (!paid?.issuanceDeadlineAt) return { deadlineAt: null, reminderAt: null };
      const { "issuance.reminderMinutesBefore": minutes } = await settingsAt(
        tx,
        ["issuance.reminderMinutesBefore"],
        clock.now(),
      );
      return {
        deadlineAt: paid.issuanceDeadlineAt.toISOString(),
        reminderAt: new Date(paid.issuanceDeadlineAt.getTime() - minutes * 60_000).toISOString(),
      };
    });
  }

  /** The steps of the acceptance paid now, with their instants and whether each is done. */
  async function stepsOf(tx: DbTransaction, requestId: string) {
    const request = await tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId } });
    const paid = await tx.acceptance.findFirst({
      where: { quoteRequestId: requestId, status: "PAID" },
      orderBy: { paidAt: "desc" },
    });
    const proposal = await tx.nextOfferProposal.findFirst({
      where: { quoteRequestId: requestId },
      orderBy: { createdAt: "desc" },
    });
    // EMI-04: a second offer (or a new price) to confirm within its time, or being paid.
    if (
      request.status === "ACCEPTED" &&
      proposal &&
      ["PROPOSED", "ACCEPTED"].includes(proposal.status)
    ) {
      return {
        request,
        paid,
        proposal,
        stage: true,
        steps:
          proposal.status === "PROPOSED"
            ? [{ kind: "PROPOSAL" as StepKind, at: proposal.expiresAt, done: false }]
            : [],
      };
    }
    // EMI-04, decision 27: the agency judged at fault («Mancata emissione») has
    // nothing more to do; the request waits for the refund or a new acceptance,
    // with no reminder, no delay penalty and no new case.
    const offer = paid ? await tx.offer.findUnique({ where: { id: paid.offerId } }) : null;
    if (offer && offer.status !== "WINNING" && request.status === "IN_ISSUANCE") {
      return {
        request,
        paid,
        proposal,
        stage: true,
        steps: [] as { kind: StepKind; at: Date; done: boolean }[],
      };
    }
    if (request.status !== "IN_ISSUANCE" || !paid?.issuanceDeadlineAt || !request.startDate) {
      return {
        request,
        paid,
        proposal,
        stage: request.status === "IN_ISSUANCE",
        steps: [] as { kind: StepKind; at: Date; done: boolean }[],
      };
    }
    const { "issuance.reminderMinutesBefore": minutes } = await settingsAt(
      tx,
      ["issuance.reminderMinutesBefore"],
      clock.now(),
    );
    const events = await tx.quoteRequestEvent.findMany({
      where: { quoteRequestId: requestId, type: { in: Object.values(STEP_EVENT) } },
    });
    const done = (kind: StepKind) =>
      events.some(
        (e) =>
          e.type === STEP_EVENT[kind] &&
          (e.details as { acceptanceId?: string } | null)?.acceptanceId === paid.id,
      );
    const deadline = paid.issuanceDeadlineAt;
    const steps = [
      { kind: "REMINDER" as const, at: new Date(deadline.getTime() - minutes * 60_000) },
      { kind: "DEADLINE" as const, at: deadline },
      // EMI-04, question 1: at the start of cover; with «immediata», at the deadline.
      {
        kind: "MISSED" as const,
        at: missedIssuanceAt({
          startMode: request.startMode,
          startDate: dbDateToCalendarDate(request.startDate),
          issuanceDeadlineAt: deadline,
        }),
      },
    ].map((s) => ({ ...s, done: done(s.kind) }));
    return { request, paid, proposal, stage: true, steps };
  }

  async function issuanceSteps(input: { requestId: string }): Promise<IssuanceSteps> {
    return withContext(db, SYSTEM_CONTEXT, async (tx) => {
      const { request, steps, stage } = await stepsOf(tx, input.requestId);
      const next = steps.filter((s) => !s.done).sort((a, b) => a.at.getTime() - b.at.getTime())[0];
      return {
        inIssuance: stage,
        issued: request.status === "ISSUED",
        nextStepAt: next?.at.toISOString() ?? null,
      };
    });
  }

  async function runIssuanceStep(input: { requestId: string; force: boolean }): Promise<void> {
    const pending: PendingEmail[] = [];
    await withContext(db, SYSTEM_CONTEXT, async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "QuoteRequest" WHERE "id" = ${input.requestId}::uuid FOR UPDATE`;
      const { request, paid, proposal, steps } = await stepsOf(tx, input.requestId);
      const now = clock.now();
      const step = steps.filter((s) => !s.done).sort((a, b) => a.at.getTime() - b.at.getTime())[0];
      if (!step || !paid || (!input.force && step.at > now)) return;
      if (step.kind === "PROPOSAL" && proposal) {
        await proposalExpired(tx, pending, request, paid, proposal, now);
        return;
      }
      const offer = await tx.offer.findUniqueOrThrow({ where: { id: paid.offerId } });
      const agency = await tx.organization.findUniqueOrThrow({
        where: { id: offer.organizationId },
      });
      const term = paid.issuanceDeadlineAt ? formatDateTime(paid.issuanceDeadlineAt) : "";
      const start = request.startDate
        ? startForNotice(
            {
              startMode: request.startMode,
              startDate: dbDateToCalendarDate(request.startDate),
              coverStartsAt:
                request.startMode === "MIDNIGHT_AFTER_DEADLINE" && paid.issuanceDeadlineAt
                  ? coverStartAt({
                      startMode: request.startMode,
                      startDate: dbDateToCalendarDate(request.startDate),
                      issuanceDeadlineAt: paid.issuanceDeadlineAt,
                    })
                  : null,
            },
            (key) => notifier.label(key, "it"),
          )
        : "";
      const toIssue = `${urls.web}/da-emettere/${request.id}`;
      const exceptions = `${urls.admin}/eccezioni`;
      const settings = await settingsAt(
        tx,
        ["issuance.reminderMinutesBefore", "penalties.lateIssuanceCents"],
        now,
      );
      const agencyUsers = await agencyRecipients(tx, cipher, [offer.organizationId]);
      const staff = await staffRecipients(tx, cipher, ["BO_VERIFIER", "BO_SUPERVISOR"]);
      const ids = { quoteRequestId: request.id };
      if (step.kind === "REMINDER") {
        await notifier.notify(
          tx,
          pending,
          agencyUsers,
          "issuance.deadline_near",
          () => ({
            codice: request.code,
            minuti: String(settings["issuance.reminderMinutesBefore"]),
            termine_emissione: term,
            link: toIssue,
          }),
          `/da-emettere/${request.id}`,
          ids,
        );
        await notifier.notify(
          tx,
          pending,
          staff,
          "issuance.deadline_near.bo",
          () => ({
            codice: request.code,
            agenzia: agency.legalName,
            termine_emissione: term,
            link: exceptions,
          }),
          "/eccezioni",
          ids,
        );
      }
      if (step.kind === "DEADLINE") {
        // Phase 8 (docs/sorveglianza.md): a missed issuance deadline is an alarm for the back office.
        deps.logger.warn(
          { alarm: "ISSUANCE_DEADLINE_MISSED", quoteRequestId: request.id },
          "issuance deadline missed",
        );
        // EMI-03, decision 27: the penalty for the delay, proposed (EMI-05: the supervisor applies it).
        await tx.penalty.create({
          data: {
            organizationId: offer.organizationId,
            type: "LATE_ISSUANCE",
            amountCents: settings["penalties.lateIssuanceCents"],
            quoteRequestId: request.id,
            reason: "EMI-03",
            proposedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        });
        await notifier.notify(
          tx,
          pending,
          agencyUsers,
          "issuance.deadline_passed",
          () => ({ codice: request.code, decorrenza: start, link: toIssue }),
          `/da-emettere/${request.id}`,
          ids,
        );
        await notifier.notify(
          tx,
          pending,
          staff,
          "issuance.deadline_passed.bo",
          () => ({
            codice: request.code,
            agenzia: agency.legalName,
            termine_emissione: term,
            decorrenza: start,
            link: exceptions,
          }),
          "/eccezioni",
          ids,
        );
      }
      if (step.kind === "MISSED") {
        // EMI-04: no policy before the start of cover; the back office decides the fault.
        const open = await tx.issuanceProblem.findFirst({
          where: { quoteRequestId: request.id, status: "OPEN" },
        });
        if (!open) {
          await tx.issuanceProblem.create({
            data: {
              quoteRequestId: request.id,
              offerId: offer.id,
              organizationId: offer.organizationId,
              type: "MISSED_DEADLINE",
              openedAt: now,
              createdAt: now,
              updatedAt: now,
            },
          });
          await notifier.notify(
            tx,
            pending,
            staff,
            "issuance.missed.bo",
            () => ({
              codice: request.code,
              agenzia: agency.legalName,
              decorrenza: start,
              link: exceptions,
            }),
            "/eccezioni",
            ids,
          );
        }
      }
      await addRequestEvent(tx, request, {
        type: STEP_EVENT[step.kind],
        actorKind: "SYSTEM",
        actorUserId: null,
        at: now,
        details: { acceptanceId: paid.id },
      });
    });
    await notifier.flush(pending);
  }

  /**
   * EMI-04: no answer within secondOffer.customerConfirmHours: the proposal
   * lapses and the full refund (fee included) goes to the supervisor (PAG-05);
   * the request stays «In emissione» until the refund closes it.
   */
  async function proposalExpired(
    tx: DbTransaction,
    pending: PendingEmail[],
    request: {
      id: string;
      code: string;
      ownerUserId: string | null;
      ownerOrganizationId: string | null;
    },
    paid: { id: string; premiumCents: number; feeCents: number },
    proposal: { id: string; kind: string; toOfferId: string },
    now: Date,
  ) {
    await tx.nextOfferProposal.update({
      where: { id: proposal.id },
      data: { status: "EXPIRED", decidedAt: now },
    });
    if (proposal.kind === "SECOND_OFFER") {
      transitionOffer("AWAITING_CUSTOMER", "NOT_CHOSEN");
      await tx.offer.update({ where: { id: proposal.toOfferId }, data: { status: "NOT_CHOSEN" } });
    }
    transitionRequest("ACCEPTED", "IN_ISSUANCE");
    await tx.quoteRequest.update({ where: { id: request.id }, data: { status: "IN_ISSUANCE" } });
    const payment = await tx.payment.findFirst({
      where: { status: "CAPTURED", acceptance: { quoteRequestId: request.id } },
      orderBy: { capturedAt: "asc" },
    });
    if (payment) {
      await tx.refund.create({
        data: {
          paymentId: payment.id,
          quoteRequestId: request.id,
          ownerUserId: request.ownerUserId,
          ownerOrganizationId: request.ownerOrganizationId,
          reason: "BEFORE_ISSUANCE",
          premiumCents: paid.premiumCents,
          feeCents: paid.feeCents,
          requestedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      });
      await notifier.notify(
        tx,
        pending,
        await staffRecipients(tx, cipher, ["BO_SUPERVISOR"]),
        "refund.approval_needed.bo",
        () => ({
          codice: request.code,
          importo: formatEuroCents(paid.premiumCents + paid.feeCents),
          motivo: "EMI-04",
          richiedente_rimborso: "AstAx",
          link: `${urls.admin}/pagamenti`,
        }),
        "/pagamenti",
        { quoteRequestId: request.id },
      );
    }
    await addRequestEvent(tx, request, {
      type: "SECOND_OFFER_DECIDED",
      actorKind: "SYSTEM",
      actorUserId: null,
      at: now,
      details: { proposalId: proposal.id, decision: "EXPIRED" },
    });
  }

  /** Before phase 6: the reminder only, kept for the workflows started then. */
  async function sendIssuanceReminder(input: { requestId: string }) {
    const pending: PendingEmail[] = [];
    await withContext(db, SYSTEM_CONTEXT, async (tx) => {
      const request = await tx.quoteRequest.findUniqueOrThrow({ where: { id: input.requestId } });
      if (request.status !== "IN_ISSUANCE") return;
      const sent = await tx.quoteRequestEvent.count({
        where: { quoteRequestId: request.id, type: "ISSUANCE_REMINDER_SENT" },
      });
      if (sent > 0) return;
      const paid = await tx.acceptance.findFirstOrThrow({
        where: { quoteRequestId: request.id, status: "PAID" },
      });
      const offer = await tx.offer.findUniqueOrThrow({ where: { id: paid.offerId } });
      const agency = await tx.organization.findUniqueOrThrow({
        where: { id: offer.organizationId },
      });
      const { "issuance.reminderMinutesBefore": minutes } = await settingsAt(
        tx,
        ["issuance.reminderMinutesBefore"],
        clock.now(),
      );
      const term = paid.issuanceDeadlineAt ? formatDateTime(paid.issuanceDeadlineAt) : "";
      await notifier.notify(
        tx,
        pending,
        await agencyRecipients(tx, cipher, [offer.organizationId]),
        "issuance.deadline_near",
        () => ({
          codice: request.code,
          minuti: String(minutes),
          termine_emissione: term,
          link: `${urls.web}/da-emettere`,
        }),
        "/da-emettere",
        { quoteRequestId: request.id },
      );
      await notifier.notify(
        tx,
        pending,
        await staffRecipients(tx, cipher, ["BO_VERIFIER", "BO_SUPERVISOR"]),
        "issuance.deadline_near.bo",
        () => ({
          codice: request.code,
          agenzia: agency.legalName,
          termine_emissione: term,
          link: `${urls.admin}/aste`,
        }),
        "/aste",
        { quoteRequestId: request.id },
      );
      await addRequestEvent(tx, request, {
        type: "ISSUANCE_REMINDER_SENT",
        actorKind: "SYSTEM",
        actorUserId: null,
        at: clock.now(),
        details: { acceptanceId: paid.id },
      });
    });
    await notifier.flush(pending);
  }

  return { issuanceSchedule, sendIssuanceReminder, issuanceSteps, runIssuanceStep };
}
