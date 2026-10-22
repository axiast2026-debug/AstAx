import type { ActorRole, MembershipFlag } from "./roles.js";

/**
 * A role allowed to perform an action, optionally only when the owner
 * granted a flag on the membership.
 */
export type Grant = ActorRole | { role: ActorRole; flag: MembershipFlag };

export interface ActionRule {
  grants: readonly Grant[];
  /**
   * Checks that depend on the data (own request, filters, auction state…).
   * The map only decides on role and flags; the use case enforces these.
   */
  conditions?: string;
}

const BACK_OFFICE = ["BO_VERIFIER", "BO_SUPPORT", "BO_ACCOUNTING", "BO_SUPERVISOR"] as const;
const AGENCY_USERS = ["AGENCY_OWNER", "AGENCY_SUPERVISOR", "AGENCY_OPERATOR"] as const;
const BROKER_USERS = ["BROKER_OWNER", "BROKER_OPERATOR"] as const;
/**
 * Who requests quotes for its own customers: brokers and, since Dan's plan of
 * 2026-10-21 (ADR 0015), agencies and their sub-agents.
 */
const ORG_REQUESTERS = [...BROKER_USERS, ...AGENCY_USERS] as const;
const PROFESSIONALS = [...BROKER_USERS, ...AGENCY_USERS, ...BACK_OFFICE, "ADMIN"] as const;
const EVERY_ACCOUNT = ["PRIVATE", ...PROFESSIONALS] as const;
const ISSUERS: readonly Grant[] = [
  "AGENCY_OWNER",
  "AGENCY_SUPERVISOR",
  { role: "AGENCY_OPERATOR", flag: "canIssue" },
];
const AGENCY_ACCOUNTING: readonly Grant[] = [
  "AGENCY_OWNER",
  { role: "AGENCY_SUPERVISOR", flag: "canSeeAccounting" },
];

/**
 * Every action of docs/permessi.md, including those implemented in later phases.
 * Anything not listed here is denied (SIC-01).
 */
export const PERMISSIONS = {
  // Self-service, every account
  "profile.view": { grants: EVERY_ACCOUNT },
  "profile.update": { grants: EVERY_ACCOUNT, conditions: "email and phone changes need an OTP" },
  "session.manageOwn": { grants: EVERY_ACCOUNT },
  "notification.viewOwn": { grants: EVERY_ACCOUNT },
  "legal.acceptOwn": { grants: [...EVERY_ACCOUNT, "BROKER_CLIENT_LINK"] },
  "context.switch": {
    grants: PROFESSIONALS,
    conditions: "only to an active membership of the user",
  },

  // Requests, customers, documents
  "request.create": {
    grants: ["PRIVATE", ...ORG_REQUESTERS],
    conditions: "consent present (LEG-04)",
  },
  "consent.revoke": {
    grants: ["PRIVATE", ...ORG_REQUESTERS],
    conditions: "private: own consents; broker: consents of own customers (LEG-04)",
  },
  "request.viewOwn": {
    grants: ["PRIVATE", ...ORG_REQUESTERS],
    conditions:
      "broker: customers of the organization; operator only own ones unless seesAllClients (VIS-13)",
  },
  "request.cancel": {
    grants: ["PRIVATE", ...ORG_REQUESTERS, "BO_SUPERVISOR"],
    conditions: "requester or BO supervisor, only before acceptance",
  },
  "request.viewQuoteData": {
    grants: [...AGENCY_USERS, ...BACK_OFFICE, "ADMIN"],
    conditions:
      "agency invited; operator within own filters; logged (VIS-09) and watermarked (VIS-10)",
  },
  "customer.viewContacts": {
    grants: ["PRIVATE", ...BROKER_USERS, ...AGENCY_USERS, ...BACK_OFFICE, "ADMIN"],
    conditions: "agency only when winning and payment confirmed (VIS-01, VIS-02)",
  },
  "brokerCustomer.manage": {
    grants: ORG_REQUESTERS,
    conditions: "same visibility as request.viewOwn",
  },
  "request.bulkUpload": { grants: ORG_REQUESTERS },

  // Verification and auction
  "backOffice.dashboard": {
    grants: [...BACK_OFFICE, "ADMIN"],
    conditions: "queues of the own role, counts and waits only",
  },
  "verification.viewQueue": { grants: ["BO_VERIFIER", "BO_SUPERVISOR", "BO_SUPPORT", "ADMIN"] },
  "verification.decide": {
    grants: ["BO_VERIFIER", "BO_SUPERVISOR"],
    conditions: "reason required for integration and exclusion",
  },
  "verification.excludeAgency": {
    grants: ["BO_VERIFIER", "BO_SUPERVISOR"],
    conditions: "with reason",
  },
  "auction.viewStatus": {
    grants: [...BACK_OFFICE, "ADMIN", "PRIVATE", ...BROKER_USERS, ...AGENCY_USERS],
    conditions:
      "never prices before closing (BC-01); requester counters only; agency own invitation",
  },
  "auction.manage": {
    grants: ["BO_VERIFIER", "BO_SUPERVISOR"],
    conditions: "extend, invite (first half only, ASTA-06), cancel; always with reason",
  },
  /** Reading another organization's offer before closing: nobody, ADMIN included (BC-01). */
  "offer.readSealed": { grants: [] },

  // Offers and reconfirmations
  "claim.manage": {
    grants: AGENCY_USERS,
    conditions: "claim, release, decline; operator within own filters; OFF-02, OFF-03",
  },
  "claim.override": { grants: ["AGENCY_OWNER", "AGENCY_SUPERVISOR"] },
  "offer.submit": {
    grants: AGENCY_USERS,
    conditions: "submit, edit, withdraw until closing (OFF-07); claim holder, owner or supervisor",
  },
  "offer.readOwnDuringAuction": {
    grants: AGENCY_USERS,
    conditions: "only the offer the user made; owner copy, logged (BC-04)",
  },
  "offer.readColleagueDuringAuction": {
    grants: [
      "AGENCY_OWNER",
      "AGENCY_SUPERVISOR",
      { role: "AGENCY_OPERATOR", flag: "canSeeColleagueOffers" },
    ],
    conditions: "same agency only; owner copy, logged (BC-04)",
  },
  "reconfirmation.respond": {
    grants: AGENCY_USERS,
    conditions: "as offer.submit, within the deadline (GAR-07)",
  },
  "offer.excludeAfterPdfCheck": {
    grants: ["BO_VERIFIER", "BO_SUPERVISOR"],
    conditions: "until the customer accepted it (OFF-09)",
  },
  "offer.viewAllAfterClose": {
    grants: [...BACK_OFFICE, "ADMIN"],
    conditions: "only after closing",
  },
  "ranking.view": {
    grants: AGENCY_USERS,
    conditions: "after publication (CLA-02); operator only own offers",
  },
  "agencyFilters.manage": {
    grants: ["AGENCY_OWNER", "AGENCY_SUPERVISOR"],
    conditions: "filters and capacity",
  },
  "memberFilters.manageOwn": {
    grants: AGENCY_USERS,
    conditions: "only narrowing the agency filters",
  },
  "productLibrary.manage": {
    grants: ["AGENCY_OWNER", "AGENCY_SUPERVISOR"],
    conditions: "only companies with a verified mandate",
  },

  // Acceptance, payment, issuance
  "offers.viewPresented": {
    grants: ["PRIVATE", ...ORG_REQUESTERS, "BROKER_CLIENT_LINK"],
    conditions: "PRES rules; link only for the offers the broker sent",
  },
  "aiComparison.use": { grants: ["PRIVATE"], conditions: "PRES-06" },
  "customerLink.send": { grants: ORG_REQUESTERS },
  "offer.accept": {
    grants: ["PRIVATE", "BROKER_CLIENT_LINK"],
    conditions: "accept, sign, pay; own request; GAR-04",
  },
  "reconfirmation.request": {
    grants: ["PRIVATE", ...ORG_REQUESTERS],
    conditions: "requester only (GAR-06)",
  },
  "issuance.manage": {
    grants: ISSUERS,
    conditions: "winning agency only: see «Da emettere», upload, mark issued, report a problem",
  },
  "issuance.decideMissed": { grants: ["BO_VERIFIER", "BO_SUPERVISOR"], conditions: "EMI-04" },
  "refund.request": { grants: ["BO_SUPPORT", "BO_ACCOUNTING", "BO_SUPERVISOR"] },
  "refund.approve": { grants: ["BO_SUPERVISOR"], conditions: "PAG-05" },
  "withdrawal.request": {
    grants: ["PRIVATE", ...ORG_REQUESTERS],
    conditions:
      "own policy, within withdrawal.days (PAG-04); broker operator own customers (VIS-13)",
  },
  "withdrawal.manage": { grants: ["BO_SUPPORT", "BO_SUPERVISOR"], conditions: "PAG-04" },
  "withdrawal.indicateRefundablePremium": {
    grants: ISSUERS,
    conditions: "winning agency only (PAG-04)",
  },

  // Accounting and penalties
  "accounting.view": { grants: ["BO_ACCOUNTING", "BO_SUPERVISOR", "BO_SUPPORT", "ADMIN"] },
  "remittance.execute": { grants: ["BO_ACCOUNTING", "BO_SUPERVISOR"] },
  "payment.reconcile": {
    grants: ["BO_ACCOUNTING", "BO_SUPERVISOR"],
    conditions: "statement import, matching, the queue",
  },
  "accounting.agencyStatement": { grants: AGENCY_ACCOUNTING },
  // ADR 0015: the agency that requests quotes has the same statement of its fees.
  "accounting.brokerStatement": { grants: ["BROKER_OWNER", "AGENCY_OWNER"] },
  "invoice.viewOwn": {
    grants: ["PRIVATE", ...AGENCY_ACCOUNTING, "BROKER_OWNER"],
    conditions: "recipient of the invoice only",
  },
  "penalty.propose": {
    grants: ["BO_VERIFIER", "BO_SUPERVISOR"],
    conditions: "the system may also propose",
  },
  "penalty.apply": { grants: ["BO_SUPERVISOR"] },
  "penalty.contest": { grants: AGENCY_ACCOUNTING, conditions: "within the deadline (EMI-05)" },
  "penalty.decideContest": { grants: ["ADMIN"] },
  "organization.exclude": { grants: ["ADMIN"] },

  // Organizations, users, control
  "team.manage": {
    grants: ["AGENCY_OWNER", "BROKER_OWNER"],
    conditions: "invite, suspend, remove users and grant flags in the own organization",
  },
  "organization.editProfile": {
    grants: ["AGENCY_OWNER", "BROKER_OWNER"],
    conditions: "IBAN changes need an OTP and are logged",
  },
  "organization.approveOnboarding": { grants: ["BO_SUPERVISOR"], conditions: "with reason" },
  "organization.suspend": {
    grants: ["BO_SUPERVISOR", "ADMIN"],
    conditions: "suspend and reactivate, with reason",
  },
  "accessLog.viewOwnAgency": { grants: ["AGENCY_OWNER"], conditions: "VIS-08" },
  "accessLog.viewCustomer": { grants: ["BO_SUPPORT", "BO_SUPERVISOR", "ADMIN"] },
  "auditLog.viewAll": { grants: ["BO_SUPERVISOR", "ADMIN"] },
  "support.tickets": { grants: ["BO_SUPPORT", "BO_SUPERVISOR"] },
  "complaint.open": { grants: ["PRIVATE"], conditions: "own area only" },
  "complaint.register": {
    grants: ["BO_SUPPORT", "BO_SUPERVISOR"],
    conditions: "complaints received by email, PEC, post or phone",
  },
  "complaint.manage": { grants: ["BO_SUPERVISOR"] },
  "dataSubjectRequest.manage": {
    grants: ["BO_SUPPORT", "BO_SUPERVISOR"],
    conditions: "within legal terms",
  },

  // Administration
  "admin.settings.manage": {
    grants: ["ADMIN"],
    conditions: "auction, economy, penalties, AI weights; before/after, author and reason logged",
  },
  "admin.catalog.manage": {
    grants: ["ADMIN"],
    conditions: "packages, exclusions, lists, holidays",
  },
  "admin.legal.manage": { grants: ["ADMIN"] },
  "admin.notifications.manage": { grants: ["ADMIN"], conditions: "templates and group messages" },
  "admin.users.manage": {
    grants: ["ADMIN"],
    conditions: "block, unblock, reset second factor, back office roles",
  },
  "admin.reports.view": {
    grants: ["ADMIN"],
    conditions: "integration status, reports and exports",
  },
  "devTools.use": {
    grants: ["BO_VERIFIER", "BO_SUPERVISOR", "ADMIN"],
    conditions: "only with DEV_TOOLS=true, never in production (rule 13)",
  },
} as const satisfies Record<string, ActionRule>;

export type Action = keyof typeof PERMISSIONS;
export const ACTIONS = Object.keys(PERMISSIONS) as Action[];

export function isAction(value: string): value is Action {
  return Object.hasOwn(PERMISSIONS, value);
}
