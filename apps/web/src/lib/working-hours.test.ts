import { describe, expect, it } from "vitest";
import { weekdayName, workingHoursText } from "./working-hours";

const week = {
  mon: [["09:00", "19:00"]],
  tue: [["09:00", "19:00"]],
  wed: [["09:00", "19:00"]],
  thu: [["09:00", "19:00"]],
  fri: [["09:00", "19:00"]],
  sat: [["09:00", "13:00"]],
  sun: [],
} as Parameters<typeof workingHoursText>[0];

describe("the working hours in words (public pages, ASTA-02)", () => {
  it("groups the days with the same hours and leaves out the closed ones", () => {
    expect(workingHoursText(week)).toBe("lunedì–venerdì 9–19, sabato 9–13");
  });

  it("keeps the minutes and a lunch break", () => {
    expect(
      workingHoursText({
        ...week,
        wed: [
          ["08:30", "12:30"],
          ["14:00", "18:00"],
        ],
        sat: [],
      }),
    ).toBe("lunedì–martedì 9–19, mercoledì 8:30–12:30, 14–18, giovedì–venerdì 9–19");
  });

  it("names the day of a weekly parameter", () => {
    expect(weekdayName("MONDAY")).toBe("lunedì");
  });
});
