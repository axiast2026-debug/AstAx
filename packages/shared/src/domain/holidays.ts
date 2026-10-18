import { formatCalendarDate } from "./calendar-date.js";

/**
 * Italian national holidays (ASTA-02, seed/festivita.json): fixed dates plus
 * Easter Monday, computed from Easter. The administrator confirms the proposal
 * of the next year before it is used (spec 07, phase 7).
 */
export interface FixedHoliday {
  /** "MM-DD". */
  monthDay: string;
  name: string;
}

export interface ProposedHoliday {
  date: string;
  name: string;
}

export const EASTER_MONDAY_NAME = "Lunedì dell'Angelo";

/** Easter Sunday of the Gregorian calendar (anonymous Gregorian algorithm). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return formatCalendarDate({ year, month, day });
}

export function easterMonday(year: number): string {
  const sunday = new Date(`${easterSunday(year)}T00:00:00.000Z`);
  sunday.setUTCDate(sunday.getUTCDate() + 1);
  return sunday.toISOString().slice(0, 10);
}

/** The holidays of a year, in date order, to be confirmed by the administrator. */
export function proposedHolidays(year: number, fixed: readonly FixedHoliday[]): ProposedHoliday[] {
  return [
    ...fixed.map((h) => ({ date: `${year}-${h.monthDay}`, name: h.name })),
    { date: easterMonday(year), name: EASTER_MONDAY_NAME },
  ].sort((x, y) => x.date.localeCompare(y.date));
}
