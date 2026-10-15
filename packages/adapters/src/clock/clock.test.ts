import { describe, expect, it } from "vitest";
import { ManualClock } from "./manual-clock.js";
import { SystemClock } from "./system-clock.js";

describe("Clock", () => {
  it("ManualClock returns the time it was set to and moves only when told", () => {
    const clock = new ManualClock("2026-11-16T09:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-11-16T09:00:00.000Z");
    clock.advanceMinutes(90);
    expect(clock.now().toISOString()).toBe("2026-11-16T10:30:00.000Z");
    clock.set("2026-11-17T08:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-11-17T08:00:00.000Z");
  });

  it("ManualClock hands out copies, so callers cannot move it", () => {
    const clock = new ManualClock("2026-11-16T09:00:00.000Z");
    clock.now().setUTCFullYear(2000);
    expect(clock.now().toISOString()).toBe("2026-11-16T09:00:00.000Z");
  });

  it("ManualClock rejects invalid times", () => {
    expect(() => new ManualClock("not a date")).toThrow();
  });

  it("SystemClock returns a valid date", () => {
    expect(Number.isNaN(new SystemClock().now().getTime())).toBe(false);
  });
});
