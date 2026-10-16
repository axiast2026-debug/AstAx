import {
  addCalendarDays,
  compareCalendarDates,
  formatCalendarDate,
  parseCalendarDate,
} from "./calendar-date.js";

/**
 * Working calendar of the auctions (ASTA-02): time counts only inside the
 * working hours of `calendar.workingHours`, Rome time, outside the national
 * holidays. Every function is pure: the current instant and the calendar come
 * from the caller (CLAUDE.md rule 6). Instants are `Date`s (UTC); local times
 * are "HH:MM" on a calendar day in Rome, so the changes of daylight saving
 * time are handled where the day is turned into instants.
 */

export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/** "HH:MM" intervals for each day of the week, as in `calendar.workingHours`. */
export type WeeklyHours = Record<WeekdayKey, readonly (readonly [string, string])[]>;

export interface WorkingCalendar {
  hours: WeeklyHours;
  /** Calendar dates ("2026-12-25") on which no time counts. */
  holidays: ReadonlySet<string>;
}

export interface Interval {
  start: Date;
  end: Date;
}

const ROME = "Europe/Rome";
const MINUTE_MS = 60_000;
/** Far enough to cross any run of holidays; a calendar with no hours at all is refused. */
const MAX_SEARCH_DAYS = 400;

const romeParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: ROME,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

interface LocalParts {
  date: string;
  minutes: number;
  offsetMinutes: number;
}

/** Rome calendar date, minutes since local midnight and UTC offset of an instant. */
export function romeLocal(at: Date): LocalParts {
  const parts = romeParts.formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const [year, month, day, hour, minute, second] = [
    n("year"),
    n("month"),
    n("day"),
    n("hour"),
    n("minute"),
    n("second"),
  ];
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const wholeSecond = Math.floor(at.getTime() / 1000) * 1000;
  return {
    date: formatCalendarDate({ year, month, day }),
    minutes: hour * 60 + minute,
    offsetMinutes: Math.round((asUtc - wholeSecond) / MINUTE_MS),
  };
}

/**
 * The instant of a Rome local time on a calendar day. Working hours never fall
 * in the hour skipped or repeated by daylight saving time (02:00-03:00), so the
 * result is unique for every time used here.
 */
export function romeInstant(date: string, time: string): Date {
  const d = parseCalendarDate(date);
  if (!d) throw new Error(`Not a calendar date: ${date}`);
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  const naive = Date.UTC(d.year, d.month - 1, d.day, hour, minute);
  let guess = naive - romeLocal(new Date(naive)).offsetMinutes * MINUTE_MS;
  guess = naive - romeLocal(new Date(guess)).offsetMinutes * MINUTE_MS;
  return new Date(guess);
}

export function weekdayOf(date: string): WeekdayKey {
  const d = parseCalendarDate(date);
  if (!d) throw new Error(`Not a calendar date: ${date}`);
  const js = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
  return WEEKDAY_KEYS[(js + 6) % 7] as WeekdayKey;
}

/** Intervals of `hours` on one calendar day, as instants. */
export function dayIntervals(hours: WeeklyHours, date: string): Interval[] {
  return hours[weekdayOf(date)].map(([from, to]) => ({
    start: romeInstant(date, from),
    end: romeInstant(date, to),
  }));
}

/** Working intervals of one day: none on a holiday. */
export function workingIntervalsOn(calendar: WorkingCalendar, date: string): Interval[] {
  return calendar.holidays.has(date) ? [] : dayIntervals(calendar.hours, date);
}

/** Working intervals from `from` on, cut at `from`, day after day. */
function* workingIntervalsFrom(calendar: WorkingCalendar, from: Date): Generator<Interval> {
  let date = romeLocal(from).date;
  for (let i = 0; i < MAX_SEARCH_DAYS; i += 1) {
    for (const interval of workingIntervalsOn(calendar, date)) {
      if (interval.end <= from) continue;
      yield { start: interval.start < from ? from : interval.start, end: interval.end };
    }
    date = addCalendarDays(date, 1);
  }
  throw new Error("The working calendar has no working time");
}

/** Working intervals before `until`, cut at `until`, going back day after day. */
function* workingIntervalsBefore(calendar: WorkingCalendar, until: Date): Generator<Interval> {
  let date = romeLocal(until).date;
  for (let i = 0; i < MAX_SEARCH_DAYS; i += 1) {
    for (const interval of workingIntervalsOn(calendar, date).reverse()) {
      if (interval.start >= until) continue;
      yield { start: interval.start, end: interval.end > until ? until : interval.end };
    }
    date = addCalendarDays(date, -1);
  }
  throw new Error("The working calendar has no working time");
}

/**
 * The instant at which `minutes` of working time have passed from `start`
 * (ASTA-02: Monday 18:30 plus 2 working hours is Tuesday 10:30). Starting
 * outside the working hours, time begins to count at the next opening.
 */
export function addWorkingMinutes(calendar: WorkingCalendar, start: Date, minutes: number): Date {
  if (minutes < 0) throw new Error("minutes must not be negative");
  let left = minutes * MINUTE_MS;
  for (const interval of workingIntervalsFrom(calendar, start)) {
    const length = interval.end.getTime() - interval.start.getTime();
    if (left <= length) return new Date(interval.start.getTime() + left);
    left -= length;
  }
  throw new Error("unreachable");
}

/** The instant `minutes` of working time before `end` (ASTA-07: the reminder before closing). */
export function subtractWorkingMinutes(
  calendar: WorkingCalendar,
  end: Date,
  minutes: number,
): Date {
  if (minutes < 0) throw new Error("minutes must not be negative");
  let left = minutes * MINUTE_MS;
  for (const interval of workingIntervalsBefore(calendar, end)) {
    const length = interval.end.getTime() - interval.start.getTime();
    if (left <= length) return new Date(interval.end.getTime() - left);
    left -= length;
  }
  throw new Error("unreachable");
}

/** Working minutes between two instants (zero when `to` is not after `from`). */
export function workingMinutesBetween(calendar: WorkingCalendar, from: Date, to: Date): number {
  if (to <= from) return 0;
  let total = 0;
  for (const interval of workingIntervalsFrom(calendar, from)) {
    if (interval.start >= to) break;
    const end = interval.end > to ? to : interval.end;
    total += end.getTime() - interval.start.getTime();
  }
  return Math.round(total / MINUTE_MS);
}

/**
 * Working intervals between `from` and `to` that also fall in `hours`, for
 * example an agency's reception hours (ASTA-05).
 */
export function workingOverlapMinutes(
  calendar: WorkingCalendar,
  from: Date,
  to: Date,
  hours: WeeklyHours,
): number {
  if (to <= from) return 0;
  let total = 0;
  let date = romeLocal(from).date;
  const last = romeLocal(to).date;
  while (compareCalendarDates(date, last) <= 0) {
    const others = dayIntervals(hours, date);
    for (const w of workingIntervalsOn(calendar, date)) {
      for (const o of others) {
        const start = Math.max(w.start.getTime(), o.start.getTime(), from.getTime());
        const end = Math.min(w.end.getTime(), o.end.getTime(), to.getTime());
        if (end > start) total += end - start;
      }
    }
    date = addCalendarDays(date, 1);
  }
  return Math.round(total / MINUTE_MS);
}

/** The last instant of a calendar day in Rome: 23:59:59.999 (GAR-02). */
export function endOfRomeDay(date: string): Date {
  return new Date(romeInstant(addCalendarDays(date, 1), "00:00").getTime() - 1);
}
