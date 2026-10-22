import "server-only";
import type {
  Actor,
  MembershipFlags,
  MembershipRole,
  OrganizationType,
} from "@astax/shared/permissions";
import { redirect } from "next/navigation";
import { api, webAuth, sessionId } from "./auth";

export interface Me {
  id: string;
  kind: "PRIVATE" | "PROFESSIONAL" | "STAFF";
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  memberships: {
    id: string;
    role: MembershipRole;
    organization: { id: string; name: string; type: OrganizationType };
    flags: MembershipFlags;
  }[];
}

export interface Viewer {
  me: Me;
  actor: Actor;
  activeMembership: Me["memberships"][number] | null;
}

/**
 * The logged-in user with the active context. Sends to the login page without
 * a session, to the legal page with texts to accept (LEG-02), to the context
 * choice when a professional works for several organizations.
 */
export async function requireViewer(
  options: { allowPendingLegal?: boolean } = {},
): Promise<Viewer> {
  const id = await sessionId();
  const session = await webAuth().session(id);
  if (!session) redirect("/");

  const { body: me } = await api<Me>("/me");
  if (!options.allowPendingLegal) {
    const { body: pending } = await api<unknown[]>("/legal/pending");
    if (pending.length > 0) redirect("/accetta-documenti");
  }
  if (me.kind === "PRIVATE") return { me, actor: { kind: "PRIVATE" }, activeMembership: null };

  let active = me.memberships.find((m) => m.id === session.contextId) ?? null;
  if (!active && me.memberships.length === 1 && id) {
    active = me.memberships[0] ?? null;
    await webAuth().setContext(id, active?.id ?? null);
  }
  // Staff belong to AstAx only: no context to choose.
  if (!active) redirect("/?scaduta=1");
  return {
    me,
    activeMembership: active,
    actor: {
      kind: "MEMBER",
      role: active.role,
      organizationType: active.organization.type,
      flags: active.flags,
    },
  };
}
