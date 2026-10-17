import { describe, expect, it } from "vitest";
import {
  aiTextProblems,
  coverageImprovements,
  scoreOffers,
  type AiCandidate,
  type AiWeights,
} from "./ai-comparison.js";
import type { OfferCoverage, PackageRequirements } from "./coverage.js";

// The weights of seed/parametri.json.
const WEIGHTS: AiWeights = {
  price: 0.6,
  coverage: 0.2,
  companyComplaints: 0.1,
  agencyIssuanceSpeed: 0.1,
};

const offer = (id: string, premium: number, more: Partial<AiCandidate> = {}): AiCandidate => ({
  id,
  companyId: `c-${id}`,
  annualGrossPremiumCents: premium,
  guaranteeUntil: "2026-12-05",
  lastSubmittedAt: new Date("2026-11-16T10:00:00Z"),
  coverageImprovements: 0,
  companyComplaintsIndex: null,
  agencyIssuanceMinutes: null,
  ...more,
});

describe("AI comparison score (PRES-07)", () => {
  it("PRES-07 with no data on coverage, complaints and speed, the lowest premium wins", () => {
    const r = scoreOffers(
      [offer("alfa", 52000), offer("beta", 50500), offer("gamma", 61000)],
      WEIGHTS,
    );
    expect(r.recommendedOfferId).toBe("beta");
    const beta = r.offers.find((o) => o.offerId === "beta");
    expect(beta?.scores).toEqual({
      price: 1,
      coverage: 0.5,
      companyComplaints: 0.5,
      agencyIssuanceSpeed: 0.5,
    });
    expect(beta?.total).toBe(0.8);
  });

  it("PRES-07 better coverage and fewer complaints can beat a slightly lower premium", () => {
    const r = scoreOffers(
      [
        offer("alfa", 52000, { coverageImprovements: 3, companyComplaintsIndex: 0.5 }),
        offer("beta", 50500, { coverageImprovements: 0, companyComplaintsIndex: 1.5 }),
      ],
      WEIGHTS,
    );
    expect(r.recommendedOfferId).toBe("alfa");
  });

  it("PRES-07 a tie on the total follows PRES-01 (longer guarantee)", () => {
    const r = scoreOffers(
      [
        offer("tre", 50500, { guaranteeUntil: "2026-12-03" }),
        offer("cinque", 50500, { guaranteeUntil: "2026-12-06" }),
      ],
      WEIGHTS,
    );
    expect(r.recommendedOfferId).toBe("cinque");
  });
});

const PLUS: PackageRequirements = {
  rca: { limitType: "SINGLE_LIMIT", minSingleLimitEur: 10_000_000 },
  recourseWaiver: { required: true, minCases: ["EXPIRED_LICENCE"] },
  roadsideAssistance: { required: true },
  legalProtection: { required: false },
  driverAccident: { required: false },
  theftFire: { required: false },
  naturalEventsVandalism: { required: false },
  glass: { required: true, maxDeductibleEur: 100 },
};
const AS_ASKED: OfferCoverage = {
  rca: { limitType: "SINGLE_LIMIT", singleLimitEur: 10_000_000 },
  recourseWaiver: { included: true, cases: ["EXPIRED_LICENCE"] },
  roadsideAssistance: { included: true },
  legalProtection: { included: false },
  driverAccident: { included: false },
  theftFire: { included: false },
  naturalEventsVandalism: { included: false },
  glass: { included: true, deductibleEur: 100 },
};

describe("coverage beyond the package (PRES-07)", () => {
  it("PRES-07 the coverage as asked improves nothing", () => {
    expect(coverageImprovements(PLUS, AS_ASKED)).toBe(0);
  });

  it("PRES-07 a higher limit, an extra item, a lower deductible and an extra recourse case count", () => {
    expect(
      coverageImprovements(PLUS, {
        ...AS_ASKED,
        rca: { limitType: "SINGLE_LIMIT", singleLimitEur: 15_000_000 },
        recourseWaiver: {
          included: true,
          cases: ["EXPIRED_LICENCE", "NON_COMPLIANT_PASSENGER_TRANSPORT"],
        },
        legalProtection: { included: true },
        glass: { included: true, deductibleEur: 50 },
      }),
    ).toBe(4);
  });
});

describe("check of the AI text (PRES-07, proposal D)", () => {
  const input = {
    recommendedCompany: "Compagnia Beta",
    allowedNumbers: ["505,00", "520,00", "6"],
    maxChars: 600,
  };

  it("PRES-07 a text naming the recommended offer with the given figures passes", () => {
    expect(
      aiTextProblems("Compagnia Beta costa 505,00 € ed è garantita per 6 giorni in più.", input),
    ).toEqual([]);
  });

  it("PRES-07 a figure the model did not receive, a missing offer or a long text fail", () => {
    expect(aiTextProblems("Compagnia Beta costa 499,00 €.", input)).toEqual(["FOREIGN_NUMBER"]);
    expect(aiTextProblems("La migliore è la più economica.", input)).toEqual([
      "NO_RECOMMENDED_OFFER",
    ]);
    expect(aiTextProblems(`Compagnia Beta ${"a".repeat(600)}`, input)).toEqual(["TOO_LONG"]);
    expect(aiTextProblems("  ", input)).toEqual(["EMPTY"]);
  });
});
