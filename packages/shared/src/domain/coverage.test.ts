import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findRepoRoot } from "../env/index.js";
import {
  coverageShortfalls,
  effectiveRequirements,
  PackageRequirementsSchema,
  OfferCoverageSchema,
  type OfferCoverage,
  type PackageRequirements,
} from "./coverage.js";

// The packages of seed/pacchetti.json, as the database holds them.
const seed = JSON.parse(
  readFileSync(join(findRepoRoot(import.meta.dirname), "seed", "pacchetti.json"), "utf8"),
) as { packages: { code: string; version: number; requirements: unknown }[] };
// The latest version of each package (Dan, 2026-10-28: version 2).
const requirementsOf = (code: string): PackageRequirements =>
  PackageRequirementsSchema.parse(
    seed.packages.filter((p) => p.code === code).sort((a, b) => b.version - a.version)[0]
      ?.requirements,
  );

const LEGAL = { rcaBodilyInjuryPerClaimEur: 6_450_000, rcaPropertyDamagePerClaimEur: 1_300_000 };

// An offer with RCA at the legal minimums and nothing else.
const rcaOnly: OfferCoverage = {
  rca: { limitType: "SINGLE_LIMIT", singleLimitEur: 6_450_000 },
  recourseWaiver: { included: false },
  roadsideAssistance: { included: false },
  legalProtection: { included: false },
  driverAccident: { included: false },
  theftFire: { included: false },
  naturalEvents: { included: false },
  vandalism: { included: false },
  collisionKasko: { included: false },
  fullKasko: { included: false },
  wildlifeCollision: { included: false },
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

describe("Dan, 2026-10-28: natural events and vandalism apart, kasko and wild animals", () => {
  it("a package or an offer saved before keeps working: the old item counts for both", () => {
    const old = PackageRequirementsSchema.parse({
      rca: { limitType: "LEGAL_MINIMUMS" },
      recourseWaiver: { required: false },
      roadsideAssistance: { required: false },
      legalProtection: { required: false },
      driverAccident: { required: false },
      theftFire: { required: false },
      naturalEventsVandalism: { required: true, maxCoinsurancePct: 10, maxCoinsuranceMinEur: 250 },
      glass: { required: false },
    });
    expect(old.naturalEvents).toEqual({
      required: true,
      maxCoinsurancePct: 10,
      maxCoinsuranceMinEur: 250,
    });
    expect(old.vandalism).toEqual(old.naturalEvents);
    expect(old.fullKasko).toEqual({ required: false });
    const declared = OfferCoverageSchema.parse({
      ...Object.fromEntries(
        Object.entries(rcaOnly).filter(
          ([key]) =>
            ![
              "naturalEvents",
              "vandalism",
              "collisionKasko",
              "fullKasko",
              "wildlifeCollision",
            ].includes(key),
        ),
      ),
      naturalEventsVandalism: { included: true, coinsurancePct: 10, coinsuranceMinEur: 250 },
    });
    expect(coverageShortfalls(old, declared, LEGAL)).toEqual([]);
  });

  it("OFF-06 «Su misura»: each new coverage chosen is required on its own", () => {
    const template = requirementsOf("CUSTOM");
    const required = effectiveRequirements("CUSTOM", template, [
      "vandalism",
      "collisionKasko",
      "fullKasko",
      "wildlifeCollision",
    ]);
    expect(coverageShortfalls(required, rcaOnly, LEGAL).sort()).toEqual([
      "collisionKasko",
      "fullKasko",
      "vandalism",
      "wildlifeCollision",
    ]);
    const offered: OfferCoverage = {
      ...rcaOnly,
      vandalism: { included: true, coinsurancePct: 10, coinsuranceMinEur: 250 },
      collisionKasko: { included: true, coinsurancePct: 10, coinsuranceMinEur: 500 },
      fullKasko: { included: true, coinsurancePct: 10, coinsuranceMinEur: 500 },
      wildlifeCollision: { included: true, coinsurancePct: 10, coinsuranceMinEur: 250 },
    };
    expect(coverageShortfalls(required, offered, LEGAL)).toEqual([]);
    // Natural events were not chosen: their absence is no shortfall.
    expect(required.naturalEvents).toEqual({ required: false });
  });
});
