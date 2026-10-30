import { describe, expect, it } from "vitest";
import { membershipGrantProblems } from "./team.js";

describe("team: roles and flags an owner can grant", () => {
  it("agency: supervisor and operator; broker: operator; never owner or back office roles", () => {
    expect(membershipGrantProblems("AGENCY", "SUPERVISOR", {})).toEqual([]);
    expect(membershipGrantProblems("AGENCY", "OPERATOR", {})).toEqual([]);
    expect(membershipGrantProblems("BROKER", "OPERATOR", {})).toEqual([]);
    expect(membershipGrantProblems("BROKER", "SUPERVISOR", {})).toEqual(["ROLE_NOT_ASSIGNABLE"]);
    expect(membershipGrantProblems("AGENCY", "OWNER", {})).toEqual(["ROLE_NOT_ASSIGNABLE"]);
    expect(membershipGrantProblems("AGENCY", "ADMIN", {})).toEqual(["ROLE_NOT_ASSIGNABLE"]);
  });

  it("canIssue and canSeeColleagueOffers only for agency operators (VIS-06)", () => {
    expect(
      membershipGrantProblems("AGENCY", "OPERATOR", {
        canIssue: true,
        canSeeColleagueOffers: true,
      }),
    ).toEqual([]);
    expect(membershipGrantProblems("AGENCY", "SUPERVISOR", { canIssue: true })).toEqual([
      "FLAG_NOT_APPLICABLE:canIssue",
    ]);
  });

  it("canSeeAccounting only for agency supervisors; seesAllClients for the operators of brokers and agencies (VIS-13, audit B3)", () => {
    expect(membershipGrantProblems("AGENCY", "SUPERVISOR", { canSeeAccounting: true })).toEqual([]);
    expect(membershipGrantProblems("AGENCY", "OPERATOR", { canSeeAccounting: true })).toEqual([
      "FLAG_NOT_APPLICABLE:canSeeAccounting",
    ]);
    expect(membershipGrantProblems("BROKER", "OPERATOR", { seesAllClients: true })).toEqual([]);
    expect(membershipGrantProblems("AGENCY", "OPERATOR", { seesAllClients: true })).toEqual([]);
    expect(membershipGrantProblems("AGENCY", "SUPERVISOR", { seesAllClients: true })).toEqual([
      "FLAG_NOT_APPLICABLE:seesAllClients",
    ]);
  });

  it("flags set to false are always fine", () => {
    expect(
      membershipGrantProblems("BROKER", "OPERATOR", { canIssue: false, canSeeAccounting: false }),
    ).toEqual([]);
  });
});
