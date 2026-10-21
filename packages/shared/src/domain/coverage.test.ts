import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findRepoRoot } from "../env/index.js";
import {
  coverageShortfalls,
  effectiveRequirements,
  PackageRequirementsSchema,
  type OfferCoverage,
  type PackageRequirements,
} from "./coverage.js";

// The packages of seed/pacchetti.json, as the database holds them.
const seed = JSON.parse(
  readFileSync(join(findRepoRoot(import.meta.dirname), "seed", "pacchetti.json"), "utf8"),
) as { packages: { code: string; requirements: unknown }[] };
const requirementsOf = (code: string): PackageRequirements =>
  PackageRequirementsSchema.parse(seed.packages.find((p) => p.code === code)?.requirements);

const LEGAL = { rcaBodilyInjuryPerClaimEur: 6_450_000, rcaPropertyDamagePerClaimEur: 1_300_000 };

// An offer with RCA at the legal minimums and nothing else.
const rcaOnly: OfferCoverage = {
  rca: { limitType: "SINGLE_LIMIT", singleLimitEur: 6_450_000 },
  recourseWaiver: { included: false },
  roadsideAssistance: { included: false },
  legalProtection: { included: false },
  driverAccident: { included: false },
  theftFire: { included: false },
  naturalEventsVandalism: { included: false },
  glass: { included: false },
};

describe("Dan, 2026-10-21: «Consigliato» and «Su misura» (OFF-06)", () => {
  it("OFF-06 «Consigliato»: RCA at the legal minimums, roadside, driver accident, legal protection", () => {
    const required = requirementsOf("RECOMMENDED");
    expect(coverageShortfalls(required, rcaOnly, LEGAL).sort()).toEqual([
      "driverAccident",
      "legalProtection",
      "roadsideAssistance",
    ]);
    // Answer 3B: any capital of the driver accident cover, the agency proposes it.
    const offered: OfferCoverage = {
      ...rcaOnly,
      roadsideAssistance: { included: true },
      legalProtection: { included: true },
      driverAccident: { included: true, capitalEur: 1 },
    };
    expect(coverageShortfalls(required, offered, LEGAL)).toEqual([]);
  });

  it("OFF-06 «Su misura»: only the coverages the customer chose are required", () => {
    const template = requirementsOf("CUSTOM");
    const required = effectiveRequirements("CUSTOM", template, ["glass", "theftFire"]);
    expect(coverageShortfalls(required, rcaOnly, LEGAL).sort()).toEqual(["glass", "theftFire"]);
    // Answer 4A: the agency sets value, coinsurance and deductible.
    const offered: OfferCoverage = {
      ...rcaOnly,
      theftFire: { included: true, coinsurancePct: 20, coinsuranceMinEur: 500, marketValue: false },
      glass: { included: true, deductibleEur: 300 },
    };
    expect(coverageShortfalls(required, offered, LEGAL)).toEqual([]);
    // Nothing chosen: RCA only.
    expect(
      coverageShortfalls(effectiveRequirements("CUSTOM", template, []), rcaOnly, LEGAL),
    ).toEqual([]);
  });

  it("the other packages keep their requirements, whatever is in the chosen list", () => {
    const plus = requirementsOf("PLUS");
    expect(effectiveRequirements("PLUS", plus, ["glass"])).toEqual(plus);
  });
});
