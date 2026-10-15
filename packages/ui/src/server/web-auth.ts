import { randomBytes } from "node:crypto";
import type { Clock } from "@astax/adapters/clock";
import * as oidc from "openid-client";

/**
 * Login and sessions of the web apps, on the server only (ADR 0004): the
 * browser holds an opaque session cookie; tokens stay in the session store and
 * every API call is made by the Next.js server with the user's access token.
 */
export type LoginKind = "private" | "pro" | "staff";

export interface WebSession {
  kind: LoginKind;
  accessToken: string;
  refreshToken: string;
  idToken: string | null;
  /** Milliseconds since epoch, from the Clock. */
  accessExpiresAt: number;
  refreshExpiresAt: number;
  /** Membership chosen in the context selector (X-AstAx-Context). */
  contextId: string | null;
}

/** Key-value store with expiry (Redis in the apps, in memory in tests). */
export interface SessionStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface WebAuthOptions {
  issuer: string;
  clients: Partial<Record<LoginKind, string>>;
  /** Absolute URL of the app's callback route. */
  redirectUri: string;
  postLogoutRedirectUri: string;
  apiUrl: string;
  store: SessionStore;
  clock: Clock;
  /** Injected in tests. */
  discover?: (clientId: string) => Promise<oidc.Configuration>;
}

export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired");
    this.name = "SessionExpiredError";
  }
}

const PENDING_TTL_SECONDS = 600;
const REFRESH_MARGIN_MS = 30_000;

interface PendingLogin {
  kind: LoginKind;
  codeVerifier: string;
}

export class WebAuth {
  readonly #configs = new Map<string, Promise<oidc.Configuration>>();

  constructor(private readonly options: WebAuthOptions) {}

  private clientId(kind: LoginKind): string {
    const clientId = this.options.clients[kind];
    if (!clientId) throw new Error(`Login kind ${kind} not available in this app`);
    return clientId;
  }

  private config(kind: LoginKind): Promise<oidc.Configuration> {
    const clientId = this.clientId(kind);
    let config = this.#configs.get(clientId);
    if (!config) {
      config = this.options.discover
        ? this.options.discover(clientId)
        : oidc.discovery(new URL(this.options.issuer), clientId, undefined, oidc.None(), {
            execute: this.options.issuer.startsWith("http://") ? [oidc.allowInsecureRequests] : [],
          });
      this.#configs.set(clientId, config);
      config.catch(() => this.#configs.delete(clientId));
    }
    return config;
  }

  /** Starts the authorization code flow with PKCE; returns where to send the browser. */
  async beginLogin(kind: LoginKind): Promise<string> {
    const config = await this.config(kind);
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const pending: PendingLogin = { kind, codeVerifier };
    await this.options.store.set(`login:${state}`, JSON.stringify(pending), PENDING_TTL_SECONDS);
    return oidc
      .buildAuthorizationUrl(config, {
        redirect_uri: this.options.redirectUri,
        scope: "openid",
        code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
        code_challenge_method: "S256",
        state,
      })
      .toString();
  }

  /** Completes the login from the callback URL; returns the new session id. */
  async completeLogin(callbackUrl: URL): Promise<string> {
    const state = callbackUrl.searchParams.get("state") ?? "";
    const raw = await this.options.store.get(`login:${state}`);
    if (!raw) throw new SessionExpiredError();
    await this.options.store.delete(`login:${state}`);
    const pending = JSON.parse(raw) as PendingLogin;
    const config = await this.config(pending.kind);
    const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: pending.codeVerifier,
      expectedState: state,
    });
    const session = this.toSession(pending.kind, tokens, null);
    const id = randomBytes(32).toString("base64url");
    await this.save(id, session);
    return id;
  }

  private toSession(
    kind: LoginKind,
    tokens: oidc.TokenEndpointResponse,
    contextId: string | null,
  ): WebSession {
    const now = this.options.clock.now().getTime();
    const refreshSeconds = Number(
      (tokens as { refresh_expires_in?: number }).refresh_expires_in ?? 0,
    );
    if (!tokens.refresh_token) throw new Error("No refresh token from the identity provider");
    return {
      kind,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token ?? null,
      accessExpiresAt: now + (tokens.expires_in ?? 60) * 1000,
      refreshExpiresAt: now + (refreshSeconds > 0 ? refreshSeconds : 3600) * 1000,
      contextId,
    };
  }

  private async save(id: string, session: WebSession): Promise<void> {
    const ttl = Math.max(
      1,
      Math.ceil((session.refreshExpiresAt - this.options.clock.now().getTime()) / 1000),
    );
    await this.options.store.set(`session:${id}`, JSON.stringify(session), ttl);
  }

  /** The session, with a fresh access token (renewed shortly before it expires). */
  async session(id: string | undefined): Promise<WebSession | null> {
    if (!id) return null;
    const raw = await this.options.store.get(`session:${id}`);
    if (!raw) return null;
    const session = JSON.parse(raw) as WebSession;
    const now = this.options.clock.now().getTime();
    if (session.accessExpiresAt - REFRESH_MARGIN_MS > now) return session;
    if (session.refreshExpiresAt <= now) {
      await this.options.store.delete(`session:${id}`);
      return null;
    }
    try {
      const tokens = await oidc.refreshTokenGrant(
        await this.config(session.kind),
        session.refreshToken,
      );
      const renewed = this.toSession(session.kind, tokens, session.contextId);
      await this.save(id, renewed);
      return renewed;
    } catch {
      // Revoked or idle beyond the session limits (SIC-05): log in again.
      await this.options.store.delete(`session:${id}`);
      return null;
    }
  }

  async setContext(id: string, contextId: string | null): Promise<void> {
    const session = await this.session(id);
    if (!session) throw new SessionExpiredError();
    await this.save(id, { ...session, contextId });
  }

  /** Calls the API as the user, with the active context. */
  async api(id: string | undefined, path: string, init: RequestInit = {}): Promise<Response> {
    const session = await this.session(id);
    if (!session) throw new SessionExpiredError();
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${session.accessToken}`);
    if (session.contextId) headers.set("x-astax-context", session.contextId);
    if (init.body !== undefined && !headers.has("content-type"))
      headers.set("content-type", "application/json");
    const response = await fetch(`${this.options.apiUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
    if (response.status === 401) throw new SessionExpiredError();
    return response;
  }

  /** Ends the session here and at the identity provider; returns where to send the browser. */
  async logout(id: string | undefined): Promise<string> {
    const session = await this.session(id);
    if (id) await this.options.store.delete(`session:${id}`);
    if (!session) return this.options.postLogoutRedirectUri;
    const url = oidc.buildEndSessionUrl(await this.config(session.kind), {
      post_logout_redirect_uri: this.options.postLogoutRedirectUri,
      ...(session.idToken ? { id_token_hint: session.idToken } : {}),
    });
    return url.toString();
  }
}
