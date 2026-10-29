/**
 * The only formatting functions of the interfaces (docs/architettura-codice.md,
 * «Frontend»): in Italian, the only language of AstAx (ADR 0017), dates in the
 * Europe/Rome time zone, euros with two decimals from integer cents (FEE-07).
 */
export const DISPLAY_TIME_ZONE = "Europe/Rome";

const LOCALE_TAG = "it-IT";

/** Day and hour in Rome: «16/11/2026 10:00». */
export function formatDateTime(value: Date | string): string {
  return `${formatDate(value)} ${formatTime(value)}`;
}

/** Every date as GG/MM/AAAA (Dan, 2026-10-29): «02/12/2026». */
export function formatDate(value: Date | string): string {
  return new Intl.DateTimeFormat(LOCALE_TAG, {
    timeZone: DISPLAY_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

/** The day with its name, for deadlines: «domenica 06/12/2026». */
export function formatWeekdayDate(value: Date | string): string {
  const weekday = new Intl.DateTimeFormat(LOCALE_TAG, {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: "long",
  }).format(new Date(value));
  return `${weekday} ${formatDate(value)}`;
}

/** The hour and minute in Rome: «10:00». */
export function formatTime(value: Date | string): string {
  return new Intl.DateTimeFormat(LOCALE_TAG, {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/** To the second, for a receipt (PRES-01): «10:20:14». */
export function formatTimeSeconds(value: Date | string): string {
  return new Intl.DateTimeFormat(LOCALE_TAG, {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function formatEuroCents(cents: number): string {
  if (!Number.isInteger(cents)) throw new TypeError("Amounts are integer cents (FEE-07)");
  return new Intl.NumberFormat(LOCALE_TAG, { style: "currency", currency: "EUR" }).format(
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
 * Dates in the notifications (docs/notifiche.md), in Rome; GG/MM/AAAA like
 * every date (Dan, 2026-10-29): «mercoledì 14/10/2026 alle 10:30».
 */
export function formatNotificationDateTime(value: Date | string): string {
  return `${formatWeekdayDate(value)} alle ${formatTime(value)}`;
}
