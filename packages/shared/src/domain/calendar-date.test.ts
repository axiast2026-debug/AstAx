import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  compareCalendarDates,
  parseItalianDate,
  completedYears,
  isCalendarDate,
} from "./calendar-date.js";

describe("calendar dates", () => {
  it("accepts real dates only", () => {
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("2026-1-01")).toBe(false);
  });

  it("counts completed years, the day before and on the birthday", () => {
    expect(completedYears("2000-10-16", "2026-10-15")).toBe(25);
    expect(completedYears("2000-10-15", "2026-10-15")).toBe(26);
    expect(completedYears("2004-02-29", "2026-02-28")).toBe(21);
    expect(completedYears("2004-02-29", "2026-03-01")).toBe(22);
  });

  it("compares and adds days across months and years", () => {
    expect(compareCalendarDates("2026-01-01", "2025-12-31")).toBe(1);
    expect(addCalendarDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addCalendarDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("parseItalianDate (Dan, 2026-10-28: a birth date can be pasted)", () => {
  it("reads the ways a date is written or pasted", () => {
    for (const input of [
      "12/03/1985",
      "12-03-1985",
      "12.03.1985",
      " 12 03 1985 ",
      "12031985",
      "1985-03-12",
      "12/3/1985",
    ]) {
      expect(parseItalianDate(input), input).toBe("1985-03-12");
    }
  });

  it("refuses days that do not exist and two-digit years", () => {
    expect(parseItalianDate("31/02/1990")).toBeNull();
    expect(parseItalianDate("29/02/2001")).toBeNull();
    expect(parseItalianDate("29/02/2000")).toBe("2000-02-29");
    expect(parseItalianDate("12/03/85")).toBeNull();
    expect(parseItalianDate("ieri")).toBeNull();
  });
});
