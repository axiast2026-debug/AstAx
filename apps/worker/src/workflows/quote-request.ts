import {
  condition,
  defineSignal,
  log,
  patched,
  proxyActivities,
  setHandler,
} from "@temporalio/workflow";
import { SIGNALS } from "@astax/shared/workflows";
import type { AuctionActivities, BackOfficeAction, RoundTimes } from "../activities/types.js";

/**
 * QuoteRequestWorkflow (docs/architettura-codice.md, ADR 0008): one per
 * request, id `quote-request-{id}`. From the approval: opening, top-up,
 * reminder and closing of the auction, the reopening of a deserted auction
 * (ASTA-08), then the guarantees until «Scaduta» (GAR-05, GAR-06); from
 * «Scaduta» a reconfirmation round (GAR-07) or, after 30 days without one,
 * the automatic cancellation (GAR-06). A request whose workflow had already
 * ended at «Scaduta» gets a new run started by the reconfirmation signal.
 * Deterministic: the time is the workflow's, the work is in the activities,
 * and only identifiers, counts and instants pass through (BC-07).
 */

export const approvedSignal = defineSignal(SIGNALS.approved);
/** Development tool (DEV_TOOLS): the next timer fires at once. */
export const fireNextTimerSignal = defineSignal(SIGNALS.fireNextTimer);
export const auctionExtendedSignal = defineSignal<[{ workingHours: number } & BackOfficeAction]>(
  SIGNALS.auctionExtended,
);
export const invitationsAddedSignal = defineSignal<
  [{ organizationIds: string[] } & BackOfficeAction]
>(SIGNALS.invitationsAdded);
export const auctionCancelledSignal = defineSignal<[BackOfficeAction]>(SIGNALS.auctionCancelled);
/** GAR-06: the requester asks for a reconfirmation (the API checks the rules first). */
export const reconfirmationRequestedSignal = defineSignal(SIGNALS.reconfirmationRequested);
/** PAG-02: from the outbox, once the payment is confirmed. */
export const paymentConfirmedSignal = defineSignal(SIGNALS.paymentConfirmed);
/** EMI-02, EMI-04: from the outbox, when the issuance changes. */
export const issuanceChangedSignal = defineSignal(SIGNALS.issuanceChanged);

export { workflowIdOf } from "@astax/shared/workflows";

/**
 * How long a workflow waits for the signal of a reconfirmation already asked
 * before checking the request again: a technical interval of the outbox
 * delivery, not a business time (rule 7).
 */
const PENDING_SIGNAL_WAIT = "1 hour";

/**
 * The steps of the auction never give up: a database or KMS down at the
 * closing time only delays the closing, retried until it succeeds (the API
 * refuses offers after the scheduled time anyway, BC-05).
 */
const acts = proxyActivities<AuctionActivities>({
  startToCloseTimeout: "2 minutes",
  retry: { initialInterval: "2 seconds", backoffCoefficient: 2, maximumInterval: "5 minutes" },
});

/** Back office requests: a refusal (after the first half, auction closed) is final. */
const backOffice = proxyActivities<AuctionActivities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumInterval: "1 minute",
    maximumAttempts: 10,
    nonRetryableErrorTypes: ["AFTER_FIRST_HALF", "AUCTION_NOT_OPEN"],
  },
});

type BackOfficeRequest =
  | ({ kind: "extend"; workingHours: number } & BackOfficeAction)
  | ({ kind: "invite"; organizationIds: string[] } & BackOfficeAction)
  | ({ kind: "cancel" } & BackOfficeAction);

export async function quoteRequestWorkflow(input: { requestId: string }): Promise<string> {
  const { requestId } = input;
  let approved = false;
  let fire = false;
  let reconfirm = false;
  let paid = false;
  let issuanceChanged = false;
  const queue: BackOfficeRequest[] = [];

  setHandler(approvedSignal, () => {
    approved = true;
  });
  setHandler(fireNextTimerSignal, () => {
    fire = true;
  });
  setHandler(auctionExtendedSignal, (a) => {
    queue.push({ kind: "extend", ...a });
  });
  setHandler(invitationsAddedSignal, (a) => {
    queue.push({ kind: "invite", ...a });
  });
  setHandler(auctionCancelledSignal, (a) => {
    queue.push({ kind: "cancel", ...a });
  });
  setHandler(reconfirmationRequestedSignal, () => {
    reconfirm = true;
  });
  setHandler(paymentConfirmedSignal, () => {
    paid = true;
  });
  setHandler(issuanceChangedSignal, () => {
    issuanceChanged = true;
  });

  /**
   * Waits until `at` (an absolute instant). True when the time has come or the
   * development tool fired the timer; false when a back office request arrived.
   */
  async function waitUntil(at: string, wakeOnPayment = false): Promise<boolean> {
    const ms = Date.parse(at) - Date.now();
    if (ms > 0) {
      await condition(() => fire || (wakeOnPayment && paid) || queue.length > 0, ms);
    }
    if (fire) {
      fire = false;
      return true;
    }
    // PAG-02: woken by the payment, not by the time: no step runs, the schedule is read again.
    if (wakeOnPayment && paid && Date.now() < Date.parse(at)) return false;
    return queue.length === 0;
  }

  /** Rule 4: a back office request that was not applied leaves its outcome in the audit log. */
  async function outcome(request: BackOfficeRequest, result: "OTHER_ROUND" | "REFUSED") {
    try {
      await backOffice.recordBackOfficeOutcome({
        auctionId: request.auctionId,
        actionId: request.actionId,
        byUserId: request.byUserId,
        kind: request.kind,
        result,
      });
    } catch {
      log.warn("outcome of a back office request not recorded", { kind: request.kind });
    }
  }

  /** One round: top-up, reminder and closing; returns the valid offers, or null if cancelled. */
  async function runRound(start: RoundTimes): Promise<number | null> {
    let times = start;
    let toppedUp = false;
    let reminded = false;
    for (;;) {
      while (queue.length > 0) {
        const request = queue.shift() as BackOfficeRequest;
        // A request for another round (sent just before a closing) does not apply
        // here, and its outcome goes to the audit log (rule 4). patched(): the
        // workflows started before this rule keep their history.
        // Every new branch sits behind the same patch: a replayed old history
        // takes the old path (the current round, no outcome activity).
        const bound = patched("auction-bound-requests");
        if (bound && request.auctionId !== times.auctionId) {
          log.warn("back office request for another round", { kind: request.kind });
          await outcome(request, "OTHER_ROUND");
          continue;
        }
        const action = bound ? request : { ...request, auctionId: times.auctionId };
        try {
          if (action.kind === "extend") {
            await backOffice.extendRound(action);
          } else if (action.kind === "invite") {
            await backOffice.addInvitations(action);
          } else {
            await backOffice.cancelRound(action);
            return null;
          }
        } catch {
          // A refused request (after the first half, auction no longer open) is logged
          // and the auction goes on; the API checks the same rules before signalling.
          log.warn("back office request refused", {
            kind: request.kind,
            auctionId: times.auctionId,
          });
          if (bound) await outcome(request, "REFUSED");
        }
        times = await acts.roundTimes({ auctionId: times.auctionId });
      }
      const steps = [
        ...(toppedUp ? [] : [{ at: times.topUpAt, step: "topUp" as const }]),
        ...(reminded ? [] : [{ at: times.reminderAt, step: "remind" as const }]),
        { at: times.scheduledCloseAt, step: "close" as const },
      ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      const next = steps[0] as (typeof steps)[number];
      if (!(await waitUntil(next.at))) continue;
      if (next.step === "topUp") {
        await acts.topUp({ auctionId: times.auctionId });
        toppedUp = true;
      } else if (next.step === "remind") {
        await acts.remindAgencies({ auctionId: times.auctionId });
        reminded = true;
      } else {
        const result = await acts.closeRound({ auctionId: times.auctionId });
        if (result.cancelled) return null;
        // OFF-09: the PDF quotes are checked after the closing, never before.
        // patched(): the histories recorded before this step keep their path.
        if (result.validOffers > 0 && patched("offer-quote-check")) {
          await acts.reviewQuotes({ auctionId: times.auctionId });
        }
        return result.validOffers;
      }
    }
  }

  await condition(() => approved || reconfirm || paid || issuanceChanged);
  // A new run for a request already «Scaduta» (reconfirmation), already paid, or in issuance.
  const result = approved
    ? await auctionRounds()
    : paid || issuanceChanged
      ? await issuance()
      : "EXPIRED";
  if (result !== "EXPIRED") return result;
  return afterExpiry();

  /** The first auction and the reopening of a deserted one (ASTA-08), then the guarantees. */
  async function auctionRounds(): Promise<string> {
    let round = 1;
    const first = await acts.openRound({ requestId, kind: "MAIN", round });
    if (!first.opened) {
      if (first.reason === "NO_AGENCIES") {
        await acts.markDeserted({ requestId });
        return "DESERTED";
      }
      return first.reason;
    }
    let valid = await runRound(first);
    if (valid === null) return "CANCELLED";

    if (valid === 0) {
      // ASTA-08: one automatic reopening (by default) with every compatible agency not yet invited.
      const policy = await acts.reopenPolicy({ auctionId: first.auctionId });
      for (
        let attempt = 1;
        valid === 0 && policy.enabled && attempt <= policy.maxAttempts;
        attempt += 1
      ) {
        round += 1;
        const reopened = await acts.openRound({ requestId, kind: "REOPEN", round });
        if (!reopened.opened) break;
        valid = await runRound(reopened);
        if (valid === null) return "CANCELLED";
      }
      if (valid === 0) {
        await acts.markDeserted({ requestId });
        return "DESERTED";
      }
    }

    return guarantees();
  }

  /** Guarantees (GAR-05, GAR-06). Back office requests no longer apply. */
  async function guarantees(): Promise<string> {
    for (;;) {
      queue.length = 0;
      const s = await acts.guaranteeSchedule({ requestId });
      if (s.issuance) return issuance();
      if (!s.active || !s.allExpiredAt) return "OFFERS_CLOSED";
      const candidates = [
        ...(s.reminderAt && s.reminderOfferId
          ? [{ at: s.reminderAt, step: "remind" as const }]
          : []),
        ...(s.bestExpiresAt ? [{ at: s.bestExpiresAt, step: "recompute" as const }] : []),
        { at: s.allExpiredAt, step: "expire" as const },
      ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      const next = candidates[0] as (typeof candidates)[number];
      if (!(await waitUntil(next.at, true))) continue;
      if (next.step === "remind" && s.reminderOfferId) {
        await acts.sendGuaranteeReminder({ requestId, offerId: s.reminderOfferId });
      } else if (next.step === "expire") {
        const { expired } = await acts.expireRequest({ requestId });
        if (expired) return "EXPIRED";
      }
    }
  }

  /**
   * PAG-02, EMI-01: paid, the agency issues by the deadline; the reminder
   * before it (issuance.reminderMinutesBefore). What happens at the deadline
   * (missed issuance, EMI-04) belongs to phase 6.
   */
  async function issuance(): Promise<string> {
    if (patched("issuance-steps")) return issuanceSteps();
    const s = await acts.issuanceSchedule({ requestId });
    if (s.reminderAt) {
      const ms = Date.parse(s.reminderAt) - Date.now();
      if (ms > 0) await condition(() => fire, ms);
      fire = false;
      await acts.sendIssuanceReminder({ requestId });
    }
    return "IN_ISSUANCE";
  }

  /**
   * Phase 6 (EMI-01, EMI-03, EMI-04): the reminder before the deadline, the
   * delay at the deadline (penalty proposed), the missed issuance at the start
   * of cover (a case for the back office). The schedule is read again at
   * each step and whenever the issuance changes (issued, second offer,
   * refund); the steps are the activity's, each done once.
   */
  async function issuanceSteps(): Promise<string> {
    for (;;) {
      issuanceChanged = false;
      const s = await acts.issuanceSteps({ requestId });
      if (!s.inIssuance) return s.issued ? "ISSUED" : "CLOSED";
      if (s.nextStepAt) {
        const ms = Date.parse(s.nextStepAt) - Date.now();
        if (ms > 0) await condition(() => fire || issuanceChanged, ms);
      } else {
        // Every step done: the case is with the back office, until the issuance changes.
        await condition(() => fire || issuanceChanged);
      }
      if (issuanceChanged) continue;
      const forced = fire;
      fire = false;
      if (s.nextStepAt) await acts.runIssuanceStep({ requestId, force: forced });
    }
  }

  /**
   * «Scaduta» (GAR-06): a reconfirmation round when the requester asks for it
   * (GAR-07), else the automatic cancellation after requests.autoCancelExpiredDays.
   */
  async function afterExpiry(): Promise<string> {
    for (;;) {
      if (!reconfirm) {
        const s = await acts.expiredSchedule({ requestId });
        if (!s.expired || !s.autoCancelAt) return "EXPIRED_CLOSED";
        if (s.pending) {
          // Asked, its signal on the way from the outbox: wait for it, never cancel.
          await condition(() => fire || reconfirm, PENDING_SIGNAL_WAIT);
          fire = false;
          continue;
        }
        const ms = Date.parse(s.autoCancelAt) - Date.now();
        if (ms > 0) await condition(() => fire || reconfirm, ms);
        fire = false;
        if (!reconfirm) {
          const { cancelled } = await acts.autoCancelExpired({ requestId });
          if (cancelled) return "AUTO_CANCELLED";
          continue;
        }
      }
      reconfirm = false;
      const opened = await acts.openRound({ requestId, kind: "RECONFIRMATION", round: 0 });
      if (!opened.opened) {
        if (opened.reason === "NO_AGENCIES") {
          await acts.markDeserted({ requestId });
          return "DESERTED";
        }
        // Not «Scaduta» or no reconfirmation left: the API refuses the same, so
        // this is a late duplicate; the request keeps waiting as it is.
        continue;
      }
      const valid = await runRound(opened);
      if (valid === null) return "CANCELLED";
      if (valid === 0) {
        await acts.markDeserted({ requestId });
        return "DESERTED";
      }
      const end = await guarantees();
      if (end !== "EXPIRED") return end;
    }
  }
}
