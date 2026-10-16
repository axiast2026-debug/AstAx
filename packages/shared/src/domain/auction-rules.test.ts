import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  auctionTimes,
  backOfficeMayInvite,
  bestOfferPerCompany,
  compareOffers,
  guaranteeDateAccepted,
  isGuaranteed,
  minGuaranteeDate,
  rankOffers,
  topUpSize,
  type AuctionSettings,
  type RankedOffer,
} from "./auction-rules.js";
import {
  coverageShortfalls,
  OfferCoverageSchema,
  PackageRequirementsSchema,
  type OfferCoverage,
} from "./coverage.js";
import {
  OFFER_TRANSITIONS,
  REQUEST_TRANSITIONS,
  transitionOffer,
  transitionRequest,
} from "./status-transitions.js";
import { romeInstant, type WorkingCalendar } from "./working-calendar.js";

const calendar: WorkingCalendar = {
  hours: {
    mon: [["09:00", "19:00"]],
    tue: [["09:00", "19:00"]],
    wed: [["09:00", "19:00"]],
    thu: [["09:00", "19:00"]],
    fri: [["09:00", "19:00"]],
    sat: [["09:00", "13:00"]],
    sun: [],
  },
  holidays: new Set(["2026-12-08"]),
};
// The values of seed/parametri.json.
const settings: AuctionSettings = {
  closingReminderMinutes: 60,
  topUpCheckAtFraction: 0.5,
  topUpMinOffers: 3,
  topUpExtra: 4,
  backOfficeWindowFraction: 0.5,
  invitationsMax: 8,
  minReceptionOverlapWorkingHours: 1,
};
const rome = romeInstant;

describe("auction times", () => {
  it("ASTA-02 GAR-01 ASTA-07 an auction of 2 hours approved Monday 18:30: closing, minimum guarantee, reminder at half", () => {
    const t = auctionTimes(calendar, rome("2026-11-16", "18:30"), 2, 15, settings);
    expect(t.scheduledCloseAt).toEqual(rome("2026-11-17", "10:30"));
    expect(t.minGuaranteeDate).toBe("2026-12-02");
    expect(t.reminderAt).toEqual(rome("2026-11-17", "09:30"));
    expect(t.topUpAt).toEqual(rome("2026-11-17", "09:30"));
    expect(t.backOfficeInvitesUntil).toEqual(rome("2026-11-17", "09:30"));
  });

  it("ASTA-07 an auction of 5 hours: the reminder goes 60 working minutes before closing", () => {
    const t = auctionTimes(calendar, rome("2026-11-16", "17:00"), 5, 7, settings);
    expect(t.scheduledCloseAt).toEqual(rome("2026-11-17", "12:00"));
    expect(t.reminderAt).toEqual(rome("2026-11-17", "11:00"));
    expect(t.topUpAt).toEqual(rome("2026-11-17", "09:30"));
  });

  it("S04 ASTA-07 approved Thursday 19/11/2026 at 17:30 for 1 hour: closes 18:30, reminder at 18:00", () => {
    const t = auctionTimes(calendar, rome("2026-11-19", "17:30"), 1, 15, settings);
    expect(t.scheduledCloseAt).toEqual(rome("2026-11-19", "18:30"));
    expect(t.reminderAt).toEqual(rome("2026-11-19", "18:00"));
  });

  it("GAR-01 the minimum guarantee counts from the Rome date of the planned closing", () => {
    // 23:30 UTC of 30 November is already 1 December in Rome.
    expect(minGuaranteeDate(new Date("2026-11-30T23:30:00.000Z"), 7)).toBe("2026-12-08");
    expect(minGuaranteeDate(rome("2026-12-30", "18:00"), 15)).toBe("2027-01-14");
  });

  it("OFF-05 the guarantee date must be the minimum one or later", () => {
    expect(guaranteeDateAccepted("2026-12-02", "2026-12-02")).toBe(true);
    expect(guaranteeDateAccepted("2026-12-01", "2026-12-02")).toBe(false);
  });

  it("GAR-02 an offer is guaranteed until 23:59:59 of its date, Rome time", () => {
    expect(isGuaranteed("2026-12-03", new Date("2026-12-03T22:59:59.999Z"))).toBe(true);
    expect(isGuaranteed("2026-12-03", new Date("2026-12-03T23:00:00.000Z"))).toBe(false);
  });

  it("ASTA-04 the top-up invites up to 4 more agencies only below 3 offers", () => {
    expect(topUpSize(0, settings)).toBe(4);
    expect(topUpSize(2, settings)).toBe(4);
    expect(topUpSize(3, settings)).toBe(0);
  });

  it("ASTA-06 the back office adds invitations only in the first half, in working time", () => {
    const opened = rome("2026-11-16", "18:30");
    const close = rome("2026-11-17", "10:30");
    expect(
      backOfficeMayInvite(calendar, opened, close, rome("2026-11-16", "23:00"), settings),
    ).toBe(true);
    expect(
      backOfficeMayInvite(calendar, opened, close, rome("2026-11-17", "09:29"), settings),
    ).toBe(true);
    expect(
      backOfficeMayInvite(calendar, opened, close, rome("2026-11-17", "09:30"), settings),
    ).toBe(false);
  });
});

const offer = (
  id: string,
  companyId: string,
  euros: number,
  guaranteeUntil: string,
  at: string,
): RankedOffer => ({
  id,
  companyId,
  annualGrossPremiumCents: euros * 100,
  guaranteeUntil,
  lastSubmittedAt: new Date(at),
});

describe("order of the offers (PRES-01, CLA-01)", () => {
  it("PRES-01 S06 same premium: the longer guarantee wins (Cinque before Tre)", () => {
    const tre = offer("tre", "beta", 505, "2026-12-03", "2026-11-16T10:05:00.000Z");
    const cinque = offer("cinque", "beta", 505, "2026-12-06", "2026-11-16T10:30:00.000Z");
    expect(rankOffers([tre, cinque]).map((o) => [o.id, o.rank])).toEqual([
      ["cinque", 1],
      ["tre", 2],
    ]);
    const shown = bestOfferPerCompany([tre, cinque], new Date("2026-11-20T10:00:00.000Z"));
    expect(shown.map((r) => r.offer.id)).toEqual(["cinque"]);
  });

  it("PRES-01 S06 same premium and guarantee: the older submission by server time wins (Tre at 11:05 before Cinque at 11:30)", () => {
    const tre = offer("tre", "beta", 505, "2026-12-03", "2026-11-16T10:05:00.000Z");
    const cinque = offer("cinque", "beta", 505, "2026-12-03", "2026-11-16T10:30:00.000Z");
    expect(rankOffers([cinque, tre]).map((o) => o.id)).toEqual(["tre", "cinque"]);
  });

  it("PRES-01 the lowest premium comes first", () => {
    const a = offer("a", "alfa", 480, "2026-12-01", "2026-11-16T10:30:00.000Z");
    const b = offer("b", "beta", 505, "2026-12-09", "2026-11-16T10:00:00.000Z");
    expect(compareOffers(a, b)).toBeLessThan(0);
  });

  it("PRES-02 one row per company: the best still guaranteed; otherwise the best expired, in grey", () => {
    const now = new Date("2026-12-05T10:00:00.000Z");
    const alfaCheapExpired = offer("a1", "alfa", 450, "2026-12-01", "2026-11-16T10:00:00.000Z");
    const alfaGuaranteed = offer("a2", "alfa", 470, "2026-12-10", "2026-11-16T10:00:00.000Z");
    const gammaExpired = offer("g1", "gamma", 440, "2026-12-02", "2026-11-16T10:00:00.000Z");
    const gammaWorse = offer("g2", "gamma", 460, "2026-12-03", "2026-11-16T10:00:00.000Z");
    const rows = bestOfferPerCompany(
      [alfaCheapExpired, alfaGuaranteed, gammaExpired, gammaWorse],
      now,
    );
    expect(rows.map((r) => [r.offer.id, r.guaranteed])).toEqual([
      ["g1", false],
      ["a2", true],
    ]);
  });
});

const packages = JSON.parse(
  readFileSync(new URL("../../../../seed/pacchetti.json", import.meta.url), "utf8"),
) as {
  legalMinimums: { rcaBodilyInjuryPerClaimEur: number; rcaPropertyDamagePerClaimEur: number };
  packages: { code: string; requirements: unknown }[];
};
const requirementsOf = (code: string) =>
  PackageRequirementsSchema.parse(packages.packages.find((p) => p.code === code)?.requirements);
const legal = packages.legalMinimums;

const complete: OfferCoverage = {
  rca: { limitType: "SINGLE_LIMIT", singleLimitEur: 10_000_000 },
  recourseWaiver: {
    included: true,
    cases: ["EXPIRED_LICENCE", "NON_COMPLIANT_PASSENGER_TRANSPORT"],
  },
  roadsideAssistance: { included: true },
  legalProtection: { included: true },
  driverAccident: { included: true, capitalEur: 50_000 },
  theftFire: { included: true, coinsurancePct: 10, coinsuranceMinEur: 250, marketValue: true },
  naturalEventsVandalism: { included: true, coinsurancePct: 10, coinsuranceMinEur: 250 },
  glass: { included: true, deductibleEur: 150 },
};

describe("coverage against the package (OFF-06)", () => {
  it("every package of seed/pacchetti.json matches the schema of the requirements", () => {
    for (const p of packages.packages) {
      expect(() => PackageRequirementsSchema.parse(p.requirements), p.code).not.toThrow();
    }
  });

  it("OFF-06 the same coverage as the package conforms; better coverage too", () => {
    expect(coverageShortfalls(requirementsOf("COMPLETE"), complete, legal)).toEqual([]);
    const better: OfferCoverage = {
      ...complete,
      rca: { limitType: "SINGLE_LIMIT", singleLimitEur: 25_000_000 },
      glass: { included: true, deductibleEur: 0 },
    };
    expect(coverageShortfalls(requirementsOf("COMPLETE"), better, legal)).toEqual([]);
  });

  it("OFF-06 less than the package: the offer does not conform, with the items that fall short", () => {
    const worse: OfferCoverage = {
      ...complete,
      rca: { limitType: "SINGLE_LIMIT", singleLimitEur: 7_000_000 },
      recourseWaiver: { included: true, cases: ["EXPIRED_LICENCE"] },
      theftFire: { included: true, coinsurancePct: 15, coinsuranceMinEur: 250, marketValue: true },
      glass: { included: false },
    };
    expect(coverageShortfalls(requirementsOf("COMPLETE"), worse, legal)).toEqual([
      "rca",
      "recourseWaiver",
      "theftFire",
      "glass",
    ]);
  });

  it("OFF-06 the Base package asks only the legal minimums of the RCA", () => {
    const base: OfferCoverage = {
      rca: {
        limitType: "SEPARATE_LIMITS",
        bodilyInjuryPerClaimEur: legal.rcaBodilyInjuryPerClaimEur,
        propertyDamagePerClaimEur: legal.rcaPropertyDamagePerClaimEur,
      },
      recourseWaiver: { included: false },
      roadsideAssistance: { included: false },
      legalProtection: { included: false },
      driverAccident: { included: false },
      theftFire: { included: false },
      naturalEventsVandalism: { included: false },
      glass: { included: false },
    };
    expect(coverageShortfalls(requirementsOf("BASE"), base, legal)).toEqual([]);
    const belowLegal: OfferCoverage = {
      ...base,
      rca: {
        limitType: "SEPARATE_LIMITS",
        bodilyInjuryPerClaimEur: legal.rcaBodilyInjuryPerClaimEur,
        propertyDamagePerClaimEur: 1_000_000,
      },
    };
    expect(coverageShortfalls(requirementsOf("BASE"), belowLegal, legal)).toEqual(["rca"]);
  });

  it("the declaration of the coverage is strict: an unknown item is refused", () => {
    expect(OfferCoverageSchema.safeParse({ ...complete, kasko: { included: true } }).success).toBe(
      false,
    );
  });
});

/** Edges of the first mermaid diagram after `heading` in docs/modello-dati.md. */
function diagramEdges(heading: string): string[] {
  const doc = readFileSync(new URL("../../../../docs/modello-dati.md", import.meta.url), "utf8");
  const section = doc.slice(doc.indexOf(heading));
  const diagram = section.slice(
    section.indexOf("```mermaid"),
    section.indexOf("```", section.indexOf("```mermaid") + 3),
  );
  return [...diagram.matchAll(/^\s*([A-Z_]+) --> ([A-Z_]+)/gm)]
    .map((m) => `${m[1]}->${m[2]}`)
    .sort();
}

describe("status transitions (docs/modello-dati.md)", () => {
  it("the request transitions are exactly the diagram's", () => {
    expect(REQUEST_TRANSITIONS.map(([a, b]) => `${a}->${b}`).sort()).toEqual(
      diagramEdges("## Stati della richiesta"),
    );
  });

  it("the offer transitions are exactly the diagram's", () => {
    expect(OFFER_TRANSITIONS.map(([a, b]) => `${a}->${b}`).sort()).toEqual(
      diagramEdges("## Stati dell'offerta"),
    );
  });

  it("a passage not in the diagram is refused", () => {
    expect(transitionRequest("IN_VERIFICATION", "AUCTION_OPEN")).toBe("AUCTION_OPEN");
    expect(() => transitionRequest("AUCTION_OPEN", "ACCEPTED")).toThrow(/not allowed/);
    expect(() => transitionOffer("WITHDRAWN", "SUBMITTED")).toThrow(/not allowed/);
  });
});
