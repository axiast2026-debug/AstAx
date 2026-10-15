import type { KeycloakAdmin } from "@astax/adapters/identity";

/** What the API needs from Keycloak administration; tests provide an in-memory double. */
export type IdentityAdmin = Pick<
  KeycloakAdmin,
  | "listSessions"
  | "deleteSession"
  | "logoutUser"
  | "findUserByEmail"
  | "realmRoles"
  | "createUser"
  | "addRealmRoles"
  | "executeActionsEmail"
  | "updateRealm"
  | "updateClientAttributes"
  | "updateAuthenticatorConfig"
>;
