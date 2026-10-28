/**
 * Calendar dates without time ("2026-10-15"), as used for birth dates,
 * licence dates and the policy start date. They are compared as dates, never
 * converted to instants, so no time zone is involved (CLAUDE.md rule 6 concerns
 * instants; the current day always comes from the caller, who reads `Clock`).
 */
export const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface CalendarDateParts {
  year: number;
  month: number;
  day: number;
}

export function parseCalendarDate(value: string): CalendarDateParts | null {
  if (!CALENDAR_DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isCalendarDate(value: string): boolean {
  return parseCalendarDate(value) !== null;
}

export function formatCalendarDate(parts: CalendarDateParts): string {
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  return `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}`;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function requireDate(value: string): CalendarDateParts {
  const parts = parseCalendarDate(value);
  if (!parts) throw new Error(`Not a calendar date: ${value}`);
  return parts;
}

/** Negative when `a` comes before `b`, zero when equal. */
export function compareCalendarDates(a: string, b: string): number {
  requireDate(a);
  requireDate(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Whole years completed from `from` to `on`: the age of someone born on `from`
 * on the day `on`. A person born on 29 February turns one year older on
 * 1 March in non-leap years.
 */
export function completedYears(from: string, on: string): number {
  const start = requireDate(from);
  const end = requireDate(on);
  let years = end.year - start.year;
  if (end.month < start.month || (end.month === start.month && end.day < start.day)) years -= 1;
  return years;
}

/** The calendar date `days` days after `date` (negative goes back). */
export function addCalendarDays(date: string, days: number): string {
  const { year, month, day } = requireDate(date);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return formatCalendarDate({
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  });
}

/**
 * A date as an Italian writes or pastes it (Dan, 2026-10-28): «12/03/1985»,
 * «12-03-1985», «12.03.1985», «12 03 1985», «12031985», «12/3/85» is not
 * accepted (a two-digit year is ambiguous), and «1985-03-12» as the form
 * itself. Returns the calendar date «1985-03-12», or null when it is not a
 * real day.
 */
export function parseItalianDate(input: string): string | null {
  const value = input.trim();
  if (CALENDAR_DATE_PATTERN.test(value)) return isCalendarDate(value) ? value : null;
  const match =
    /^(\d{1,2})[/.\-\s]+(\d{1,2})[/.\-\s]+(\d{4})$/.exec(value) ??
    /^(\d{2})(\d{2})(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day = "", month = "", year = ""] = match;
  const parts = { year: Number(year), month: Number(month), day: Number(day) };
  const date = formatCalendarDate(parts);
  return isCalendarDate(date) ? date : null;
}
