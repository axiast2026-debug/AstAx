import type { GuaranteeState } from "@astax/ui";

/**
 * How an offer's guaranteed price looks (GAR-02, GAR-04, GAR-05): grey once
 * expired, the hours on its last day, orange from the day of the reminder.
 */
export function guaranteeState(
  offer: { block: "EXPIRED" | "TOO_LATE" | null; daysLeft: number },
  reminderDaysBefore: number,
): GuaranteeState {
  if (offer.block === "EXPIRED") return "expired";
  if (offer.daysLeft === 0) return "lastDay";
  if (offer.daysLeft <= reminderDaysBefore) return "expiring";
  return "ok";
}
