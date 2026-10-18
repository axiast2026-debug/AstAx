import type { ErrorEvent } from "@sentry/node";
import { describe, expect, it } from "vitest";
import { maskedPath, sanitizedSpan, scrubEvent } from "../src/telemetry.js";

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

  it("spans keep method, status and a masked path: no token, IP, user agent or host", () => {
    expect(
      maskedPath("/customer-links/AbCdEf0123456789xyz_-AbCdEf0123456789/acceptance?code=1"),
    ).toBe("/customer-links/:id/acceptance");
    expect(maskedPath("/requests/01a14e0e-5571-755c-a7e2-9b98bb77f76d")).toBe("/requests/:id");
    const span = {
      name: "GET /consent-links/secret-token-0123456789",
      attributes: {
        "http.request.method": "GET",
        "http.response.status_code": 200,
        "url.path": "/consent-links/secret-token-0123456789",
        "client.address": "203.0.113.7",
        "http.client_ip": "203.0.113.7",
        "user_agent.original": "Mozilla/5.0",
        "server.address": "api.astax.it",
      },
      spanContext: () => ({ traceId: "t", spanId: "s", traceFlags: 1 }),
    } as unknown as Parameters<typeof sanitizedSpan>[0];
    const clean = sanitizedSpan(span);
    expect(clean.attributes).toEqual({
      "http.request.method": "GET",
      "http.response.status_code": 200,
      "url.path": "/consent-links/:id",
    });
    expect(clean.name).toBe("GET /consent-links/:id");
    expect(clean.spanContext().traceId).toBe("t");
  });
});
