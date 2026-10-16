import { randomUUID } from "node:crypto";
import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, startHarness, type Harness } from "./fixtures.js";

// Rule 13: the development tools with DEV_TOOLS=true (as in development and
// acceptance; never in production, which the configuration refuses).
let h: Harness;

beforeAll(async () => {
  h = await startHarness({ env: { DEV_TOOLS: "true", NODE_ENV: "development" } });
  for (const key of ["bo-verifier", "agenzia-uno-owner"] as const) await acceptAllLegal(h, key);
});

afterAll(async () => {
  await h.close();
});

describe("development tools (rule 13, devTools.use)", () => {
  it("the back office fires the next timer of a request: logged first, then signalled", async () => {
    const requestId = randomUUID();
    const response = await h.call(`/dev/requests/${requestId}/fire-next-timer`, {
      token: await h.tokenFor("bo-verifier"),
      context: membershipId("bo-verifier", "astax"),
      body: {},
    });
    expect(response.status).toBe(200);
    expect(h.signals.sent.at(-1)).toEqual({ requestId, name: "fireNextTimer", input: null });
    const logged = await withContext(h.db, SYSTEM_CONTEXT, (tx) =>
      tx.auditLog.count({ where: { action: "DEV_TOOL_USED", targetId: requestId } }),
    );
    expect(logged).toBe(1);
  });

  it("an agency may not use them", async () => {
    const response = await h.call(`/dev/requests/${randomUUID()}/fire-next-timer`, {
      token: await h.tokenFor("agenzia-uno-owner"),
      context: membershipId("agenzia-uno-owner", "agenzia-uno"),
      body: {},
    });
    expect(response.status).toBe(403);
  });

  it("test offers need an existing auction; the clock needs Redis (absent here)", async () => {
    const who = {
      token: await h.tokenFor("bo-verifier"),
      context: membershipId("bo-verifier", "astax"),
    };
    expect(
      (await h.call(`/dev/auctions/${randomUUID()}/test-offers`, { ...who, body: {} })).status,
    ).toBe(404);
    expect((await h.call("/dev/clock", { ...who, body: { advanceMinutes: 60 } })).status).toBe(409);
  });
});
