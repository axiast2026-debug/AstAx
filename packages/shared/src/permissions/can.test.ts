import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  ACTOR_ROLES,
  can,
  NO_FLAGS,
  type Action,
  type Actor,
  type ActorRole,
  type MembershipFlag,
  type MembershipRole,
  type OrganizationType,
} from "./index.js";

/**
 * Expected permissions, written role by role from docs/permessi.md.
 * Every role is checked against every action: what is not listed must be denied.
 */
const SELF: Action[] = [
  "profile.view",
  "profile.update",
  "session.manageOwn",
  "notification.viewOwn",
  "legal.acceptOwn",
];
const PRO_SELF: Action[] = [...SELF, "context.switch"];

const EXPECTED: Record<ActorRole, Action[]> = {
  PRIVATE: [
    ...SELF,
    "request.create",
    "consent.revoke",
    "request.viewOwn",
    "request.cancel",
    "customer.viewContacts",
    "auction.viewStatus",
    "offers.viewPresented",
    "aiComparison.use",
    "offer.accept",
    "reconfirmation.request",
    "invoice.viewOwn",
    "complaint.open",
    "withdrawal.request",
  ],
  BROKER_CLIENT_LINK: ["legal.acceptOwn", "offers.viewPresented", "offer.accept"],
  BROKER_OWNER: [
    ...PRO_SELF,
    "request.create",
    "consent.revoke",
    "request.viewOwn",
    "request.cancel",
    "customer.viewContacts",
    "brokerCustomer.manage",
    "request.bulkUpload",
    "auction.viewStatus",
    "offers.viewPresented",
    "customerLink.send",
    "reconfirmation.request",
    "withdrawal.request",
    "accounting.brokerStatement",
    "invoice.viewOwn",
    "team.manage",
    "organization.editProfile",
  ],
  BROKER_OPERATOR: [
    ...PRO_SELF,
    "request.create",
    "consent.revoke",
    "request.viewOwn",
    "request.cancel",
    "customer.viewContacts",
    "brokerCustomer.manage",
    "request.bulkUpload",
    "auction.viewStatus",
    "offers.viewPresented",
    "customerLink.send",
    "reconfirmation.request",
    "withdrawal.request",
  ],
  AGENCY_OWNER: [
    ...PRO_SELF,
    "request.viewQuoteData",
    "customer.viewContacts",
    "auction.viewStatus",
    "claim.manage",
    "claim.override",
    "offer.submit",
    "offer.readOwnDuringAuction",
    "offer.readColleagueDuringAuction",
    "reconfirmation.respond",
    "ranking.view",
    "agencyFilters.manage",
    "memberFilters.manageOwn",
    "productLibrary.manage",
    "issuance.manage",
    "withdrawal.indicateRefundablePremium",
    "accounting.agencyStatement",
    "invoice.viewOwn",
    "penalty.contest",
    "team.manage",
    "organization.editProfile",
    "accessLog.viewOwnAgency",
  ],
  AGENCY_SUPERVISOR: [
    ...PRO_SELF,
    "request.viewQuoteData",
    "customer.viewContacts",
    "auction.viewStatus",
    "claim.manage",
    "claim.override",
    "offer.submit",
    "offer.readOwnDuringAuction",
    "offer.readColleagueDuringAuction",
    "reconfirmation.respond",
    "ranking.view",
    "agencyFilters.manage",
    "memberFilters.manageOwn",
    "productLibrary.manage",
    "issuance.manage",
    "withdrawal.indicateRefundablePremium",
  ],
  AGENCY_OPERATOR: [
    ...PRO_SELF,
    "request.viewQuoteData",
    "customer.viewContacts",
    "auction.viewStatus",
    "claim.manage",
    "offer.submit",
    "offer.readOwnDuringAuction",
    "reconfirmation.respond",
    "ranking.view",
    "memberFilters.manageOwn",
  ],
  BO_VERIFIER: [
    ...PRO_SELF,
    "devTools.use",
    "request.viewQuoteData",
    "customer.viewContacts",
    "verification.viewQueue",
    "verification.decide",
    "verification.excludeAgency",
    "auction.viewStatus",
    "backOffice.dashboard",
    "auction.manage",
    "offer.excludeAfterPdfCheck",
    "offer.viewAllAfterClose",
    "issuance.decideMissed",
    "penalty.propose",
  ],
  BO_SUPPORT: [
    ...PRO_SELF,
    "request.viewQuoteData",
    "customer.viewContacts",
    "verification.viewQueue",
    "auction.viewStatus",
    "backOffice.dashboard",
    "offer.viewAllAfterClose",
    "refund.request",
    "withdrawal.manage",
    "accounting.view",
    "accessLog.viewCustomer",
    "support.tickets",
    "complaint.open",
    "dataSubjectRequest.manage",
  ],
  BO_ACCOUNTING: [
    ...PRO_SELF,
    "request.viewQuoteData",
    "customer.viewContacts",
    "auction.viewStatus",
    "backOffice.dashboard",
    "offer.viewAllAfterClose",
    "refund.request",
    "accounting.view",
    "remittance.execute",
  ],
  BO_SUPERVISOR: [
    ...PRO_SELF,
    "devTools.use",
    "request.cancel",
    "request.viewQuoteData",
    "customer.viewContacts",
    "verification.viewQueue",
    "verification.decide",
    "verification.excludeAgency",
    "auction.viewStatus",
    "backOffice.dashboard",
    "auction.manage",
    "offer.excludeAfterPdfCheck",
    "offer.viewAllAfterClose",
    "issuance.decideMissed",
    "refund.request",
    "refund.approve",
    "withdrawal.manage",
    "accounting.view",
    "remittance.execute",
    "penalty.propose",
    "penalty.apply",
    "organization.approveOnboarding",
    "organization.suspend",
    "accessLog.viewCustomer",
    "auditLog.viewAll",
    "support.tickets",
    "complaint.open",
    "complaint.manage",
    "dataSubjectRequest.manage",
  ],
  ADMIN: [
    ...PRO_SELF,
    "devTools.use",
    "request.viewQuoteData",
    "customer.viewContacts",
    "verification.viewQueue",
    "auction.viewStatus",
    "backOffice.dashboard",
    "offer.viewAllAfterClose",
    "accounting.view",
    "penalty.decideContest",
    "organization.exclude",
    "organization.suspend",
    "accessLog.viewCustomer",
    "auditLog.viewAll",
    "admin.settings.manage",
    "admin.catalog.manage",
    "admin.legal.manage",
    "admin.notifications.manage",
    "admin.users.manage",
    "admin.reports.view",
  ],
};

const MEMBER: Partial<Record<ActorRole, [MembershipRole, OrganizationType]>> = {
  BROKER_OWNER: ["OWNER", "BROKER"],
  BROKER_OPERATOR: ["OPERATOR", "BROKER"],
  AGENCY_OWNER: ["OWNER", "AGENCY"],
  AGENCY_SUPERVISOR: ["SUPERVISOR", "AGENCY"],
  AGENCY_OPERATOR: ["OPERATOR", "AGENCY"],
  BO_VERIFIER: ["BO_VERIFIER", "ASTAX"],
  BO_SUPPORT: ["BO_SUPPORT", "ASTAX"],
  BO_ACCOUNTING: ["BO_ACCOUNTING", "ASTAX"],
  BO_SUPERVISOR: ["BO_SUPERVISOR", "ASTAX"],
  ADMIN: ["ADMIN", "ASTAX"],
};

function actorFor(role: ActorRole, flags: Partial<Record<MembershipFlag, boolean>> = {}): Actor {
  if (role === "PRIVATE" || role === "BROKER_CLIENT_LINK") return { kind: role };
  const [membershipRole, organizationType] = MEMBER[role] as [MembershipRole, OrganizationType];
  return {
    kind: "MEMBER",
    role: membershipRole,
    organizationType,
    flags: { ...NO_FLAGS, ...flags },
  };
}

describe("SIC-01 permission map, role by role (docs/permessi.md)", () => {
  it("the expected table only names existing actions", () => {
    for (const actions of Object.values(EXPECTED)) {
      for (const action of actions) expect(ACTIONS).toContain(action);
    }
  });

  for (const role of ACTOR_ROLES) {
    describe(role, () => {
      const allowed = new Set<Action>(EXPECTED[role]);
      for (const action of ACTIONS) {
        const expected = allowed.has(action);
        it(`${expected ? "may" : "may not"} ${action}`, () => {
          expect(can(actorFor(role), action)).toBe(expected);
        });
      }
    });
  }
});

describe("flags granted by the owner", () => {
  it("AGENCY_OPERATOR with canIssue sees «Da emettere» and issues", () => {
    expect(can(actorFor("AGENCY_OPERATOR"), "issuance.manage")).toBe(false);
    expect(can(actorFor("AGENCY_OPERATOR", { canIssue: true }), "issuance.manage")).toBe(true);
    expect(
      can(actorFor("AGENCY_OPERATOR", { canIssue: true }), "withdrawal.indicateRefundablePremium"),
    ).toBe(true);
  });

  it("VIS-06 AGENCY_OPERATOR sees colleagues' offers only with canSeeColleagueOffers", () => {
    expect(can(actorFor("AGENCY_OPERATOR"), "offer.readColleagueDuringAuction")).toBe(false);
    expect(
      can(
        actorFor("AGENCY_OPERATOR", { canSeeColleagueOffers: true }),
        "offer.readColleagueDuringAuction",
      ),
    ).toBe(true);
  });

  it("AGENCY_SUPERVISOR sees accounting and contests penalties only with canSeeAccounting", () => {
    const plain = actorFor("AGENCY_SUPERVISOR");
    const withFlag = actorFor("AGENCY_SUPERVISOR", { canSeeAccounting: true });
    expect(can(plain, "accounting.agencyStatement")).toBe(false);
    expect(can(plain, "penalty.contest")).toBe(false);
    expect(can(withFlag, "accounting.agencyStatement")).toBe(true);
    expect(can(withFlag, "penalty.contest")).toBe(true);
    // Its statement links the fee invoices: it downloads them too.
    expect(can(plain, "invoice.viewOwn")).toBe(false);
    expect(can(withFlag, "invoice.viewOwn")).toBe(true);
  });

  it("a flag never extends to a role it was not designed for", () => {
    const allFlags = {
      canIssue: true,
      canSeeColleagueOffers: true,
      canSeeAccounting: true,
      seesAllClients: true,
    };
    expect(can(actorFor("BROKER_OPERATOR", allFlags), "issuance.manage")).toBe(false);
    expect(can(actorFor("AGENCY_OPERATOR", allFlags), "accounting.agencyStatement")).toBe(false);
    expect(can(actorFor("BO_SUPPORT", allFlags), "offer.readColleagueDuringAuction")).toBe(false);
  });
});

describe("default deny", () => {
  it("BC-01 nobody, ADMIN included, may read a sealed offer of another organization", () => {
    for (const role of ACTOR_ROLES) {
      const allFlags = {
        canIssue: true,
        canSeeColleagueOffers: true,
        canSeeAccounting: true,
        seesAllClients: true,
      };
      expect(can(actorFor(role, allFlags), "offer.readSealed")).toBe(false);
    }
  });

  it("an unknown action is denied to everyone", () => {
    for (const role of ACTOR_ROLES) expect(can(actorFor(role), "offer.readEverything")).toBe(false);
  });

  it("an impossible membership (role not valid for the organization type) is denied", () => {
    const impossible: Actor[] = [
      { kind: "MEMBER", role: "SUPERVISOR", organizationType: "BROKER", flags: NO_FLAGS },
      { kind: "MEMBER", role: "ADMIN", organizationType: "AGENCY", flags: NO_FLAGS },
      { kind: "MEMBER", role: "OWNER", organizationType: "ASTAX", flags: NO_FLAGS },
    ];
    for (const actor of impossible) {
      for (const action of ACTIONS) expect(can(actor, action)).toBe(false);
    }
  });
});
