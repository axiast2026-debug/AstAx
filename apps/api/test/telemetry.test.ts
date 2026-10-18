import type { ErrorEvent } from "@sentry/node";
import { describe, expect, it } from "vitest";
import { scrubEvent } from "../src/telemetry.js";

// Phase 8, rule 8: what could reach Sentry is stripped of request, person and values.
describe("phase 8 Sentry events", () => {
  it("keep the type and the stack only", () => {
    const event = scrubEvent({
      type: undefined,
      request: { url: "https://api.astax.it/x?code=123456", headers: { cookie: "s=1" } },
      user: { email: "giulia.neri@example.test" },
      extra: { body: "x" },
      contexts: { request: { url: "x" } },
      exception: {
        values: [
          {
            type: "TypeError",
            value: "Cannot read giulia.neri@example.test",
            stacktrace: { frames: [{ function: "f", vars: { phone: "3331234567" } }] },
          },
        ],
      },
    } as ErrorEvent);
    expect(event.request).toBeUndefined();
    expect(event.user).toBeUndefined();
    expect(event.extra).toBeUndefined();
    expect(event.contexts?.request).toBeUndefined();
    expect(event.exception?.values?.[0]?.value).toBe("TypeError");
    expect(event.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({ function: "f" });
    expect(JSON.stringify(event)).not.toMatch(/example\.test|3331234567|123456/);
  });
});
