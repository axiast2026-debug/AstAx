import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  compareCalendarDates,
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
