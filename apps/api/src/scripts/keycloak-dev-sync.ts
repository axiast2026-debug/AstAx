// pnpm keycloak:sync — development only.
// Creates the synthetic users of the seed in Keycloak (professionals and staff
// with the password DEV_USERS_PASSWORD from .env and TOTP to configure at first
// login; privates without password), links them to the database and applies
// the session and OTP parameters. Safe to run again.
import { KeycloakAdmin, KeycloakAdminError } from "@astax/adapters/identity";
import { createDbClient, SYSTEM_CONTEXT, withContext } from "@astax/db";
import { SYNTHETIC, syntheticId, DEFAULT_SYNTHETIC_SEED } from "@astax/db/seed";
import { loadEnv } from "@astax/shared/env";
import { requireSettingAt, type SettingVersion } from "@astax/shared/settings";
import { SystemClock } from "@astax/adapters/clock";
import {
  applyIdentitySettings,
  IDENTITY_SETTING_KEYS,
  type IdentitySettingValues,
} from "../identity/apply-identity-settings.js";

loadEnv(import.meta.dirname);
const env = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: run pnpm env:init`);
  return value;
};
if (process.env.NODE_ENV === "production") throw new Error("keycloak:sync is a development tool");

const clock = new SystemClock();
const admin = new KeycloakAdmin({
  baseUrl: env("KEYCLOAK_URL"),
  realm: env("KEYCLOAK_REALM"),
  clientId: "astax-api-admin",
  clientSecret: env("KEYCLOAK_API_ADMIN_SECRET"),
  now: () => clock.now().getTime(),
});
const db = createDbClient(env("DATABASE_URL"));
const seed = process.env.SYNTHETIC_SEED ?? DEFAULT_SYNTHETIC_SEED;
const devPassword = env("DEV_USERS_PASSWORD");

const ROLE_BY_KIND = {
  PRIVATE: "astax-private",
  PROFESSIONAL: "astax-professional",
  STAFF: "astax-staff",
} as const;

try {
  let created = 0;
  for (const user of SYNTHETIC.users) {
    let keycloakId = (await admin.findUserByEmail(user.email))?.id;
    if (!keycloakId) {
      keycloakId = await admin.createUser({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        // The professional flow asks for TOTP setup on the first login anyway (OTP form REQUIRED).
        requiredActions: user.kind === "PRIVATE" ? [] : ["CONFIGURE_TOTP"],
      });
      if (user.kind !== "PRIVATE") await admin.setPassword(keycloakId, devPassword, false);
      created += 1;
    }
    try {
      await admin.addRealmRoles(keycloakId, [ROLE_BY_KIND[user.kind]]);
    } catch (error) {
      if (!(error instanceof KeycloakAdminError && error.status === 409)) throw error;
    }
    const id = syntheticId(seed, "user", user.key);
    await withContext(db, SYSTEM_CONTEXT, (tx) =>
      tx.user.update({ where: { id }, data: { keycloakId } }),
    );
  }

  const versions = await withContext(db, SYSTEM_CONTEXT, (tx) =>
    tx.setting.findMany({ where: { key: { in: [...IDENTITY_SETTING_KEYS] } } }),
  );
  const at = clock.now();
  const values = Object.fromEntries(
    IDENTITY_SETTING_KEYS.map((key) => [
      key,
      requireSettingAt(versions as unknown as SettingVersion[], key, at),
    ]),
  ) as unknown as IdentitySettingValues;
  await applyIdentitySettings(admin, values);

  console.log(
    `Keycloak synced: ${SYNTHETIC.users.length} users (${created} created), session and OTP parameters applied.`,
  );
} finally {
  await db.$disconnect();
}
