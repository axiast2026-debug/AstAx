import {
  addRequestEvent,
  publishLastRanking,
  reconfirmationPending,
  settingsAt,
  SYSTEM_CONTEXT,
  withContext,
  type DbTransaction,
} from "@astax/db";
import {
  addCalendarDays,
  compareOffers,
  endOfRomeDay,
  isGuaranteed,
  romeInstant,
  transitionRequest,
  type RankedOffer,
} from "@astax/shared/domain";
import { dbDateToCalendarDate, formatDate, romeCalendarDate } from "@astax/shared/format";
import type { PendingEmail } from "../notifier.js";
import {
  audit,
  quoteDataOf,
  rankingRecipients,
  requesterLink,
  requesterOf,
  vehicleForRequester,
  snapshotOf,
  type ActivityDeps,
} from "./support.js";
import type { AuctionActivities, ExpiredSchedule, GuaranteeSchedule } from "./types.js";

/**
 * Guarantees after the closing: the reminder about the best offer still
 * guaranteed (GAR-05) and «Scaduta» when every guarantee has ended (GAR-06).
 */
export function guaranteeActivities(
  deps: ActivityDeps,
): Pick<
  AuctionActivities,
  | "guaranteeSchedule"
  | "sendGuaranteeReminder"
  | "expireRequest"
  | "expiredSchedule"
  | "autoCancelExpired"
> {
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
      if (request.status === "IN_ISSUANCE") {
        return {
          active: false,
          reminderAt: null,
          reminderOfferId: null,
          bestExpiresAt: null,
          allExpiredAt: null,
          issuance: true,
        };
      }
      // ACCEPTED: signed, waiting for the payment; the guarantees still run (GAR-04).
      if (request.status !== "OFFERS_AVAILABLE" && request.status !== "ACCEPTED") {
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
        // A round opened before the parameter existed uses the value in force.
        const time =
          snapshot["guarantee.reminderTime"] ??
          (await settingsAt(tx, ["guarantee.reminderTime"], now))["guarantee.reminderTime"];
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
        // OFF-09: no offer left (the back office excluded the last one): «Scaduta» now.
        allExpiredAt: Number.isFinite(last) ? new Date(last + 1).toISOString() : now.toISOString(),
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
      if (request.status !== "OFFERS_AVAILABLE" && request.status !== "ACCEPTED") {
        return { expired: request.status === "EXPIRED" };
      }
      const { offers } = await waitingOffers(tx, request.id);
      if (offers.some((o) => isGuaranteed(o.guaranteeUntil, now))) return { expired: false };
      // Not paid while every guarantee ended: the acceptance lapses (PAG-03),
      // also one signed whose payment was refused (the request is back to
      // «Offerte disponibili»), so that a reconfirmation starts clean.
      await tx.acceptance.updateMany({
        where: { quoteRequestId: request.id, status: { in: ["PENDING_SIGNATURE", "SIGNED"] } },
        data: { status: "VOIDED", voidedAt: now, voidReason: "GUARANTEE_EXPIRED" },
      });
      if (request.status === "ACCEPTED") transitionRequest("ACCEPTED", "OFFERS_AVAILABLE");
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

  async function maxReconfirmations(tx: DbTransaction): Promise<number> {
    const { "reconfirmation.maxPerRequest": max } = await settingsAt(
      tx,
      ["reconfirmation.maxPerRequest"],
      clock.now(),
    );
    return max;
  }

  /** When a request «Scaduta» without actions closes by itself (GAR-06, proposal D). */
  async function autoCancelAtOf(tx: DbTransaction, requestId: string, now: Date) {
    const since = await tx.quoteRequestEvent.findFirst({
      where: { quoteRequestId: requestId, type: "EXPIRED" },
      orderBy: { at: "desc" },
    });
    const { "requests.autoCancelExpiredDays": days } = await settingsAt(
      tx,
      ["requests.autoCancelExpiredDays"],
      now,
    );
    // Calendar days in Rome (rule 6): from the start of the day after the last
    // of them, whatever the change to and from summer time in between.
    const expiredOn = romeCalendarDate(since?.at ?? now);
    return { at: romeInstant(addCalendarDays(expiredOn, days + 1), "00:00"), days };
  }

  async function expiredSchedule(input: { requestId: string }): Promise<ExpiredSchedule> {
    return withContext(db, SYSTEM_CONTEXT, async (tx) => {
      const request = await tx.quoteRequest.findUniqueOrThrow({ where: { id: input.requestId } });
      if (request.status !== "EXPIRED") return { expired: false, autoCancelAt: null };
      const { at } = await autoCancelAtOf(tx, request.id, clock.now());
      const pending = await reconfirmationPending(tx, request, await maxReconfirmations(tx));
      return { expired: true, autoCancelAt: at.toISOString(), ...(pending ? { pending } : {}) };
    });
  }

  async function autoCancelExpired(input: { requestId: string }) {
    const pending: PendingEmail[] = [];
    const result = await withContext(db, SYSTEM_CONTEXT, async (tx) => {
      const now = clock.now();
      const request = await tx.quoteRequest.findUniqueOrThrow({ where: { id: input.requestId } });
      if (request.status !== "EXPIRED") return { cancelled: request.status === "CANCELLED" };
      const { at, days } = await autoCancelAtOf(tx, request.id, now);
      if (now < at) return { cancelled: false };
      // GAR-06: a reconfirmation asked just before the end is an action: no cancellation.
      if (await reconfirmationPending(tx, request, await maxReconfirmations(tx))) {
        return { cancelled: false };
      }
      transitionRequest("EXPIRED", "CANCELLED");
      await tx.quoteRequest.update({ where: { id: request.id }, data: { status: "CANCELLED" } });
      await addRequestEvent(tx, request, {
        type: "AUTO_CANCELLED",
        actorKind: "SYSTEM",
        actorUserId: null,
        at: now,
      });
      await audit(tx, now, {
        action: "REQUEST_AUTO_CANCELLED",
        targetType: "QuoteRequest",
        targetId: request.id,
        after: { days },
      });
      const quoteData = await quoteDataOf(tx, cipher, request);
      const requester = await requesterOf(tx, cipher, request);
      await notifier.notify(
        tx,
        pending,
        requester.recipients,
        "request.auto_cancelled",
        () => ({
          nome: requester.firstName,
          veicolo: vehicleForRequester(quoteData),
          giorni: String(days),
          link: requesterLink(urls, request),
        }),
        new URL(requesterLink(urls, request)).pathname,
        { quoteRequestId: request.id },
      );
      // CLA-02: cancelled without acceptance, the ranking of the last round with valid offers.
      const published = await publishLastRanking(tx, request.id, now);
      if (published) {
        await audit(tx, now, {
          action: "RANKING_PUBLISHED",
          targetType: "Auction",
          targetId: published.auctionId,
          after: { validCount: published.validCount },
        });
        const link = `${urls.web}/risultati`;
        for (const e of published.entries) {
          if (!e.organizationId) continue;
          await notifier.notify(
            tx,
            pending,
            await rankingRecipients(
              tx,
              cipher,
              e.organizationId,
              published.authors[e.offerId] ?? null,
            ),
            "ranking.available",
            () => ({
              codice: request.code,
              posizione: String(e.rank),
              totale_offerte: String(published.validCount),
              link,
            }),
            "/risultati",
            { auctionId: published.auctionId },
          );
        }
        for (const o of published.excluded) {
          await notifier.notify(
            tx,
            pending,
            await rankingRecipients(tx, cipher, o.organizationId, o.userId),
            "ranking.available.excluded",
            () => ({ codice: request.code, link: `${urls.web}/le-mie-offerte` }),
            "/le-mie-offerte",
            { auctionId: published.auctionId },
          );
        }
      }
      return { cancelled: true };
    });
    await notifier.flush(pending);
    if (result.cancelled) {
      await deps.publish({ type: "REQUEST_CHANGED", requestId: input.requestId });
    }
    return result;
  }

  return {
    guaranteeSchedule,
    sendGuaranteeReminder,
    expireRequest,
    expiredSchedule,
    autoCancelExpired,
  };
}
