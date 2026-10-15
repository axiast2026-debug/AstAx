import { describe, expect, it } from "vitest";
import {
  calendarDateToDbDate,
  dbDateToCalendarDate,
  formatDate,
  formatDateTime,
  formatEuroCents,
  romeCalendarDate,
} from "./format.js";

describe("display formatting", () => {
  it("shows dates in the Rome time zone, summer and winter time included", () => {
    expect(formatDateTime("2026-11-16T09:00:00.000Z")).toBe("16/11/26, 10:00");
    expect(formatDateTime("2026-07-01T09:00:00.000Z")).toBe("01/07/26, 11:00");
    expect(formatDate("2026-12-01T23:30:00.000Z")).toBe("2 dicembre 2026");
  });

  it("FEE-07 shows euros from integer cents and refuses decimals", () => {
    expect(formatEuroCents(52000).replace(/\s/g, " ")).toBe("520,00 €");
    expect(formatEuroCents(3500).replace(/\s/g, " ")).toBe("35,00 €");
    expect(() => formatEuroCents(15.5)).toThrow();
  });
});

describe("Rome calendar day", () => {
  it("uses the Rome day, not the UTC day, around midnight", () => {
    expect(romeCalendarDate(new Date("2026-10-15T21:59:00.000Z"))).toBe("2026-10-15");
    expect(romeCalendarDate(new Date("2026-10-15T22:01:00.000Z"))).toBe("2026-10-16");
    expect(romeCalendarDate(new Date("2026-12-31T23:30:00.000Z"))).toBe("2027-01-01");
  });

  it("stores calendar days as midnight UTC", () => {
    expect(dbDateToCalendarDate(calendarDateToDbDate("2026-11-30"))).toBe("2026-11-30");
  });
});
