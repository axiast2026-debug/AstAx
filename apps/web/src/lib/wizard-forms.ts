import { CHOOSABLE_COVERAGES } from "@astax/shared/domain";
/**
 * From the wizard's HTML forms to the draft sections of `quoteData`
 * (packages/shared, QuoteDraftSchema). Pure functions: the API validates the
 * result again, these only read and convert the fields.
 */
export interface FormReader {
  get(name: string): FormDataEntryValue | null;
  getAll(name: string): FormDataEntryValue[];
}

export function text(form: FormReader, name: string): string | undefined {
  const value = form.get(name);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function integer(form: FormReader, name: string): number | undefined {
  const value = text(form, name);
  if (value === undefined) return undefined;
  const digits = value.replace(/\./g, "");
  return /^-?\d+$/.test(digits) ? Number(digits) : Number.NaN;
}

export function checked(form: FormReader, name: string): boolean {
  return form.get(name) === "on" || form.get(name) === "true";
}

/** "1.234,56", "450", "450,5" → integer cents (CLAUDE.md rule 5); NaN when not an amount. */
export function eurosToCents(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const normalized = value.replace(/\s|€/g, "").replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  const [units = "0", decimals = ""] = normalized.split(".");
  return Number(units) * 100 + Number(decimals.padEnd(2, "0"));
}

export function centsToEuros(cents: number | undefined): string {
  if (cents === undefined) return "";
  const units = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(units) : `${units},${String(rest).padStart(2, "0")}`;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

const START_MODES = ["DATE", "ON_ISSUANCE", "MIDNIGHT_AFTER_DEADLINE"] as const;

/**
 * The packages of a request (Dan, 2026-10-28): «RCA obbligo di legge» (BASE),
 * «Consigliate» (RECOMMENDED) or «Su misura» (CUSTOM).
 */
export const REQUEST_PACKAGES: readonly string[] = ["BASE", "RECOMMENDED", "CUSTOM"];

export function requestTermsFromForm(
  form: FormReader,
  defaults: { auctionDurationHours: number; minValidityDays: number; today: string },
) {
  const packageCode = text(form, "request.packageCode");
  // Question 1: with the start set by the payment the date is the day of the request.
  const chosen = text(form, "request.startMode");
  const startMode = START_MODES.find((m) => m === chosen) ?? "DATE";
  return compact({
    packageCode,
    // Each package option carries its own version; the chosen one is kept.
    packageVersion:
      integer(form, `request.packageVersion.${packageCode ?? ""}`) ??
      integer(form, "request.packageVersion"),
    startDate: startMode === "DATE" ? text(form, "request.startDate") : defaults.today,
    startMode,
    coverages:
      packageCode === "CUSTOM"
        ? CHOOSABLE_COVERAGES.filter((item) => checked(form, `request.coverages.${item}`))
        : undefined,
    blackBox: checked(form, "request.blackBox"),
    paymentFrequency: "ANNUAL",
    auctionDurationHours:
      integer(form, "request.auctionDurationHours") ?? defaults.auctionDurationHours,
    minValidityDays: integer(form, "request.minValidityDays") ?? defaults.minValidityDays,
    currentPremiumCents: eurosToCents(text(form, "request.currentPremium")),
  });
}
