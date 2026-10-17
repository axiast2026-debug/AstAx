import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { SystemClock } from "@astax/adapters/clock";
import { LocalFieldCipher } from "@astax/adapters/crypto";
import { KeycloakAdmin, KeycloakAdminError } from "@astax/adapters/identity";
import { createDbClient, SYSTEM_CONTEXT, withContext } from "@astax/db";
import { DEFAULT_SYNTHETIC_SEED, syntheticId } from "@astax/db/seed";
import { loadEnv } from "@astax/shared/env";
import type { E2eState } from "./support/auth.js";

/**
 * Dedicated E2E users, recreated on every run with a fresh random password and
 * no TOTP, so each test goes through the first-login TOTP setup. The synthetic
 * users of the demo are never touched. Local development environment only.
 */
const E2E_USERS = [
  {
    key: "owner",
    email: "e2e.titolare@agenzia-uno.test",
    firstName: "Titolare",
    lastName: "E2E",
    kind: "PROFESSIONAL" as const,
    memberships: [{ org: "agenzia-uno", role: "OWNER" as const }],
  },
  {
    key: "marco",
    email: "e2e.marco@collaboratori.test",
    firstName: "Marco",
    lastName: "E2E",
    kind: "PROFESSIONAL" as const,
    memberships: [
      { org: "agenzia-uno", role: "OPERATOR" as const },
      { org: "agenzia-tre", role: "OPERATOR" as const },
    ],
  },
  {
    // S10: Marco's colleague in Agenzia Tre.
    key: "sofia",
    email: "e2e.sofia@agenzia-tre.test",
    firstName: "Sofia",
    lastName: "E2E",
    kind: "PROFESSIONAL" as const,
    memberships: [{ org: "agenzia-tre", role: "OPERATOR" as const }],
  },
  {
    // S06: the owner of Agenzia Cinque, who offers Beta at the same price as Tre.
    key: "cinque",
    email: "e2e.titolare@agenzia-cinque.test",
    firstName: "Titolare",
    lastName: "Cinque E2E",
    kind: "PROFESSIONAL" as const,
    memberships: [{ org: "agenzia-cinque", role: "OWNER" as const }],
  },
  {
    key: "admin",
    email: "e2e.admin@astax.test",
    firstName: "Admin",
    lastName: "E2E",
    kind: "STAFF" as const,
    memberships: [{ org: "astax", role: "ADMIN" as const }],
  },
  {
    key: "verifier",
    email: "e2e.verifica@astax.test",
    firstName: "Verifica",
    lastName: "E2E",
    kind: "STAFF" as const,
    memberships: [{ org: "astax", role: "BO_VERIFIER" as const }],
  },
  {
    // Phase 6: the supervisor approves the refunds (PAG-05).
    key: "supervisor",
    email: "e2e.supervisore@astax.test",
    firstName: "Supervisore",
    lastName: "E2E",
    kind: "STAFF" as const,
    memberships: [{ org: "astax", role: "BO_SUPERVISOR" as const }],
  },
  {
    // S05: the owner of Agenzia Tre issues the second offer.
    key: "tre",
    email: "e2e.titolare@agenzia-tre.test",
    firstName: "Titolare",
    lastName: "Tre E2E",
    kind: "PROFESSIONAL" as const,
    memberships: [{ org: "agenzia-tre", role: "OWNER" as const }],
  },
  {
    // Phase 6: the broker's owner sees the statement (CONT-05).
    key: "brokerOwner",
    email: "e2e.titolare@broker-demo.test",
    firstName: "Titolare",
    lastName: "Broker E2E",
    kind: "PROFESSIONAL" as const,
    memberships: [{ org: "broker-demo", role: "OWNER" as const }],
  },
  {
    key: "broker",
    email: "e2e.paolo@broker-demo.test",
    firstName: "Paolo",
    lastName: "E2E",
    kind: "PROFESSIONAL" as const,
    memberships: [{ org: "broker-demo", role: "OPERATOR" as const }],
  },
];

const emailOf = (key: string): string => {
  const user = E2E_USERS.find((u) => u.key === key);
  if (!user) throw new Error(`No E2E user ${key}`);
  return user.email;
};

const ROLE = { PROFESSIONAL: "astax-professional", STAFF: "astax-staff" } as const;

export default async function globalSetup(): Promise<void> {
  loadEnv(import.meta.dirname);
  if (process.env.NODE_ENV === "production") throw new Error("E2E never runs against production");
  const env = (name: string) => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not set: run pnpm env:init`);
    return value;
  };
  const clock = new SystemClock();
  const admin = new KeycloakAdmin({
    baseUrl: env("KEYCLOAK_URL"),
    realm: env("KEYCLOAK_REALM"),
    clientId: "astax-api-admin",
    clientSecret: env("KEYCLOAK_API_ADMIN_SECRET"),
    now: () => clock.now().getTime(),
  });
  const cipher = new LocalFieldCipher(env("FIELD_ENCRYPTION_KEY"), env("BLIND_INDEX_KEY"));
  const db = createDbClient(env("DATABASE_URL"));
  const seed = process.env.SYNTHETIC_SEED ?? DEFAULT_SYNTHETIC_SEED;
  const password = `E2e-${randomBytes(18).toString("base64url")}`;

  try {
    for (const user of E2E_USERS) {
      let keycloakId = (await admin.findUserByEmail(user.email))?.id;
      if (!keycloakId) {
        keycloakId = await admin.createUser({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        });
      }
      try {
        await admin.addRealmRoles(keycloakId, [ROLE[user.kind]]);
      } catch (error) {
        if (!(error instanceof KeycloakAdminError && error.status === 409)) throw error;
      }
      await admin.setPassword(keycloakId, password, false);
      await admin.removeCredentials(keycloakId, "otp");
      await admin.logoutUser(keycloakId);

      const id = syntheticId(seed, "user", `e2e-${user.key}`);
      await withContext(db, SYSTEM_CONTEXT, async (tx) => {
        await tx.user.upsert({
          where: { id },
          create: {
            id,
            keycloakId,
            kind: user.kind,
            firstName: user.firstName,
            lastName: user.lastName,
            emailEnc: cipher.encrypt(user.email),
            emailHash: cipher.blindIndex("email", user.email),
          },
          update: { keycloakId, status: "ACTIVE", locale: "it" },
        });
        for (const m of user.memberships) {
          const organizationId = syntheticId(seed, "org", m.org);
          await tx.membership.upsert({
            where: { userId_organizationId: { userId: id, organizationId } },
            create: { userId: id, organizationId, role: m.role },
            update: { role: m.role, status: "ACTIVE" },
          });
        }
      });
    }
  } finally {
    await db.$disconnect();
  }

  mkdirSync(new URL("./.state/", import.meta.url), { recursive: true });
  const state: E2eState = {
    password,
    users: {
      owner: emailOf("owner"),
      marco: emailOf("marco"),
      sofia: emailOf("sofia"),
      cinque: emailOf("cinque"),
      tre: emailOf("tre"),
      admin: emailOf("admin"),
      verifier: emailOf("verifier"),
      supervisor: emailOf("supervisor"),
      broker: emailOf("broker"),
      brokerOwner: emailOf("brokerOwner"),
    },
  };
  // OTP was just removed for every E2E user: no saved secret is valid any more.
  writeFileSync(new URL("./.state/totp.json", import.meta.url), "{}", { mode: 0o600 });
  writeFileSync(new URL("./.state/users.json", import.meta.url), JSON.stringify(state), {
    mode: 0o600,
  });
}
