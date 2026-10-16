import { describe, expect, it } from "vitest";
import {
  AgencyFilterCriteriaSchema,
  filterMismatches,
  memberFilterProblems,
  type AgencyFilterCriteria,
  type FilterableRequest,
} from "./agency-filters.js";

const criteria: AgencyFilterCriteria = {
  vehicleTypes: ["CAR"],
  provinces: ["MI", "MB"],
  cuClassMin: 1,
  cuClassMax: 10,
  maxClaimsLast5y: 1,
  driverAgeMin: 23,
  driverAgeMax: 75,
  packages: ["BASE", "PLUS"],
  companies: ["01a14406-a0d2-7195-bde3-511b8f9ed26f"],
  maxStartDateDays: 30,
  maxGuaranteeDays: 15,
};
const request: FilterableRequest = {
  vehicleType: "CAR",
  province: "MI",
  cuClass: 1,
  claimsLast5y: 0,
  youngestDriverAge: 36,
  packageCode: "PLUS",
  startInDays: 20,
  minValidityDays: 15,
};

describe("agency filters (ASTA-05)", () => {
  it("ASTA-05 a request inside every filter fits", () => {
    expect(filterMismatches(criteria, request)).toEqual([]);
  });

  it("ASTA-05 each filter gives its own reason", () => {
    expect(
      filterMismatches(criteria, {
        vehicleType: "MOTORCYCLE",
        province: "RM",
        cuClass: 14,
        claimsLast5y: 2,
        youngestDriverAge: 19,
        packageCode: "COMPLETE",
        startInDays: 45,
        minValidityDays: 30,
      }),
    ).toEqual([
      "VEHICLE_TYPE",
      "PROVINCE",
      "CU_CLASS",
      "CLAIMS",
      "DRIVER_AGE",
      "PACKAGE",
      "START_DATE",
      "GUARANTEE",
    ]);
  });

  it("ASTA-05 no list of provinces or no limit on claims means any", () => {
    const open = { ...criteria, provinces: null, maxClaimsLast5y: null };
    expect(filterMismatches(open, { ...request, province: "PA", claimsLast5y: 4 })).toEqual([]);
  });

  it("a first policy without CU class fits any range of classes", () => {
    expect(filterMismatches(criteria, { ...request, cuClass: null })).toEqual([]);
  });

  it("the criteria are strict and coherent", () => {
    expect(AgencyFilterCriteriaSchema.safeParse(criteria).success).toBe(true);
    expect(AgencyFilterCriteriaSchema.safeParse({ ...criteria, cuClassMin: 12 }).success).toBe(
      false,
    );
    expect(AgencyFilterCriteriaSchema.safeParse({ ...criteria, extra: 1 }).success).toBe(false);
  });
});

describe("member filters inside the agency's (VIS-06)", () => {
  it("VIS-06 the same filters or narrower ones are accepted", () => {
    expect(memberFilterProblems(criteria, criteria)).toEqual([]);
    expect(
      memberFilterProblems(criteria, {
        ...criteria,
        provinces: ["MI"],
        cuClassMax: 5,
        maxClaimsLast5y: 0,
        driverAgeMin: 30,
        packages: ["BASE"],
        maxStartDateDays: 10,
        maxGuaranteeDays: 7,
      }),
    ).toEqual([]);
  });

  it("VIS-06 a member filter can never widen the agency's", () => {
    expect(
      memberFilterProblems(criteria, {
        ...criteria,
        vehicleTypes: ["CAR", "MOTORCYCLE"],
        provinces: null,
        cuClassMin: 1,
        cuClassMax: 14,
        maxClaimsLast5y: null,
        driverAgeMax: 90,
        packages: ["BASE", "COMPLETE"],
        companies: ["01a14406-a0d2-7195-bde3-511b8f9ed26f", "01a14406-a0d2-7195-bde3-511b8f9ed270"],
        maxStartDateDays: 60,
        maxGuaranteeDays: 30,
      }),
    ).toEqual([
      "VEHICLE_TYPES",
      "PROVINCES",
      "CU_CLASS",
      "CLAIMS",
      "DRIVER_AGE",
      "PACKAGES",
      "COMPANIES",
      "START_DATE",
      "GUARANTEE",
    ]);
  });
});
