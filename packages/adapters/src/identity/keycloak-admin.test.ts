import { describe, expect, it } from "vitest";
import { KeycloakAdmin } from "./keycloak-admin.js";

// Phase 8: the login events are read page by page, newest first, until the cursor.
describe("phase 8 Keycloak login events", () => {
  it("reads every page of a burst, oldest first, nothing before the cursor", async () => {
    const all = Array.from({ length: 7 }, (_, i) => ({ time: 1000 + i, type: "LOGIN_ERROR" }));
    const newestFirst = [...all].reverse();
    const fetchStub = (async (url: string | URL) => {
      const u = new URL(String(url));
      if (u.pathname.endsWith("/token")) {
        return Response.json({ access_token: "t", expires_in: 60 });
      }
      const first = Number(u.searchParams.get("first"));
      const max = Number(u.searchParams.get("max"));
      return Response.json(newestFirst.slice(first, first + max));
    }) as typeof fetch;
    const admin = new KeycloakAdmin({
      baseUrl: "http://keycloak.test",
      realm: "astax",
      clientId: "astax-api-admin",
      clientSecret: "test-secret-not-used",
      fetch: fetchStub,
      now: () => 0,
    });
    const events = await admin.listEvents(["LOGIN_ERROR"], 1001, 2);
    expect(events.map((e) => e.time)).toEqual([1002, 1003, 1004, 1005, 1006]);
  });
});
