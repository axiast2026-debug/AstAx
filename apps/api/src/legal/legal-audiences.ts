import type { MembershipRole, OrganizationType } from "@astax/shared/permissions";
import type { UserKind } from "../auth/auth-context.js";

export type LegalAudience = "PRIVATE" | "BROKER" | "AGENCY" | "SUB_AGENT" | "STAFF" | "ALL";
export type LegalMoment =
  | "FIRST_ACCESS"
  | "REGISTRATION"
  | "ONBOARDING"
  | "BEFORE_REQUEST"
  | "ACCEPTANCE"
  | "FIRST_SIGNATURE";

/**
 * Documents to accept before using the platform at all (LEG-02). The others
 * (consent before a request, MUP and engagement letter at acceptance, FEA terms)
 * are accepted inside their own processes, in later phases.
 */
export const BLOCKING_MOMENTS: readonly LegalMoment[] = [
  "FIRST_ACCESS",
  "REGISTRATION",
  "ONBOARDING",
];

/**
 * Who signs what (spec 09 §7): the owner signs for the organization; supervisors
 * and operators of agencies and brokers accept the professional terms as
 * collaborators (sub-agent audience).
 */
export function legalAudiences(
  kind: UserKind,
  memberships: readonly { role: MembershipRole; organizationType: OrganizationType }[],
): Set<LegalAudience> {
  const audiences = new Set<LegalAudience>(["ALL"]);
  if (kind === "PRIVATE") audiences.add("PRIVATE");
  if (kind === "STAFF") audiences.add("STAFF");
  if (kind === "PROFESSIONAL") {
    for (const m of memberships) {
      if (m.role !== "OWNER") audiences.add("SUB_AGENT");
      else if (m.organizationType === "AGENCY") audiences.add("AGENCY");
      else if (m.organizationType === "BROKER") audiences.add("BROKER");
    }
  }
  return audiences;
}
