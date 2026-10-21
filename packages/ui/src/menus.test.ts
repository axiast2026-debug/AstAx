import {
  NO_FLAGS,
  type Actor,
  type MembershipRole,
  type OrganizationType,
} from "@astax/shared/permissions";
import { describe, expect, it } from "vitest";
import { linksFor, menuFor, PRIVATE_LINKS } from "./menus.js";

const member = (
  role: MembershipRole,
  organizationType: OrganizationType,
  flags: Partial<typeof NO_FLAGS> = {},
): Actor => ({ kind: "MEMBER", role, organizationType, flags: { ...NO_FLAGS, ...flags } });
const keys = (actor: Actor) => menuFor(actor).map((m) => m.key);

describe("menus by role (docs/specifiche 02-07)", () => {
  it("private customer", () => {
    // Dan, 2026-10-21: four items; documents, help and complaints in PRIVATE_LINKS.
    expect(keys({ kind: "PRIVATE" })).toEqual(["home", "quotes", "policies", "profile"]);
    expect(PRIVATE_LINKS.map((l) => l.key)).toEqual(["documents", "support", "complaints"]);
  });

  it("broker: short menu around the work table, the other pages at the bottom", () => {
    // Dan, 2026-10-21 (docs/piano-broker.md, G).
    expect(keys(member("OWNER", "BROKER"))).toEqual([
      "requests",
      "batches",
      "customers",
      "policies",
      "accounting",
      "team",
    ]);
    expect(linksFor(member("OWNER", "BROKER")).map((l) => l.key)).toEqual([
      "dashboard",
      "renewals",
      "settings",
    ]);
    expect(linksFor(member("OPERATOR", "BROKER")).map((l) => l.key)).not.toContain("settings");
    expect(linksFor(member("OWNER", "AGENCY"))).toEqual([]);
  });

  it("broker: team and settings only for the owner", () => {
    expect(keys(member("OWNER", "BROKER"))).toContain("team");
    expect(keys(member("OPERATOR", "BROKER"))).not.toContain("team");
    expect(keys(member("OPERATOR", "BROKER"))).not.toContain("settings");
    expect(keys(member("OPERATOR", "BROKER"))).not.toContain("accounting");
  });

  it("agency owner sees the whole agency menu", () => {
    expect(keys(member("OWNER", "AGENCY"))).toEqual([
      "dashboard",
      "incomingRequests",
      "myOffers",
      "toIssue",
      "issuedPolicies",
      "results",
      "filters",
      "accounting",
      "team",
      "agency",
    ]);
  });

  it("agency supervisor: accounting only with canSeeAccounting, never team", () => {
    expect(keys(member("SUPERVISOR", "AGENCY"))).not.toContain("accounting");
    expect(keys(member("SUPERVISOR", "AGENCY", { canSeeAccounting: true }))).toContain(
      "accounting",
    );
    expect(keys(member("SUPERVISOR", "AGENCY"))).not.toContain("team");
  });

  it("sub-agent: personal menu, «Da emettere» only if enabled (spec 05)", () => {
    expect(keys(member("OPERATOR", "AGENCY"))).toEqual([
      "personalDashboard",
      "incomingRequests",
      "myOffers",
      "myResults",
      "myFilters",
    ]);
    expect(keys(member("OPERATOR", "AGENCY", { canIssue: true }))).toContain("toIssue");
  });

  it("back office: each role sees only its tools", () => {
    expect(keys(member("BO_VERIFIER", "ASTAX"))).toContain("verificationQueue");
    expect(keys(member("BO_VERIFIER", "ASTAX"))).not.toContain("payments");
    expect(keys(member("BO_ACCOUNTING", "ASTAX"))).toContain("payments");
    expect(keys(member("BO_ACCOUNTING", "ASTAX"))).not.toContain("verificationQueue");
    expect(keys(member("BO_SUPERVISOR", "ASTAX"))).toContain("auditLog");
    expect(keys(member("BO_SUPERVISOR", "ASTAX"))).toContain("onboardingQueue");
    expect(keys(member("BO_VERIFIER", "ASTAX"))).not.toContain("onboardingQueue");
    expect(keys(member("BO_SUPPORT", "ASTAX"))).not.toContain("auditLog");
  });

  it("administrator", () => {
    expect(keys(member("ADMIN", "ASTAX"))).toEqual([
      "adminDashboard",
      "auctionRules",
      "packages",
      "listsHolidays",
      "economy",
      "systemSettings",
      "complaintsIndex",
      "users",
      "organizations",
      "legalDocuments",
      "communications",
      "integrations",
      "auditLog",
      "reports",
    ]);
  });
});
