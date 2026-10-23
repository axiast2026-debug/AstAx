import { ManualClock } from "@astax/adapters/clock";
import { describe, expect, it } from "vitest";
import { MemorySessionStore } from "./redis-store.js";
import * as oidc from "openid-client";
import { WebAuth } from "./web-auth.js";

/**
 * Search terms (a fiscal code, a plate) stay on the server, never in a URL
 * (CLAUDE.md rule 8): they belong to the active context and go at logout.
 */
function setup() {
  const clock = new ManualClock("2026-10-16T08:00:00Z");
  const store = new MemorySessionStore(() => clock.now().getTime());
  const auth = new WebAuth({
    issuer: "http://keycloak.test/realms/astax",
    clients: { pro: "astax-web-pro" },
    redirectUri: "http://localhost:3000/auth/callback",
    postLogoutRedirectUri: "http://localhost:3000/",
    apiUrl: "http://api.test",
    store,
    clock,
  });
  const session = {
    kind: "pro",
    accessToken: "a",
    refreshToken: "r",
    idToken: null,
    accessExpiresAt: clock.now().getTime() + 3_600_000,
    refreshExpiresAt: clock.now().getTime() + 7_200_000,
    contextId: "context-one",
  };
  return { auth, store, clock, session };
}

describe("search terms kept next to the session", () => {
  it("are read back in the same context only", async () => {
    const { auth, store, session } = setup();
    await store.set("session:s1", JSON.stringify(session), 3600);
    await auth.setSearch("s1", "clienti", { q: "RSSMRA80A01H501U" });
    expect(await auth.search("s1", "clienti")).toEqual({ q: "RSSMRA80A01H501U" });
    await auth.setContext("s1", "context-two");
    expect(await auth.search("s1", "clienti")).toEqual({});
  });

  it("expire after a few minutes and are deleted at logout", async () => {
    const { auth, store, clock, session } = setup();
    await store.set("session:s1", JSON.stringify(session), 3600);
    await auth.setSearch("s1", "clienti", { q: "x" });
    clock.advanceMinutes(16);
    expect(await auth.search("s1", "clienti")).toEqual({});

    await store.set(
      "session:s2",
      JSON.stringify({ ...session, accessExpiresAt: clock.now().getTime() + 3_600_000 }),
      3600,
    );
    await auth.setSearch("s2", "clienti", { q: "y" });
    await auth.logout("s2").catch(() => undefined);
    expect(await store.get("search:s2")).toBeNull();
  });
});

describe("login start (ADR 0019, magic link)", () => {
  function offlineAuth() {
    const clock = new ManualClock("2026-10-23T08:00:00Z");
    const store = new MemorySessionStore(() => clock.now().getTime());
    const auth = new WebAuth({
      issuer: "http://keycloak.test/realms/astax",
      clients: { private: "astax-web-private" },
      redirectUri: "http://localhost:3000/auth/callback",
      postLogoutRedirectUri: "http://localhost:3000/",
      apiUrl: "http://api.test",
      store,
      clock,
      // No network: the server metadata is given by hand.
      discover: async (clientId) =>
        new oidc.Configuration(
          {
            issuer: "http://keycloak.test/realms/astax",
            authorization_endpoint:
              "http://keycloak.test/realms/astax/protocol/openid-connect/auth",
            token_endpoint: "http://keycloak.test/realms/astax/protocol/openid-connect/token",
          },
          clientId,
        ),
    });
    return { auth, store };
  }

  it("SIC-05 carries the one-use token of the link on the authorization request", async () => {
    const { auth, store } = offlineAuth();
    const token = "abcdefghijklmnopqrstuvwxyz0123456789ABCDE-_";
    const url = new URL(await auth.beginLogin("private", { astax_link: token }));
    expect(url.searchParams.get("astax_link")).toBe(token);
    expect(url.searchParams.get("client_id")).toBe("astax-web-private");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    // The pending login is kept by state, as for any other login.
    expect(await store.get(`login:${url.searchParams.get("state")}`)).toContain('"private"');
  });

  it("starts the ordinary login without the parameter", async () => {
    const { auth } = offlineAuth();
    const url = new URL(await auth.beginLogin("private"));
    expect(url.searchParams.has("astax_link")).toBe(false);
  });

  it("never lets the extra parameters override the protocol ones", async () => {
    const { auth } = offlineAuth();
    const url = new URL(
      await auth.beginLogin("private", { redirect_uri: "http://evil.test/", scope: "x" }),
    );
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/auth/callback");
    expect(url.searchParams.get("scope")).toBe("openid");
  });
});
