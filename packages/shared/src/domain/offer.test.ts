import { describe, expect, it } from "vitest";
import { noteProblems, OfferPayloadSchema } from "./offer.js";

describe("offer content (OFF-04) and notes for the customer (VIS-11)", () => {
  it("VIS-11 a plain note passes", () => {
    expect(noteProblems("Sconto fedeltà già incluso. Rata mensile possibile.", 300)).toEqual([]);
    expect(noteProblems("Massimale 10 milioni, franchigia vetri 150 euro.", 300)).toEqual([]);
    expect(noteProblems("Massimale unico 10.000.000 euro", 300)).toEqual([]);
  });

  it("VIS-11 at most 300 characters", () => {
    expect(noteProblems("a".repeat(301), 300)).toEqual(["TOO_LONG"]);
  });

  it("VIS-11 refuses phone numbers, also with spaces or in words", () => {
    expect(noteProblems("Chiamami al 333 123 4567", 300)).toContain("PHONE");
    expect(noteProblems("tel. +39 02-1234-5678", 300)).toContain("PHONE");
    expect(noteProblems("tre tre tre uno due tre quattro cinque sei sette", 300)).toContain(
      "PHONE",
    );
  });

  it("VIS-11 refuses email addresses, also written with words", () => {
    expect(noteProblems("scrivi a mario.rossi@agenzia.it", 300)).toContain("EMAIL");
    expect(noteProblems("mario chiocciola agenzia punto it", 300)).toContain("EMAIL");
    expect(noteProblems("mario (at) agenzia (dot) com", 300)).toContain("EMAIL");
  });

  it("VIS-11 refuses links", () => {
    expect(noteProblems("vedi https://agenzia.example", 300)).toContain("LINK");
    expect(noteProblems("www.agenziauno.it", 300)).toContain("LINK");
    expect(noteProblems("agenziauno punto it", 300)).toContain("LINK");
  });

  it("OFF-04 the content is strict: premium in whole cents, a calendar date, coverage per item", () => {
    const valid = {
      annualGrossPremiumCents: 50500,
      companyId: "01a14406-a0d2-7195-bde3-511b8f9ed26f",
      productId: "01a14406-a0d2-7195-bde3-511b8f9ed270",
      coverage: {
        rca: { limitType: "SINGLE_LIMIT", singleLimitEur: 10_000_000 },
        recourseWaiver: { included: false },
        roadsideAssistance: { included: true },
        legalProtection: { included: true },
        driverAccident: { included: false },
        theftFire: { included: false },
        naturalEvents: { included: false },
        vandalism: { included: false },
        collisionKasko: { included: false },
        fullKasko: { included: false },
        wildlifeCollision: { included: false },
        glass: { included: false },
      },
      guaranteeUntil: "2026-12-03",
      notes: null,
    };
    expect(OfferPayloadSchema.safeParse(valid).success).toBe(true);
    expect(OfferPayloadSchema.safeParse({ ...valid, annualGrossPremiumCents: 505.5 }).success).toBe(
      false,
    );
    expect(OfferPayloadSchema.safeParse({ ...valid, guaranteeUntil: "2026-02-30" }).success).toBe(
      false,
    );
    expect(OfferPayloadSchema.safeParse({ ...valid, customerEmail: "x" }).success).toBe(false);
  });
});
