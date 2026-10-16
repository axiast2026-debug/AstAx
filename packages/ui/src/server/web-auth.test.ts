import { ManualClock } from "@astax/adapters/clock";
import { describe, expect, it } from "vitest";
import { MemorySessionStore } from "./redis-store.js";
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
