import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConsentService } from "../../src/requests/consent.service.js";
import { startHarness, type Harness } from "./fixtures.js";

// Phase 8, proposal F: the limits per IP address, per number or address and
// on invalid tokens come from the parameters security.* (seed values: 120 a
// minute, 30 invalid tokens a minute, 10 entries an hour, 10 codes an hour).
let h: Harness;

beforeAll(async () => {
  h = await startHarness({ rateLimits: true });
});

afterAll(async () => {
  await h.close();
});

const minuteLater = () => h.clock.set(new Date(h.clock.now().getTime() + 60_000));
const hourLater = () => h.clock.set(new Date(h.clock.now().getTime() + 3_600_000));

describe("phase 8 rate limits", () => {
  it("a public page answers 429 with Retry-After past security.publicRequestsPerMinute, then again a minute later", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 121; i += 1) {
      statuses.push((await h.call("/onboarding/options?type=AGENCY")).status);
    }
    expect(statuses.slice(0, 120).every((s) => s === 200)).toBe(true);
    const refused = await h.call("/onboarding/options?type=AGENCY");
    expect(refused.status).toBe(429);
    expect(((await refused.json()) as { code: string }).code).toBe("RATE_LIMITED");
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    // The health check of the load balancer is not counted.
    expect((await h.call("/health")).status).toBe(200);
    minuteLater();
    expect((await h.call("/onboarding/options?type=AGENCY")).status).toBe(200);
  });

  it("after security.failedAuthPerMinute invalid tokens the address waits, even with a valid one", async () => {
    minuteLater();
    const bad = await h.token(
      { sub: "kc-private-giulia-neri", azp: "astax-web-private", roles: ["astax-private"] },
      true,
    );
    for (let i = 0; i < 30; i += 1) expect((await h.call("/me", { token: bad })).status).toBe(401);
    const good = await h.tokenFor("private-giulia-neri");
    expect((await h.call("/me", { token: good })).status).toBe(429);
    minuteLater();
    expect((await h.call("/me", { token: good })).status).toBe(200);
  });

  it("at most security.publicApplicationsPerHour entries from one address", async () => {
    hourLater();
    for (let i = 0; i < 10; i += 1) {
      expect((await h.call("/onboarding", { body: {} })).status).toBe(400);
    }
    expect((await h.call("/onboarding", { body: {} })).status).toBe(429);
    hourLater();
    expect((await h.call("/onboarding", { body: {} })).status).toBe(400);
  });

  it("at most security.codesPerDestinationPerHour codes to the same number, whoever asks", async () => {
    hourLater();
    const codes = h.app.get(ConsentService);
    const send = (phone: string) =>
      codes.sendCode({ email: null, phone }, "ONBOARDING_IBAN", "123456", 10, {
        onboardingId: "test",
      });
    for (let i = 0; i < 10; i += 1) await send("+39 333 0000001");
    // The same number written another way is the same destination.
    await expect(send("3330000001")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await send("+39 333 0000002");
    hourLater();
    await send("+39 333 0000001");
  });
});
