import { z } from "zod";
import { isCalendarDate } from "./calendar-date.js";
import { normalizePlate } from "./plates.js";

/**
 * Dan, 2026-10-28 (docs/piano-back-office-verifica.md): the five checks the
 * back office operator makes on a request before the approval. Each one is
 * confirmed by a person, with the time; plate and birth date may carry a
 * corrected value, the type of quote the confirmed type.
 */
export const VERIFICATION_STEPS = [
  "REGISTRATION",
  "IDENTITY",
  "PLATE",
  "BIRTH_DATE",
  "QUOTE_TYPE",
] as const;
export type VerificationStep = (typeof VERIFICATION_STEPS)[number];

/** The types of quote the operator confirms (Dan, 2026-10-28, question 42). */
export const QUOTE_TYPES = ["RENEWAL", "NEW_VEHICLE", "FAMILY_CLASS", "OWN_OTHER_VEHICLE"] as const;
export type QuoteType = (typeof QUOTE_TYPES)[number];

/** The provenance of the quote data that each type of quote means. */
export const QUOTE_TYPE_PROVENANCE: Record<QuoteType, string> = {
  RENEWAL: "FROM_OTHER_COMPANY",
  NEW_VEHICLE: "FIRST_REGISTRATION",
  FAMILY_CLASS: "FAMILY_RC",
  OWN_OTHER_VEHICLE: "FROM_OTHER_COMPANY",
};

const done = { at: z.iso.datetime(), byUserId: z.uuid() };

export const VerificationChecksSchema = z.strictObject({
  REGISTRATION: z.strictObject(done).optional(),
  IDENTITY: z.strictObject(done).optional(),
  PLATE: z.strictObject({ ...done, value: z.string().optional() }).optional(),
  BIRTH_DATE: z.strictObject({ ...done, value: z.string().optional() }).optional(),
  QUOTE_TYPE: z.strictObject({ ...done, value: z.enum(QUOTE_TYPES) }).optional(),
});
export type VerificationChecks = z.infer<typeof VerificationChecksSchema>;

/** What a check says when it is confirmed: a value only where the step has one. */
export type CheckInput =
  | { step: "REGISTRATION" | "IDENTITY" }
  | { step: "PLATE"; value?: string }
  | { step: "BIRTH_DATE"; value?: string }
  | { step: "QUOTE_TYPE"; value: QuoteType };

/** The issue of a check that cannot be recorded, or null. */
export function checkProblem(input: CheckInput): string | null {
  if (input.step === "PLATE" && input.value !== undefined) {
    return /^[A-Z0-9]{5,10}$/.test(normalizePlate(input.value)) ? null : "INVALID_PLATE";
  }
  if (input.step === "BIRTH_DATE" && input.value !== undefined) {
    return isCalendarDate(input.value) ? null : "INVALID_DATE";
  }
  if (input.step === "QUOTE_TYPE") {
    return (QUOTE_TYPES as readonly string[]).includes(input.value) ? null : "INVALID_QUOTE_TYPE";
  }
  return null;
}

/** The steps still to confirm, in order; empty when the approval may go. */
export function missingChecks(checks: VerificationChecks): VerificationStep[] {
  return VERIFICATION_STEPS.filter((step) => !checks[step]);
}
