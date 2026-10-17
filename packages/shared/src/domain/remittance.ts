import { addCalendarDays } from "./calendar-date.js";
import { romeInstant, weekdayOf, type WeekdayKey } from "./working-calendar.js";

/**
 * CONT-01, EMI-05, decision 23b: the weekly remittance to an agency. The
 * premium of each policy issued in the period, less the agency fee (FEE-04),
 * less what AstAx holds back: the quota of the broker (decision 25, off for
 * now), what is left from earlier weeks, the premiums refunded to customers
 * (PAG-04) and the penalties applied. A remittance is never negative: what
 * does not fit passes to the next one.
 */
export type DeductionKind = "BROKER_SHARE" | "CARRIED_OVER" | "RECOVERY" | "PENALTY";

export interface RemittancePolicy {
  policyId: string;
  premiumCents: number;
  agencyFeeCents: number;
}

export interface Deduction {
  kind: DeductionKind;
  /** The penalty, the refund, the policy of the broker's quota, or the earlier remittance. */
  ref: string;
  cents: number;
}

export interface RemittanceResult {
  grossCents: number;
  feesCents: number;
  /** What was held back this week, by kind. */
  held: Record<DeductionKind, number>;
  netCents: number;
  /** Each deduction as applied: whole, in part, or not at all. */
  applied: (Deduction & { appliedCents: number })[];
  /** What passes to the next remittance (CARRIED_OVER there). */
  carriedCents: number;
}

/** The order of the hold-backs: the broker's money first, then the oldest debts. */
const ORDER: DeductionKind[] = ["BROKER_SHARE", "CARRIED_OVER", "RECOVERY", "PENALTY"];

function assertCents(value: number, what: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${what} must be a whole, non-negative number of cents`);
  }
}

export function computeRemittance(
  policies: readonly RemittancePolicy[],
  deductions: readonly Deduction[],
): RemittanceResult {
  for (const p of policies) {
    assertCents(p.premiumCents, "premiumCents");
    assertCents(p.agencyFeeCents, "agencyFeeCents");
  }
  for (const d of deductions) assertCents(d.cents, "deduction");
  const grossCents = policies.reduce((sum, p) => sum + p.premiumCents, 0);
  const feesCents = policies.reduce((sum, p) => sum + p.agencyFeeCents, 0);
  let available = Math.max(0, grossCents - feesCents);
  const held: Record<DeductionKind, number> = {
    BROKER_SHARE: 0,
    CARRIED_OVER: 0,
    RECOVERY: 0,
    PENALTY: 0,
  };
  const sorted = [...deductions].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const applied = sorted.map((d) => {
    const appliedCents = Math.min(d.cents, available);
    available -= appliedCents;
    held[d.kind] += appliedCents;
    return { ...d, appliedCents };
  });
  const carriedCents = applied.reduce((sum, d) => sum + d.cents - d.appliedCents, 0);
  return { grossCents, feesCents, held, netCents: available, applied, carriedCents };
}

const WEEKDAYS: WeekdayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/**
 * CONT-01: the policies of a remittance are those issued up to the cutoff of
 * the week before the run day (by default Friday 23:59 in Rome, from the
 * parameters `remittance.runDay` and `remittance.cutoff`).
 */
export function remittanceCutoff(runDate: string, cutoff: { day: string; time: string }): Date {
  const target = WEEKDAYS.find((d) => d === cutoff.day.slice(0, 3).toLowerCase());
  if (!target) throw new Error(`Unknown cutoff day ${cutoff.day}`);
  // The latest such weekday strictly before the run date.
  let date = addCalendarDays(runDate, -1);
  while (weekdayOf(date) !== target) date = addCalendarDays(date, -1);
  // 23:59 means up to the end of that minute.
  return new Date(romeInstant(date, cutoff.time).getTime() + 59_999);
}

/** True when the date is the run day of the remittances (`remittance.runDay`). */
export function isRemittanceDay(date: string, runDay: string): boolean {
  return weekdayOf(date) === runDay.slice(0, 3).toLowerCase();
}
