import { condition, defineSignal, log, proxyActivities, setHandler } from "@temporalio/workflow";
import type { AuctionActivities, BackOfficeAction, RoundTimes } from "../activities/types.js";

/**
 * QuoteRequestWorkflow (docs/architettura-codice.md, ADR 0008): one per
 * request, id `quote-request-{id}`. From the approval: opening, top-up,
 * reminder and closing of the auction, the reopening of a deserted auction
 * (ASTA-08), then the guarantees until «Scaduta» (GAR-05, GAR-06).
 * Deterministic: the time is the workflow's, the work is in the activities,
 * and only identifiers, counts and instants pass through (BC-07).
 */

export const approvedSignal = defineSignal("approved");
/** Development tool (DEV_TOOLS): the next timer fires at once. */
export const fireNextTimerSignal = defineSignal("fireNextTimer");
export const auctionExtendedSignal =
  defineSignal<[{ workingHours: number } & BackOfficeAction]>("auctionExtended");
export const invitationsAddedSignal =
  defineSignal<[{ organizationIds: string[] } & BackOfficeAction]>("invitationsAdded");
export const auctionCancelledSignal = defineSignal<[BackOfficeAction]>("auctionCancelled");

export const workflowIdOf = (requestId: string) => `quote-request-${requestId}`;

const acts = proxyActivities<AuctionActivities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumInterval: "1 minute",
    maximumAttempts: 20,
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

  /**
   * Waits until `at` (an absolute instant). True when the time has come or the
   * development tool fired the timer; false when a back office request arrived.
   */
  async function waitUntil(at: string): Promise<boolean> {
    const ms = Date.parse(at) - Date.now();
    if (ms > 0) await condition(() => fire || queue.length > 0, ms);
    if (fire) {
      fire = false;
      return true;
    }
    return queue.length === 0;
  }

  /** One round: top-up, reminder and closing; returns the valid offers, or null if cancelled. */
  async function runRound(start: RoundTimes): Promise<number | null> {
    let times = start;
    let toppedUp = false;
    let reminded = false;
    for (;;) {
      while (queue.length > 0) {
        const request = queue.shift() as BackOfficeRequest;
        try {
          if (request.kind === "extend") {
            await acts.extendRound({ auctionId: times.auctionId, ...request });
          } else if (request.kind === "invite") {
            await acts.addInvitations({ auctionId: times.auctionId, ...request });
          } else {
            await acts.cancelRound({ auctionId: times.auctionId, ...request });
            return null;
          }
        } catch {
          // A refused request (after the first half, auction no longer open) is logged
          // and the auction goes on; the API checks the same rules before signalling.
          log.warn("back office request refused", {
            kind: request.kind,
            auctionId: times.auctionId,
          });
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
        return result.cancelled ? null : result.validOffers;
      }
    }
  }

  await condition(() => approved);

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

  // Guarantees (GAR-05, GAR-06). Back office requests no longer apply.
  for (;;) {
    queue.length = 0;
    const s = await acts.guaranteeSchedule({ requestId });
    if (!s.active || !s.allExpiredAt) return "OFFERS_CLOSED";
    const candidates = [
      ...(s.reminderAt && s.reminderOfferId ? [{ at: s.reminderAt, step: "remind" as const }] : []),
      ...(s.bestExpiresAt ? [{ at: s.bestExpiresAt, step: "recompute" as const }] : []),
      { at: s.allExpiredAt, step: "expire" as const },
    ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const next = candidates[0] as (typeof candidates)[number];
    if (!(await waitUntil(next.at))) continue;
    if (next.step === "remind" && s.reminderOfferId) {
      await acts.sendGuaranteeReminder({ requestId, offerId: s.reminderOfferId });
    } else if (next.step === "expire") {
      const { expired } = await acts.expireRequest({ requestId });
      if (expired) return "EXPIRED";
    }
  }
}
