import { Writable } from "node:stream";
import { ManualClock } from "@astax/adapters/clock";
import { InMemoryEmailSender } from "@astax/adapters/email";
import { InMemoryObjectStorage } from "@astax/adapters/storage";
import type { KeycloakSession } from "@astax/adapters/identity";
import { createDbClient, type DbClient } from "@astax/db";
import { SYNTHETIC, syntheticId } from "@astax/db/seed";
import { createLogger } from "@astax/shared/logging";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { inject } from "vitest";
import { createApp } from "../../src/app.js";
import { RecordingWorkflowSignals } from "../../src/auctions/workflow-signals.js";
import { JwtTokenVerifier } from "../../src/auth/token-verifier.js";
import { loadConfig } from "../../src/config/config.js";
import type { IdentityAdmin } from "../../src/identity/identity-admin.js";

export const TEST_SEED = "api-int";
export const TEST_CIPHER_KEYS = { encryption: "3".repeat(64), blindIndex: "4".repeat(64) };
export const ISSUER = "http://keycloak.test/realms/astax";

export type UserKey = (typeof SYNTHETIC.users)[number]["key"];
export const userId = (key: string) => syntheticId(TEST_SEED, "user", key);
export const orgId = (key: string) => syntheticId(TEST_SEED, "org", key);
export const membershipId = (user: string, org: string) =>
  syntheticId(TEST_SEED, "membership", `${user}@${org}`);

/** Keycloak administration double: records calls, keeps sessions in memory. */
export class FakeIdentityAdmin implements IdentityAdmin {
  readonly calls: { method: string; args: unknown[] }[] = [];
  readonly sessions = new Map<string, KeycloakSession[]>();
  readonly users = new Map<string, string>();

  private track(method: string, ...args: unknown[]) {
    this.calls.push({ method, args });
  }
  async listSessions(userId: string) {
    this.track("listSessions", userId);
    return this.sessions.get(userId) ?? [];
  }
  async deleteSession(sessionId: string) {
    this.track("deleteSession", sessionId);
    for (const [user, list] of this.sessions)
      this.sessions.set(
        user,
        list.filter((s) => s.id !== sessionId),
      );
  }
  async logoutUser(userId: string) {
    this.track("logoutUser", userId);
    this.sessions.set(userId, []);
  }
  async findUserByEmail(email: string) {
    this.track("findUserByEmail", email);
    const id = this.users.get(email);
    return id ? { id, username: email, email, enabled: true } : undefined;
  }
  async createUser(user: {
    email: string;
    firstName: string;
    lastName: string;
    requiredActions?: string[];
  }) {
    this.track("createUser", user);
    const id = `kc-new-${this.users.size + 1}`;
    this.users.set(user.email, id);
    return id;
  }
  /** Realm roles by Keycloak id; users added by hand in a test are professionals unless set here. */
  readonly roles = new Map<string, string[]>();

  async realmRoles(userId: string) {
    this.track("realmRoles", userId);
    return this.roles.get(userId) ?? ["astax-professional"];
  }
  async addRealmRoles(userId: string, roles: string[]) {
    this.track("addRealmRoles", userId, roles);
    this.roles.set(userId, [...(this.roles.get(userId) ?? []), ...roles]);
  }
  async executeActionsEmail(userId: string, actions: string[], options: unknown) {
    this.track("executeActionsEmail", userId, actions, options);
  }
  async updateRealm(settings: Record<string, unknown>) {
    this.track("updateRealm", settings);
  }
  async updateClientAttributes(clientId: string, attributes: Record<string, string>) {
    this.track("updateClientAttributes", clientId, attributes);
  }
  async updateAuthenticatorConfig(id: string, alias: string, config: Record<string, string>) {
    this.track("updateAuthenticatorConfig", id, alias, config);
  }
}

const KIND_TOKEN = {
  PRIVATE: { azp: "astax-web-private", role: "astax-private" },
  PROFESSIONAL: { azp: "astax-web-pro", role: "astax-professional" },
  STAFF: { azp: "astax-admin", role: "astax-staff" },
} as const;

export interface Harness {
  app: NestExpressApplication;
  baseUrl: string;
  clock: ManualClock;
  identity: FakeIdentityAdmin;
  email: InMemoryEmailSender;
  db: DbClient;
  /** Signals to the workflows, recorded instead of sent (ADR 0008). */
  signals: RecordingWorkflowSignals;
  /** Documents and sealed PDFs, in memory. */
  storage: InMemoryObjectStorage;
  /** Signed access token, as Keycloak would issue it. */
  token(
    claims: {
      sub: string;
      azp: string;
      roles: string[];
      email?: string;
      givenName?: string;
      familyName?: string;
    },
    signWithOtherKey?: boolean,
  ): Promise<string>;
  /** Token of a synthetic user, from the client of its kind. */
  tokenFor(key: UserKey): Promise<string>;
  call(
    path: string,
    options?: {
      token?: string;
      context?: string;
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
    },
  ): Promise<Response>;
  close(): Promise<void>;
}

export async function startHarness(
  options: { env?: Record<string, string> } = {},
): Promise<Harness> {
  const clock = new ManualClock("2026-11-16T09:00:00.000Z");
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: "test", alg: "RS256" };
  const verifier = new JwtTokenVerifier(createLocalJWKSet({ keys: [jwk] }), ISSUER, clock);
  const identity = new FakeIdentityAdmin();
  const email = new InMemoryEmailSender();
  const signals = new RecordingWorkflowSignals();
  const storage = new InMemoryObjectStorage();
  const dbUrl = inject("apiDbUrl");
  const db = createDbClient(dbUrl);

  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: dbUrl,
    FIELD_ENCRYPTION_KEY: TEST_CIPHER_KEYS.encryption,
    BLIND_INDEX_KEY: TEST_CIPHER_KEYS.blindIndex,
    OFFER_OWNER_MASTER_KEY: "7".repeat(64),
    KEYCLOAK_URL: "http://keycloak.test",
    KEYCLOAK_API_ADMIN_SECRET: "test-secret-not-used-0000",
    IDENTITY_SYNC_ON_START: "false",
    ...options.env,
  });
  const app = await createApp(config, {
    clock,
    db,
    identityAdmin: identity,
    emailSender: email,
    workflowSignals: signals,
    objectStorage: storage,
    tokenVerifier: verifier,
    // API_TEST_LOGS=1 shows the (redacted) API logs while debugging a test.
    logger: process.env.API_TEST_LOGS
      ? createLogger({ name: "api-int", level: "debug" })
      : createLogger({
          name: "api-int",
          destination: new Writable({ write: (_c, _e, cb) => cb() }),
        }),
  });
  await app.listen(0, "127.0.0.1");
  const baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;

  const token: Harness["token"] = async (claims, signWithOtherKey = false) => {
    const now = Math.floor(clock.now().getTime() / 1000);
    return new SignJWT({
      azp: claims.azp,
      realm_access: { roles: claims.roles },
      email: claims.email,
      email_verified: claims.email !== undefined,
      given_name: claims.givenName,
      family_name: claims.familyName,
    })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setSubject(claims.sub)
      .setIssuer(ISSUER)
      .setAudience(["astax-api", "account"])
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(signWithOtherKey ? other.privateKey : privateKey);
  };

  const tokenFor: Harness["tokenFor"] = (key) => {
    const user = SYNTHETIC.users.find((u) => u.key === key);
    if (!user) throw new Error(`Unknown synthetic user ${key}`);
    const binding = KIND_TOKEN[user.kind];
    return token({ sub: `kc-${key}`, azp: binding.azp, roles: [binding.role], email: user.email });
  };

  const call: Harness["call"] = (path, options = {}) =>
    fetch(`${baseUrl}${path}`, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers: {
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.context ? { "x-astax-context": options.context } : {}),
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        "user-agent": "vitest-int",
        ...options.headers,
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });

  return {
    app,
    baseUrl,
    clock,
    identity,
    email,
    db,
    signals,
    storage,
    token,
    tokenFor,
    call,
    close: async () => {
      await app.close();
    },
  };
}

/** Accepts every pending legal text for a user, so other tests can proceed (LEG-02). */
export async function acceptAllLegal(h: Harness, key: UserKey): Promise<void> {
  const token = await h.tokenFor(key);
  const pending = (await (await h.call("/legal/pending", { token })).json()) as {
    versionId: string;
  }[];
  if (pending.length === 0) return;
  const response = await h.call("/legal/acceptances", {
    token,
    body: { versionIds: pending.map((p) => p.versionId) },
  });
  if (response.status !== 201) throw new Error(`Legal acceptance failed with ${response.status}`);
}
