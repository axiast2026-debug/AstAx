import type {
  MembershipFlag,
  MembershipFlags,
  MembershipRole,
  OrganizationType,
} from "../permissions/roles.js";

/** Roles an owner can give in their own organization (docs/permessi.md, «Abilitazioni»). */
export const ASSIGNABLE_ROLES: Record<OrganizationType, readonly MembershipRole[]> = {
  AGENCY: ["SUPERVISOR", "OPERATOR"],
  BROKER: ["OPERATOR"],
  ASTAX: [],
};

/** Each flag exists only for one role in one kind of organization. */
const FLAG_SCOPE: Record<
  MembershipFlag,
  { organizationType: OrganizationType; role: MembershipRole }
> = {
  canIssue: { organizationType: "AGENCY", role: "OPERATOR" },
  canSeeColleagueOffers: { organizationType: "AGENCY", role: "OPERATOR" },
  canSeeAccounting: { organizationType: "AGENCY", role: "SUPERVISOR" },
  seesAllClients: { organizationType: "BROKER", role: "OPERATOR" },
};

export type GrantProblem = "ROLE_NOT_ASSIGNABLE" | `FLAG_NOT_APPLICABLE:${MembershipFlag}`;

export function membershipGrantProblems(
  organizationType: OrganizationType,
  role: MembershipRole,
  flags: Partial<MembershipFlags>,
): GrantProblem[] {
  const problems: GrantProblem[] = [];
  if (!ASSIGNABLE_ROLES[organizationType].includes(role)) problems.push("ROLE_NOT_ASSIGNABLE");
  for (const [flag, enabled] of Object.entries(flags) as [MembershipFlag, boolean | undefined][]) {
    const scope = FLAG_SCOPE[flag];
    if (enabled && (scope.organizationType !== organizationType || scope.role !== role)) {
      problems.push(`FLAG_NOT_APPLICABLE:${flag}`);
    }
  }
  return problems;
}
