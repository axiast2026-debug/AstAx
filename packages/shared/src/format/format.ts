/**
 * The only formatting functions of the interfaces (docs/architettura-codice.md,
 * «Frontend»): dates in the Europe/Rome time zone, euros with two decimals
 * from integer cents (FEE-07).
 */
export const DISPLAY_TIME_ZONE = "Europe/Rome";

export type DisplayLocale = "it" | "sq";

const LOCALE_TAG: Record<DisplayLocale, string> = { it: "it-IT", sq: "sq-AL" };

export function formatDateTime(value: Date | string, locale: DisplayLocale = "it"): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    timeZone: DISPLAY_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatDate(value: Date | string, locale: DisplayLocale = "it"): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    timeZone: DISPLAY_TIME_ZONE,
    dateStyle: "long",
  }).format(new Date(value));
}

export function formatEuroCents(cents: number, locale: DisplayLocale = "it"): string {
  if (!Number.isInteger(cents)) throw new TypeError("Amounts are integer cents (FEE-07)");
  return new Intl.NumberFormat(LOCALE_TAG[locale], { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
}
