import { compareOffers, isGuaranteed, type RankedOffer } from "./auction-rules.js";
import { addCalendarDays, compareCalendarDates } from "./calendar-date.js";
import { customerFee, type FeeSettings } from "./acceptance.js";

/**
 * EMI-04, decision 28: after a missed issuance by the agency's fault, the
 * second offer is the best offer still guaranteed of another agency, in the
 * order of PRES-01.
 */
export function secondOffer<T extends RankedOffer & { organizationId: string }>(
  offers: readonly T[],
  failedOrganizationId: string,
  now: Date,
): T | null {
  const candidates = offers
    .filter((o) => o.organizationId !== failedOrganizationId)
    .filter((o) => isGuaranteed(o.guaranteeUntil, now))
    .sort(compareOffers);
  return candidates[0] ?? null;
}

export interface SecondOfferTerms {
  premiumCents: number;
  feeCents: number;
  /** Positive: the customer pays it; negative: AstAx gives it back. */
  differenceCents: number;
}

/**
 * EMI-04: what the customer pays or gets back moving to the second offer.
 * The fee is computed again with the same rule (FEE-01…03): it changes only
 * if the new premium crosses the threshold of FEE-02.
 */
export function secondOfferTerms(
  paid: { premiumCents: number; feeCents: number },
  next: { premiumCents: number },
  request: { channel: "PRIVATE" | "BROKER"; aiUsed: boolean },
  fees: FeeSettings,
): SecondOfferTerms {
  const fee = customerFee(
    { channel: request.channel, premiumCents: next.premiumCents, aiUsed: request.aiUsed },
    fees,
  );
  return {
    premiumCents: next.premiumCents,
    feeCents: fee.feeCents,
    differenceCents: next.premiumCents + fee.feeCents - (paid.premiumCents + paid.feeCents),
  };
}

/** A calendar date some months before, the day kept or moved to the last of the month. */
export function monthsBefore(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) - months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/**
 * EMI-06, decision 30: three missed issuances by the agency's fault within
 * six months (parameters `penalties.suspension.*`) suspend the agency from
 * the invitations. The dates are those of the back office's decisions.
 */
export function suspensionDue(
  missedOn: readonly string[],
  today: string,
  settings: { missedIssuances: number; windowMonths: number },
): boolean {
  const from = monthsBefore(today, settings.windowMonths);
  const inWindow = missedOn.filter(
    (d) => compareCalendarDates(d, from) > 0 && compareCalendarDates(d, today) <= 0,
  );
  return inWindow.length >= settings.missedIssuances;
}

/**
 * A policy runs one year from its start: the last day covered is the day
 * before the same date of the next year (29 February → 28 February).
 */
export function policyEndDate(startDate: string): string {
  const [y, m, d] = startDate.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y + 1, m, 0)).getUTCDate();
  const same = `${y + 1}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
  return addCalendarDays(same, -1);
}

/** The renewal notice (`renewal.daysBefore`, 30 by default) before the end of the policy. */
export function renewalNoticeDate(endDate: string, daysBefore: number): string {
  return addCalendarDays(endDate, -daysBefore);
}

/** The questionnaire after the sale (`survey.daysAfterIssuance`, 7 by default). */
export function surveyDate(issuedOn: string, daysAfter: number): string {
  return addCalendarDays(issuedOn, daysAfter);
}
