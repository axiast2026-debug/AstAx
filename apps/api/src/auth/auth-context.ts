import { KEYCLOAK_CLIENTS } from "@astax/adapters/identity";
import type { DbContext } from "@astax/db";
import type {
  Actor,
  MembershipFlags,
  MembershipRole,
  OrganizationType,
} from "@astax/shared/permissions";
import type { Request } from "express";

export type UserKind = "PRIVATE" | "PROFESSIONAL" | "STAFF";

export const CONTEXT_HEADER = "x-astax-context";

/** Realm role and Keycloak client each kind of user must come with (ADR 0002). */
export const KIND_BINDINGS: Record<UserKind, { role: string; client: string }> = {
  PRIVATE: { role: "astax-private", client: KEYCLOAK_CLIENTS.private },
  PROFESSIONAL: { role: "astax-professional", client: KEYCLOAK_CLIENTS.professional },
  STAFF: { role: "astax-staff", client: KEYCLOAK_CLIENTS.staff },
};

/**
 * Kind of user proven by the token: exactly one AstAx role, issued to the
 * client of that kind. A private token from the professional client, or a
 * professional token from the private one, proves nothing.
 */
export function kindFromToken(token: { azp: string; roles: string[] }): UserKind | null {
  const kinds = (Object.keys(KIND_BINDINGS) as UserKind[]).filter((kind) =>
    token.roles.includes(KIND_BINDINGS[kind].role),
  );
  if (kinds.length !== 1) return null;
  const kind = kinds[0] as UserKind;
  return KIND_BINDINGS[kind].client === token.azp ? kind : null;
}

export interface ActiveMembership {
  id: string;
  organizationId: string;
  organizationType: OrganizationType;
  role: MembershipRole;
  flags: MembershipFlags;
}

/** Who is calling, resolved by the AuthGuard and attached to the request. */
export interface AuthContext {
  userId: string;
  keycloakId: string;
  kind: UserKind;
  /** Null for privates and for professional calls that need no context. */
  membership: ActiveMembership | null;
  actor: Actor;
  /** Context for row level security in every transaction of this request. */
  db: DbContext;
  ip: string | null;
  userAgent: string | null;
}

export type AuthenticatedRequest = Request & { auth?: AuthContext };
