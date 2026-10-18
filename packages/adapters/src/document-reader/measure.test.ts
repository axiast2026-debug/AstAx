import { describe, expect, it } from "vitest";
import { measureReading, readingReport, readingTotals, sameValue } from "./measure.js";

// Phase 8: the measure of the AI reading on the anonymous documents.
const result = (fields: Record<string, { value: string | number | null; confidence: number }>) => ({
  kind: "DRIVING_LICENCE" as const,
  fields,
  warnings: [],
  model: "m",
  promptVersion: "p",
});

describe("phase 8 measure of the AI reading", () => {
  it("counts right and wrong above the threshold, and what goes to the back office", () => {
    const measures = measureReading(
      [
        {
          kind: "DRIVING_LICENCE",
          name: "patente-01",
          expected: { surname: "Neri", number: "U1A2B3C4D5" },
          result: result({
            surname: { value: " neri ", confidence: 0.97 },
            number: { value: "U1A2B3C4D6", confidence: 0.95 },
          }),
        },
        {
          kind: "DRIVING_LICENCE",
          name: "patente-02",
          expected: { surname: "Riva", number: "X9" },
          result: result({
            surname: { value: "Riva", confidence: 0.99 },
            number: { value: "X9", confidence: 0.5 },
          }),
        },
      ],
      0.9,
    );
    const number = measures.find((m) => m.field === "number");
    expect(number).toMatchObject({
      aboveThreshold: 1,
      rightAboveThreshold: 0,
      toReview: 1,
      wrongAboveThreshold: ["patente-01"],
    });
    expect(readingTotals(measures)).toEqual({
      fields: 4,
      aboveThreshold: 3,
      rightShareAboveThreshold: 2 / 3,
      toReviewShare: 0.25,
    });
    const report = readingReport(measures, {
      date: "2026-10-18",
      model: "m",
      promptVersion: "p",
      threshold: 0.9,
      cases: 2,
    });
    expect(report).toContain("**Corretti sopra soglia: 66,7%**");
    // No value read from a document in the report (rule 8): only the names of the cases.
    expect(report).not.toMatch(/Neri|U1A2B3C4D6/);
  });

  it("compares strings without case and spaces, numbers exactly", () => {
    expect(sameValue("Compagnia  Alfa", "compagnia alfa")).toBe(true);
    expect(sameValue(45000, 45000)).toBe(true);
    expect(sameValue(45000, 45001)).toBe(false);
    expect(sameValue(null, null)).toBe(true);
  });
});
