import { describe, expect, it } from "vitest";
import {
  addWorkingMinutes,
  endOfRomeDay,
  romeInstant,
  subtractWorkingMinutes,
  workingClock,
  workingMinutesBetween,
  workingMsBetween,
  workingOverlapMinutes,
  type WeeklyHours,
  type WorkingCalendar,
} from "./working-calendar.js";

// ASTA-02: Monday to Friday 9-19, Saturday 9-13, Rome time, no national holidays.
const HOURS: WeeklyHours = {
  mon: [["09:00", "19:00"]],
  tue: [["09:00", "19:00"]],
  wed: [["09:00", "19:00"]],
  thu: [["09:00", "19:00"]],
  fri: [["09:00", "19:00"]],
  sat: [["09:00", "13:00"]],
  sun: [],
};
const calendar: WorkingCalendar = {
  hours: HOURS,
  holidays: new Set(["2026-12-08", "2026-12-25", "2026-12-26", "2027-01-01", "2027-01-06"]),
};
const rome = (date: string, time: string) => romeInstant(date, time);
const H = 60;

describe("working calendar (ASTA-02)", () => {
  it("ASTA-02 the example of the rule: approved on Monday at 18:30, 2 hours, closes Tuesday at 10:30", () => {
    const close = addWorkingMinutes(calendar, rome("2026-11-16", "18:30"), 2 * H);
    expect(close).toEqual(rome("2026-11-17", "10:30"));
    expect(workingMinutesBetween(calendar, rome("2026-11-16", "18:30"), close)).toBe(120);
  });

  it("ASTA-02 Saturday counts until 13:00, then Monday", () => {
    expect(addWorkingMinutes(calendar, rome("2026-11-21", "12:00"), 2 * H)).toEqual(
      rome("2026-11-23", "10:00"),
    );
  });

  it("ASTA-02 a national holiday does not count (8 December, a Tuesday)", () => {
    expect(addWorkingMinutes(calendar, rome("2026-12-07", "18:00"), 2 * H)).toEqual(
      rome("2026-12-09", "10:00"),
    );
  });

  it("ASTA-02 end of daylight saving time, Sunday 25/10/2026: Rome goes from UTC+2 to UTC+1", () => {
    const start = rome("2026-10-24", "12:00");
    expect(start.toISOString()).toBe("2026-10-24T10:00:00.000Z");
    const close = addWorkingMinutes(calendar, start, 2 * H);
    expect(close.toISOString()).toBe("2026-10-26T09:00:00.000Z"); // Monday 10:00 in Rome
    // 24 working hours from Friday 9:00: Friday 10, Saturday 4, Monday 10.
    expect(addWorkingMinutes(calendar, rome("2026-10-23", "09:00"), 24 * H).toISOString()).toBe(
      "2026-10-26T18:00:00.000Z",
    );
  });

  it("ASTA-02 start of daylight saving time, Sunday 28/03/2027: Rome goes from UTC+1 to UTC+2", () => {
    const start = rome("2027-03-27", "12:00");
    expect(start.toISOString()).toBe("2027-03-27T11:00:00.000Z");
    expect(addWorkingMinutes(calendar, start, 2 * H).toISOString()).toBe(
      "2027-03-29T08:00:00.000Z", // Monday 10:00 in Rome
    );
  });

  it("ASTA-02 an approval at night starts counting at 9:00 the next working day", () => {
    expect(addWorkingMinutes(calendar, rome("2026-11-17", "23:15"), 1 * H)).toEqual(
      rome("2026-11-18", "10:00"),
    );
    expect(addWorkingMinutes(calendar, rome("2026-11-18", "02:00"), 5 * H)).toEqual(
      rome("2026-11-18", "14:00"),
    );
  });

  it("ASTA-02 an approval on Sunday starts counting on Monday", () => {
    expect(addWorkingMinutes(calendar, rome("2026-11-22", "15:00"), 2 * H)).toEqual(
      rome("2026-11-23", "11:00"),
    );
  });

  it("ASTA-02 across Christmas and New Year", () => {
    // Thursday 24/12 18:00, 24 hours: 24/12 1h, 25-26-27 nothing, 28-29 20h, 30/12 3h.
    expect(addWorkingMinutes(calendar, rome("2026-12-24", "18:00"), 24 * H)).toEqual(
      rome("2026-12-30", "12:00"),
    );
  });

  it("S04: approved Thursday 19/11/2026 at 17:30 for 1 hour closes at 18:30; the reopening of 2 hours closes Friday at 10:30", () => {
    const close = addWorkingMinutes(calendar, rome("2026-11-19", "17:30"), 1 * H);
    expect(close).toEqual(rome("2026-11-19", "18:30"));
    expect(addWorkingMinutes(calendar, rome("2026-11-19", "17:30"), 30)).toEqual(
      rome("2026-11-19", "18:00"),
    );
    expect(addWorkingMinutes(calendar, close, 2 * H)).toEqual(rome("2026-11-20", "10:30"));
  });

  it("ASTA-07 going back from the closing counts working time too", () => {
    expect(subtractWorkingMinutes(calendar, rome("2026-11-17", "10:30"), 60)).toEqual(
      rome("2026-11-17", "09:30"),
    );
    expect(subtractWorkingMinutes(calendar, rome("2026-11-17", "09:30"), 60)).toEqual(
      rome("2026-11-16", "18:30"),
    );
    expect(subtractWorkingMinutes(calendar, rome("2026-11-23", "09:30"), 60)).toEqual(
      rome("2026-11-21", "12:30"),
    );
  });

  it("ASTA-05 overlap of an auction with an agency's reception hours", () => {
    const from = rome("2026-11-16", "18:30");
    const to = rome("2026-11-17", "10:30");
    const afternoons: WeeklyHours = {
      ...HOURS,
      mon: [["14:00", "18:00"]],
      tue: [["14:00", "18:00"]],
    };
    const mornings: WeeklyHours = {
      ...HOURS,
      mon: [["09:00", "12:00"]],
      tue: [["09:00", "12:00"]],
    };
    expect(workingOverlapMinutes(calendar, from, to, afternoons)).toBe(0);
    expect(workingOverlapMinutes(calendar, from, to, mornings)).toBe(90);
    expect(workingOverlapMinutes(calendar, from, to, HOURS)).toBe(120);
  });

  it("GAR-02 a guarantee ends at 23:59:59 of its day, Rome time, in winter and in summer", () => {
    expect(endOfRomeDay("2026-12-03").toISOString()).toBe("2026-12-03T22:59:59.999Z");
    expect(endOfRomeDay("2026-07-03").toISOString()).toBe("2026-07-03T21:59:59.999Z");
    expect(endOfRomeDay("2026-10-25").toISOString()).toBe("2026-10-25T22:59:59.999Z");
  });

  it("refuses a calendar with no working time instead of looping", () => {
    const closed: WorkingCalendar = {
      hours: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
      holidays: new Set(),
    };
    expect(() => addWorkingMinutes(closed, rome("2026-11-16", "09:00"), 60)).toThrow(
      /no working time/,
    );
  });
});

describe("the auction's clock for the requester (ASTA-02, Momento 2)", () => {
  const close = rome("2026-11-17", "10:30");

  it("ASTA-02 inside the working hours it runs until the evening closing", () => {
    expect(workingClock(calendar, rome("2026-11-16", "18:30"), close)).toEqual({
      msLeft: 120 * 60_000,
      pausedUntil: null,
      runsUntil: rome("2026-11-16", "19:00"),
    });
  });

  it("ASTA-02 in the evening it stands still until 9:00 of the next working day", () => {
    expect(workingClock(calendar, rome("2026-11-16", "21:15"), close)).toEqual({
      msLeft: 90 * 60_000,
      pausedUntil: rome("2026-11-17", "09:00"),
      runsUntil: null,
    });
  });

  it("ASTA-02 the last stretch runs until the closing itself", () => {
    expect(workingClock(calendar, rome("2026-11-17", "10:00"), close)).toEqual({
      msLeft: 30 * 60_000,
      pausedUntil: null,
      runsUntil: close,
    });
  });

  it("ASTA-02 after Saturday 13:00 and over a holiday it resumes on the next working day", () => {
    // Saturday 5 December after 13:00: Sunday, then Monday 7; Tuesday 8 is a holiday.
    const end = rome("2026-12-09", "10:00");
    const clock = workingClock(calendar, rome("2026-12-05", "15:00"), end);
    expect(clock.pausedUntil).toEqual(rome("2026-12-07", "09:00"));
    expect(clock.msLeft).toBe((10 + 1) * H * 60_000);
  });

  it("ASTA-02 nothing left at or after the closing", () => {
    expect(workingClock(calendar, close, close)).toEqual({
      msLeft: 0,
      pausedUntil: null,
      runsUntil: null,
    });
    expect(workingMsBetween(calendar, rome("2026-11-16", "18:30"), close)).toBe(120 * 60_000);
  });
});
