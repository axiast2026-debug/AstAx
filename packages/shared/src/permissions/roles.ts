/** Roles stored on a `Membership` (docs/permessi.md, «Ruoli»). */
export const MEMBERSHIP_ROLES = [
  "OWNER",
  "SUPERVISOR",
  "OPERATOR",
  "BO_VERIFIER",
  "BO_SUPPORT",
  "BO_ACCOUNTING",
  "BO_SUPERVISOR",
  "ADMIN",
] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const ORGANIZATION_TYPES = ["AGENCY", "BROKER", "ASTAX"] as const;
export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

/** Extra permissions an owner grants on a membership. */
export const MEMBERSHIP_FLAGS = [
  "canIssue",
  "canSeeColleagueOffers",
  "canSeeAccounting",
  "seesAllClients",
] as const;
export type MembershipFlag = (typeof MEMBERSHIP_FLAGS)[number];
export type MembershipFlags = Readonly<Record<MembershipFlag, boolean>>;

/**
 * The role as the permission map sees it: a membership role read
 * together with the type of its organization.
 */
export const ACTOR_ROLES = [
  "PRIVATE",
  "BROKER_CLIENT_LINK",
  "BROKER_OWNER",
  "BROKER_OPERATOR",
  "AGENCY_OWNER",
  "AGENCY_SUPERVISOR",
  "AGENCY_OPERATOR",
  "BO_VERIFIER",
  "BO_SUPPORT",
  "BO_ACCOUNTING",
  "BO_SUPERVISOR",
  "ADMIN",
] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

export type Actor =
  | { kind: "PRIVATE" }
  | { kind: "BROKER_CLIENT_LINK" }
  | {
      kind: "MEMBER";
      role: MembershipRole;
      organizationType: OrganizationType;
      flags: MembershipFlags;
      /**
       * The organization is a section E intermediary (sub-agent of an agent,
       * collaborator of a broker) registered on its own: the powers of its
       * principal, without a team (Dan, 2026-10-30, ADR 0026).
       */
      sectionE?: boolean;
    };

const MEMBER_ROLES: Record<OrganizationType, Partial<Record<MembershipRole, ActorRole>>> = {
  BROKER: { OWNER: "BROKER_OWNER", OPERATOR: "BROKER_OPERATOR" },
  AGENCY: { OWNER: "AGENCY_OWNER", SUPERVISOR: "AGENCY_SUPERVISOR", OPERATOR: "AGENCY_OPERATOR" },
  ASTAX: {
    BO_VERIFIER: "BO_VERIFIER",
    BO_SUPPORT: "BO_SUPPORT",
    BO_ACCOUNTING: "BO_ACCOUNTING",
    BO_SUPERVISOR: "BO_SUPERVISOR",
    ADMIN: "ADMIN",
  },
};

/** `null` for a combination that does not exist (e.g. a supervisor of a broker): always denied. */
export function actorRoleOf(actor: Actor): ActorRole | null {
  if (actor.kind !== "MEMBER") return actor.kind;
  return MEMBER_ROLES[actor.organizationType][actor.role] ?? null;
}

export const NO_FLAGS: MembershipFlags = {
  canIssue: false,
  canSeeColleagueOffers: false,
  canSeeAccounting: false,
  seesAllClients: false,
};
