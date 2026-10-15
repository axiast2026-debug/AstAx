import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatEuroCents } from "./format.js";

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
