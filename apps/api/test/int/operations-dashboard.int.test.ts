import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Phase 7, spec 06 «Dashboard operativa»: each role sees only the queues it
// works on, with the counter and the longest wait; no customer data.
let h: Harness;
let r: ReturnType<typeof requestHelpers>;

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
});

afterAll(async () => {
  await h.close();
});

async function staff(key: "bo-verifier" | "bo-accounting" | "bo-supervisor"): Promise<Who> {
  await acceptAllLegal(h, key);
  return { token: await h.tokenFor(key), context: membershipId(key, "astax") };
}

interface Overview {
  queues: { key: string; count: number; since: string | null }[];
  indicators: { verificationsToday: number; desertedToday: number | null };
}

describe("phase 7 operations dashboard", () => {
  it("the verifier sees the verification queue with its wait, not the money", async () => {
    const owner: Who = { token: await h.tokenFor("private-luca-ferri") };
    await acceptAllLegal(h, "private-luca-ferri");
    await r.submittedPrivateRequest(owner, "luca.ferri@example.test");
    const verifier = await staff("bo-verifier");
    const overview = await r.json<Overview>(await r.call(verifier, "/back-office/dashboard"), 200);
    const keys = overview.queues.map((q) => q.key);
    expect(keys).toEqual(expect.arrayContaining(["verification", "integration", "openAuctions"]));
    expect(keys).not.toContain("remittances");
    expect(keys).not.toContain("onboarding");
    const verification = overview.queues.find((q) => q.key === "verification");
    expect(verification?.count).toBeGreaterThanOrEqual(1);
    expect(verification?.since).not.toBeNull();
    // Counts and times only (rule 8).
    expect(JSON.stringify(overview)).not.toContain("luca.ferri");
  });

  it("accounting sees remittances and refunds; the supervisor also the entries", async () => {
    const accounting = await staff("bo-accounting");
    const keys = (
      await r.json<Overview>(await r.call(accounting, "/back-office/dashboard"), 200)
    ).queues.map((q) => q.key);
    expect(keys).toContain("remittances");
    expect(keys).not.toContain("verification");
    const supervisor = await staff("bo-supervisor");
    const all = await r.json<Overview>(await r.call(supervisor, "/back-office/dashboard"), 200);
    expect(all.queues.map((q) => q.key)).toEqual(
      expect.arrayContaining([
        "verification",
        "deserted",
        "issuanceProblems",
        "refunds",
        "onboarding",
      ]),
    );
    expect(all.indicators.desertedToday).not.toBeNull();
  });

  it("is not for customers or agencies", async () => {
    await acceptAllLegal(h, "agenzia-uno-owner");
    const agency: Who = {
      token: await h.tokenFor("agenzia-uno-owner"),
      context: membershipId("agenzia-uno-owner", "agenzia-uno"),
    };
    expect((await r.call(agency, "/back-office/dashboard")).status).toBe(403);
  });
});
