import { describe, expect, it } from "vitest";
import { easterMonday, easterSunday, proposedHolidays } from "./holidays.js";

describe("national holidays", () => {
  it("ASTA-02 Easter Monday matches the seeded years and the next ones", () => {
    expect(easterMonday(2026)).toBe("2026-04-06");
    expect(easterMonday(2027)).toBe("2027-03-29");
    expect(easterMonday(2028)).toBe("2028-04-17");
    expect(easterMonday(2029)).toBe("2029-04-02");
    expect(easterMonday(2030)).toBe("2030-04-22");
    // Late and early extremes of the Gregorian calendar.
    expect(easterSunday(2038)).toBe("2038-04-25");
    expect(easterSunday(2285)).toBe("2285-03-22");
  });

  it("ASTA-02 the proposal of a year has the fixed dates and Easter Monday, in order", () => {
    const year = proposedHolidays(2029, [
      { monthDay: "12-25", name: "Natale" },
      { monthDay: "01-01", name: "Capodanno" },
    ]);
    expect(year.map((h) => h.date)).toEqual(["2029-01-01", "2029-04-02", "2029-12-25"]);
  });
});
