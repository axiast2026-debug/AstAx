import { z } from "zod";
import { CALENDAR_DATE_PATTERN, isCalendarDate } from "./calendar-date.js";
import { OfferCoverageSchema } from "./coverage.js";

/**
 * The content of an offer (OFF-04) as it is sealed at its arrival (BC-02):
 * premium, company, product, coverage, guarantee date and notes. The PDF is
 * sealed apart. Nothing here identifies the customer.
 */
export const OfferPayloadSchema = z.strictObject({
  /** Gross annual premium, taxes and SSN contribution included, in cents (rule 5). */
  annualGrossPremiumCents: z.number().int().positive().max(2_000_000_00),
  companyId: z.uuid(),
  productId: z.uuid(),
  coverage: OfferCoverageSchema,
  /** Calendar date, Rome time (GAR-02). */
  guaranteeUntil: z.string().regex(CALENDAR_DATE_PATTERN).refine(isCalendarDate, "not a date"),
  notes: z.string().max(300).nullable(),
});
export type OfferPayload = z.infer<typeof OfferPayloadSchema>;

export type NoteProblem = "TOO_LONG" | "PHONE" | "EMAIL" | "LINK";

const DIGIT_WORDS = [
  "zero",
  "uno",
  "due",
  "tre",
  "quattro",
  "cinque",
  "sei",
  "sette",
  "otto",
  "nove",
];

/**
 * VIS-11: notes for the customer have at most `maxChars` characters and carry
 * no phone number, email address or link, also when written with spaces or
 * with words in place of the symbols ("chiocciola", "punto", digits in words).
 */
export function noteProblems(notes: string, maxChars: number): NoteProblem[] {
  const problems: NoteProblem[] = [];
  if (notes.length > maxChars) problems.push("TOO_LONG");
  const lower = notes.toLowerCase();
  // Digits written as words become digits; spaces, dashes and brackets between
  // digits go away (dots stay: "10.000.000" is an amount, not a phone).
  const digitsOnly = lower
    .replace(new RegExp(`\\b(${DIGIT_WORDS.join("|")})\\b`, "g"), (w) =>
      String(DIGIT_WORDS.indexOf(w)),
    )
    .replace(/(\d)[\s\-/()]+(?=\d)/g, "$1");
  if (/\d{7,}/.test(digitsOnly.replace(/\+/g, ""))) problems.push("PHONE");
  const symbols = lower
    .replace(/\s*(\(at\)|\[at\]|\bchiocciola\b|\bat\b)\s*/g, "@")
    .replace(/\s*(\(dot\)|\[dot\]|\bpunto\b|\bdot\b)\s*/g, ".");
  if (/[a-z0-9._%+-]+\s*@\s*[a-z0-9-]+(\s*\.\s*[a-z]{2,})+/.test(symbols)) problems.push("EMAIL");
  if (
    /(https?:\/\/|www\.)/.test(symbols) ||
    /\b[a-z0-9-]{2,}\s*\.\s*(it|com|net|org|eu|info|biz|io)\b/.test(symbols)
  ) {
    problems.push("LINK");
  }
  return problems;
}
