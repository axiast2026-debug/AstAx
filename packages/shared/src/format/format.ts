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

/** The day with its name, for deadlines: «domenica 6 dicembre». */
export function formatWeekdayDate(value: Date | string, locale: DisplayLocale = "it"): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(value));
}

/** The hour and minute in Rome: «10:00». */
export function formatTime(value: Date | string, locale: DisplayLocale = "it"): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatEuroCents(cents: number, locale: DisplayLocale = "it"): string {
  if (!Number.isInteger(cents)) throw new TypeError("Amounts are integer cents (FEE-07)");
  return new Intl.NumberFormat(LOCALE_TAG[locale], { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
}

/**
 * The calendar day ("2026-10-15") of an instant in Rome: "today" for the
 * domain rules on dates (policy start, ages), from an instant read by `Clock`.
 */
export function romeCalendarDate(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Midnight UTC of a calendar day: how a `@db.Date` column stores it. */
export function calendarDateToDbDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function dbDateToCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Dates in the notifications (docs/notifiche.md): «martedì 14 ottobre alle
 * 10:30», «e martë, 14 tetor, ora 10:30», in Rome.
 */
export function formatNotificationDateTime(
  value: Date | string,
  locale: DisplayLocale = "it",
): string {
  const day = new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(value));
  const time = new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
  return locale === "sq" ? `${day}, ora ${time}` : `${day} alle ${time}`;
}
