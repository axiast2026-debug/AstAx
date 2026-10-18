import { compareCalendarDates } from "./calendar-date.js";
import { isGuaranteed } from "./auction-rules.js";
import {
  addWorkingMinutes,
  endOfRomeDay,
  romeInstant,
  subtractWorkingMinutes,
  type WorkingCalendar,
} from "./working-calendar.js";

/**
 * Acceptance (phase 5): the fee of the customer (FEE-01…03, FEE-06), the last
 * useful moment to accept (GAR-04) and the issuance deadline (EMI-01). One
 * function each, used by the API and shown by the screens; amounts in whole
 * cents (FEE-07), every number from the parameters (rule 7).
 */

export interface FeeSettings {
  /** fees.private.amountCents */
  privateCents: number;
  /** fees.private.aiSupplementCents */
  aiSupplementCents: number;
  /** fees.private.lowPremium.thresholdCents */
  lowPremiumThresholdCents: number;
  /** fees.private.lowPremium.amountCents */
  lowPremiumCents: number;
  /** fees.broker.amountCents */
  brokerCents: number;
}

export type FeeRule = "PRIVATE" | "PRIVATE_AI" | "PRIVATE_LOW" | "PRIVATE_LOW_AI" | "BROKER_CLIENT";

export interface Fee {
  /** What the customer pays on top of the premium. */
  feeCents: number;
  rule: FeeRule;
  /** FEE-03: what the broker owes AstAx once the policy is issued (zero for a private). */
  brokerFeeCents: number;
}

/**
 * FEE-01: a private pays the fee, more if they used the AI comparison on the
 * request at any time before buying. FEE-02: below the threshold (strictly:
 * 200,00 € exactly is the full fee, question 3) the reduced fee. FEE-03: the
 * broker's customer pays no fee; the broker owes its own, never reduced.
 */
export function customerFee(
  input: { channel: "PRIVATE" | "BROKER"; premiumCents: number; aiUsed: boolean },
  settings: FeeSettings,
): Fee {
  if (!Number.isInteger(input.premiumCents) || input.premiumCents <= 0) {
    throw new Error("The premium must be a positive whole number of cents");
  }
  if (input.channel === "BROKER") {
    return { feeCents: 0, rule: "BROKER_CLIENT", brokerFeeCents: settings.brokerCents };
  }
  // FEE-02, question 3 (Dan, 2026-10-18): up to the threshold included.
  const low = input.premiumCents <= settings.lowPremiumThresholdCents;
  const base = low ? settings.lowPremiumCents : settings.privateCents;
  const ai = input.aiUsed ? settings.aiSupplementCents : 0;
  const rule: FeeRule = low
    ? input.aiUsed
      ? "PRIVATE_LOW_AI"
      : "PRIVATE_LOW"
    : input.aiUsed
      ? "PRIVATE_AI"
      : "PRIVATE";
  return { feeCents: base + ai, rule, brokerFeeCents: 0 };
}

/**
 * The start of cover: 00:00 in Rome of the start date (question 1, prudent
 * value: the earliest moment, so that nothing is accepted or issued too late).
 */
export function coverStart(startDate: string): Date {
  return romeInstant(startDate, "00:00");
}

/**
 * GAR-04: the last moment to accept is the start of cover less the issuance
 * time (EMI-01), counted backwards on the working calendar.
 */
export function lastAcceptanceMoment(
  calendar: WorkingCalendar,
  startDate: string,
  issuanceWorkingHours: number,
): Date {
  return subtractWorkingMinutes(calendar, coverStart(startDate), issuanceWorkingHours * 60);
}

export type AcceptanceBlock = "EXPIRED" | "TOO_LATE" | null;

/** GAR-04: whether an offer may be accepted now, and why not. */
export function acceptanceBlock(
  input: { guaranteeUntil: string; startDate: string; now: Date },
  calendar: WorkingCalendar,
  issuanceWorkingHours: number,
): AcceptanceBlock {
  if (!isGuaranteed(input.guaranteeUntil, input.now)) return "EXPIRED";
  if (input.now >= lastAcceptanceMoment(calendar, input.startDate, issuanceWorkingHours)) {
    return "TOO_LATE";
  }
  return null;
}

/**
 * EMI-01: the issuance deadline, issuance.deadlineWorkingHours from the
 * payment, and in any case before the start of cover.
 */
export function issuanceDeadline(
  calendar: WorkingCalendar,
  paidAt: Date,
  startDate: string,
  issuanceWorkingHours: number,
): Date {
  const byHours = addWorkingMinutes(calendar, paidAt, issuanceWorkingHours * 60);
  const start = coverStart(startDate);
  return byHours < start ? byHours : start;
}

/** PRES-03: the saving on the current premium, when the requester gave one and it is lower. */
export function savingCents(
  currentPremiumCents: number | null,
  premiumCents: number,
): number | null {
  if (currentPremiumCents === null || currentPremiumCents <= premiumCents) return null;
  return currentPremiumCents - premiumCents;
}

/** PRES-04: whole calendar days of guarantee left from today (0 on its last day). */
export function guaranteeDaysLeft(guaranteeUntil: string, today: string): number {
  if (compareCalendarDates(guaranteeUntil, today) < 0) return 0;
  const end = endOfRomeDay(guaranteeUntil).getTime();
  const start = endOfRomeDay(today).getTime();
  return Math.round((end - start) / 86_400_000);
}
