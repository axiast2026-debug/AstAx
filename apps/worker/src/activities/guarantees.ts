import { addRequestEvent, SYSTEM_CONTEXT, withContext, type DbTransaction } from "@astax/db";
import {
  addCalendarDays,
  compareOffers,
  endOfRomeDay,
  isGuaranteed,
  romeInstant,
  transitionRequest,
  type RankedOffer,
} from "@astax/shared/domain";
import { dbDateToCalendarDate, formatDate } from "@astax/shared/format";
import type { PendingEmail } from "../notifier.js";
import {
  audit,
  quoteDataOf,
  requesterLink,
  requesterOf,
  vehicleForRequester,
  snapshotOf,
  type ActivityDeps,
} from "./support.js";
import type { AuctionActivities, GuaranteeSchedule } from "./types.js";

/**
 * Guarantees after the closing: the reminder about the best offer still
 * guaranteed (GAR-05) and «Scaduta» when every guarantee has ended (GAR-06).
 */
export function guaranteeActivities(
  deps: ActivityDeps,
): Pick<AuctionActivities, "guaranteeSchedule" | "sendGuaranteeReminder" | "expireRequest"> {
  const { db, clock, cipher, notifier, urls } = deps;

  /** The offers of the last closed round still waiting for the customer. */
  async function waitingOffers(tx: DbTransaction, requestId: string) {
    const last = await tx.auction.findFirst({
      where: { quoteRequestId: requestId, status: "CLOSED" },
      orderBy: { round: "desc" },
    });
    if (!last) return { snapshot: null, offers: [] };
    const offers = await tx.offer.findMany({
      where: { auctionId: last.id, status: "AWAITING_CUSTOMER" },
    });
    return {
      snapshot: snapshotOf(last),
      offers: offers.flatMap((o): (RankedOffer & { premium: number })[] =>
        o.annualGrossPremiumCents !== null && o.companyId && o.guaranteeUntil
          ? [
              {
                id: o.id,
                companyId: o.companyId,
                annualGrossPremiumCents: o.annualGrossPremiumCents,
                premium: o.annualGrossPremiumCents,
                guaranteeUntil: dbDateToCalendarDate(o.guaranteeUntil),
                lastSubmittedAt: o.lastChangedAt,
              },
            ]
          : [],
      ),
    };
  }

  async function guaranteeSchedule(input: { requestId: string }): Promise<GuaranteeSchedule> {
    return withContext(db, SYSTEM_CONTEXT, async (tx) => {
      const request = await tx.quoteRequest.findUniqueOrThrow({ where: { id: input.requestId } });
      if (request.status !== "OFFERS_AVAILABLE") {
        return {
          active: false,
          reminderAt: null,
          reminderOfferId: null,
          bestExpiresAt: null,
          allExpiredAt: null,
        };
      }
      const now = clock.now();
      const { snapshot, offers } = await waitingOffers(tx, request.id);
      const guaranteed = offers.filter((o) => isGuaranteed(o.guaranteeUntil, now));
      const best = [...guaranteed].sort(compareOffers)[0];
      let reminderAt: string | null = null;
      if (best && snapshot) {
        // ASTA-09: the values copied at the opening of the round (question 14 for the time).
        const days = snapshot["guarantee.reminderDaysBefore"];
        const time = snapshot["guarantee.reminderTime"] ?? "09:00";
        const sent = await tx.quoteRequestEvent.count({
          where: {
            quoteRequestId: request.id,
            type: "GUARANTEE_REMINDER_SENT",
            details: { path: ["offerId"], equals: best.id },
          },
        });
        if (sent === 0) {
          reminderAt = romeInstant(addCalendarDays(best.guaranteeUntil, -days), time).toISOString();
        }
      }
      const last = offers
        .map((o) => endOfRomeDay(o.guaranteeUntil).getTime())
        .reduce((a, b) => Math.max(a, b), Number.NEGATIVE_INFINITY);
      return {
        active: true,
        reminderAt,
        reminderOfferId: best?.id ?? null,
        bestExpiresAt: best
          ? new Date(endOfRomeDay(best.guaranteeUntil).getTime() + 1).toISOString()
          : null,
        allExpiredAt: Number.isFinite(last) ? new Date(last + 1).toISOString() : null,
      };
    });
  }

  async function sendGuaranteeReminder(input: { requestId: string; offerId: string }) {
    const pending: PendingEmail[] = [];
    await withContext(db, SYSTEM_CONTEXT, async (tx) => {
      const now = clock.now();
      const request = await tx.quoteRequest.findUniqueOrThrow({ where: { id: input.requestId } });
      if (request.status !== "OFFERS_AVAILABLE") return;
      const { offers } = await waitingOffers(tx, request.id);
      const best = offers.filter((o) => isGuaranteed(o.guaranteeUntil, now)).sort(compareOffers)[0];
      // GAR-05: only for the offer that is still the best guaranteed one.
      if (!best || best.id !== input.offerId) return;
      const already = await tx.quoteRequestEvent.count({
        where: {
          quoteRequestId: request.id,
          type: "GUARANTEE_REMINDER_SENT",
          details: { path: ["offerId"], equals: best.id },
        },
      });
      if (already > 0) return;
      const quoteData = await quoteDataOf(tx, cipher, request);
      const requester = await requesterOf(tx, cipher, request);
      const days = Math.max(
        0,
        Math.round((endOfRomeDay(best.guaranteeUntil).getTime() - now.getTime()) / 86_400_000),
      );
      await notifier.notify(
        tx,
        pending,
        requester.recipients,
        "guarantee.expiring",
        () => ({
          nome: requester.firstName,
          veicolo: vehicleForRequester(quoteData),
          garanzia: formatDate(best.guaranteeUntil),
          giorni: String(days),
          link: requesterLink(urls, request),
        }),
        new URL(requesterLink(urls, request)).pathname,
        { quoteRequestId: request.id },
      );
      await addRequestEvent(tx, request, {
        type: "GUARANTEE_REMINDER_SENT",
        actorKind: "SYSTEM",
        actorUserId: null,
        at: now,
        details: { offerId: best.id },
      });
    });
    await notifier.flush(pending);
  }

  /** GAR-06: every guarantee has ended: the offers expire and the request is «Scaduta». */
  async function expireRequest(input: { requestId: string }) {
    const pending: PendingEmail[] = [];
    const result = await withContext(db, SYSTEM_CONTEXT, async (tx) => {
      const now = clock.now();
      const request = await tx.quoteRequest.findUniqueOrThrow({ where: { id: input.requestId } });
      if (request.status !== "OFFERS_AVAILABLE") return { expired: request.status === "EXPIRED" };
      const { offers } = await waitingOffers(tx, request.id);
      if (offers.some((o) => isGuaranteed(o.guaranteeUntil, now))) return { expired: false };
      await tx.offer.updateMany({
        where: { id: { in: offers.map((o) => o.id) }, status: "AWAITING_CUSTOMER" },
        data: { status: "EXPIRED" },
      });
      transitionRequest("OFFERS_AVAILABLE", "EXPIRED");
      await tx.quoteRequest.update({ where: { id: request.id }, data: { status: "EXPIRED" } });
      await addRequestEvent(tx, request, {
        type: "EXPIRED",
        actorKind: "SYSTEM",
        actorUserId: null,
        at: now,
      });
      await audit(tx, now, {
        action: "REQUEST_EXPIRED",
        targetType: "QuoteRequest",
        targetId: request.id,
      });
      const quoteData = await quoteDataOf(tx, cipher, request);
      const requester = await requesterOf(tx, cipher, request);
      await notifier.notify(
        tx,
        pending,
        requester.recipients,
        "request.expired",
        () => ({
          nome: requester.firstName,
          veicolo: vehicleForRequester(quoteData),
          link: requesterLink(urls, request),
        }),
        new URL(requesterLink(urls, request)).pathname,
        { quoteRequestId: request.id },
      );
      return { expired: true };
    });
    await notifier.flush(pending);
    if (result.expired) await deps.publish({ type: "REQUEST_CHANGED", requestId: input.requestId });
    return result;
  }

  return { guaranteeSchedule, sendGuaranteeReminder, expireRequest };
}
