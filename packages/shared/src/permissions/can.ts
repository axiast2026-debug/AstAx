import { isAction, PERMISSIONS, type ActionRule, type Grant } from "./map.js";
import { actorRoleOf, type Actor, type ActorRole } from "./roles.js";

function grantAllows(grant: Grant, role: ActorRole, actor: Actor): boolean {
  if (typeof grant === "string") return grant === role;
  return grant.role === role && actor.kind === "MEMBER" && actor.flags[grant.flag];
}

/**
 * Role-and-flag check with default deny (SIC-01): an unknown action, an
 * impossible role or a missing flag means no. Data conditions (own request,
 * filters, auction state) are enforced by the use case on top of this.
 */
export function can(actor: Actor, action: string): boolean {
  if (!isAction(action)) return false;
  const role = actorRoleOf(actor);
  if (role === null) return false;
  const rule: ActionRule = PERMISSIONS[action];
  if (rule.notForSectionE && actor.kind === "MEMBER" && actor.sectionE) return false;
  const grants: readonly Grant[] = rule.grants;
  return grants.some((grant) => grantAllows(grant, role, actor));
}
