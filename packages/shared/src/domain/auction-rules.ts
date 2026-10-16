import { addCalendarDays, compareCalendarDates } from "./calendar-date.js";
import {
  addWorkingMinutes,
  endOfRomeDay,
  romeLocal,
  subtractWorkingMinutes,
  workingMinutesBetween,
  type WorkingCalendar,
} from "./working-calendar.js";

const HOUR_MINUTES = 60;

/** The parameters an auction copies when it opens (ASTA-09). */
export interface AuctionSettings {
  closingReminderMinutes: number;
  topUpCheckAtFraction: number;
  topUpMinOffers: number;
  topUpExtra: number;
  backOfficeWindowFraction: number;
  invitationsMax: number;
  minReceptionOverlapWorkingHours: number;
}

export interface AuctionTimes {
  scheduledCloseAt: Date;
  /** GAR-01: calendar date, Rome time; a later extension does not move it. */
  minGuaranteeDate: string;
  /** ASTA-04: the check for the top-up of invitations. */
  topUpAt: Date;
  /** ASTA-07: the reminder to the invited agencies that have not offered yet. */
  reminderAt: Date;
  /** ASTA-06: the back office may add invitations until this instant. */
  backOfficeInvitesUntil: Date;
}

/**
 * Times of an auction that opens at `openedAt` and lasts `durationHours`
 * working hours (ASTA-01, ASTA-02).
 * - GAR-01: minimum guarantee = date of the scheduled closing + the minimum
 *   validity asked, in calendar days.
 * - ASTA-07: the reminder goes `closingReminderMinutes` working minutes before
 *   the closing; when the auction is not longer than twice that (2 hours with
 *   the default 60 minutes), at half of it.
 */
export function auctionTimes(
  calendar: WorkingCalendar,
  openedAt: Date,
  durationHours: number,
  minValidityDays: number,
  settings: AuctionSettings,
): AuctionTimes {
  const total = durationHours * HOUR_MINUTES;
  const scheduledCloseAt = addWorkingMinutes(calendar, openedAt, total);
  const at = (fraction: number) => addWorkingMinutes(calendar, openedAt, total * fraction);
  return {
    scheduledCloseAt,
    minGuaranteeDate: minGuaranteeDate(scheduledCloseAt, minValidityDays),
    topUpAt: at(settings.topUpCheckAtFraction),
    reminderAt:
      total <= 2 * settings.closingReminderMinutes
        ? at(0.5)
        : subtractWorkingMinutes(calendar, scheduledCloseAt, settings.closingReminderMinutes),
    backOfficeInvitesUntil: at(settings.backOfficeWindowFraction),
  };
}

/** GAR-01: Rome date of the closing planned at the opening, plus the validity days. */
export function minGuaranteeDate(scheduledCloseAt: Date, minValidityDays: number): string {
  return addCalendarDays(romeLocal(scheduledCloseAt).date, minValidityDays);
}

/** OFF-05: the guarantee date of an offer is the minimum one or later. */
export function guaranteeDateAccepted(guaranteeUntil: string, minGuarantee: string): boolean {
  return compareCalendarDates(guaranteeUntil, minGuarantee) >= 0;
}

/** GAR-02: an offer is guaranteed until 23:59:59 of its guarantee date, Rome time. */
export function isGuaranteed(guaranteeUntil: string, now: Date): boolean {
  return now <= endOfRomeDay(guaranteeUntil);
}

/**
 * ASTA-04: how many agencies the top-up invites, at most. None when the
 * auction has already received enough offers.
 */
export function topUpSize(offers: number, settings: AuctionSettings): number {
  return offers < settings.topUpMinOffers ? settings.topUpExtra : 0;
}

/**
 * ASTA-06: the back office may add invitations only in the first part of the
 * auction (half, by default), counted in working time.
 */
export function backOfficeMayInvite(
  calendar: WorkingCalendar,
  openedAt: Date,
  scheduledCloseAt: Date,
  now: Date,
  settings: AuctionSettings,
): boolean {
  const total = workingMinutesBetween(calendar, openedAt, scheduledCloseAt);
  return workingMinutesBetween(calendar, openedAt, now) < total * settings.backOfficeWindowFraction;
}

// ---------------------------------------------------------------------------
// Order of the offers and best offer per company (PRES-01, PRES-02, CLA-01)
// ---------------------------------------------------------------------------

export interface RankedOffer {
  id: string;
  companyId: string;
  annualGrossPremiumCents: number;
  /** Calendar date, Rome time. */
  guaranteeUntil: string;
  /** Server time of the submission or of the last change (PRES-01). */
  lastSubmittedAt: Date;
}

/**
 * PRES-01: lowest premium first; same premium, longer guarantee first; same
 * guarantee, the older submission (server time of the last change) first.
 */
export function compareOffers(a: RankedOffer, b: RankedOffer): number {
  if (a.annualGrossPremiumCents !== b.annualGrossPremiumCents) {
    return a.annualGrossPremiumCents - b.annualGrossPremiumCents;
  }
  const byGuarantee = compareCalendarDates(b.guaranteeUntil, a.guaranteeUntil);
  if (byGuarantee !== 0) return byGuarantee;
  const byTime = a.lastSubmittedAt.getTime() - b.lastSubmittedAt.getTime();
  return byTime !== 0 ? byTime : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** CLA-01: the valid offers of the round in order, with their position from 1. */
export function rankOffers<T extends RankedOffer>(offers: readonly T[]): (T & { rank: number })[] {
  return [...offers].sort(compareOffers).map((offer, i) => ({ ...offer, rank: i + 1 }));
}

export interface CompanyBest<T> {
  offer: T;
  /** False when no offer of the company is still guaranteed: shown in grey, not acceptable. */
  guaranteed: boolean;
}

/**
 * PRES-02: for each company, the best offer among those still guaranteed;
 * when none is, the best expired one. Rows in the order of PRES-01.
 */
export function bestOfferPerCompany<T extends RankedOffer>(
  offers: readonly T[],
  now: Date,
): CompanyBest<T>[] {
  const best = new Map<string, CompanyBest<T>>();
  for (const offer of [...offers].sort(compareOffers)) {
    const guaranteed = isGuaranteed(offer.guaranteeUntil, now);
    const current = best.get(offer.companyId);
    if (!current || (guaranteed && !current.guaranteed)) {
      best.set(offer.companyId, { offer, guaranteed });
    }
  }
  return [...best.values()].sort((a, b) => compareOffers(a.offer, b.offer));
}
