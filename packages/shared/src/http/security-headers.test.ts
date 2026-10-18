import { describe, expect, it } from "vitest";
import {
  apiSecurityHeaders,
  baseSecurityHeaders,
  contentSecurityPolicy,
} from "./security-headers.js";

describe("phase 8 security headers", () => {
  const production = contentSecurityPolicy({
    nonce: "abc123",
    connectTo: ["https://api.astax.it/realtime"],
    formsTo: ["https://login.astax.it/realms/astax"],
    development: false,
  });

  it("only scripts with the nonce of the page run; no eval in production", () => {
    expect(production).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(production).not.toContain("unsafe-eval");
    expect(production).toContain("object-src 'none'");
    expect(production).toContain("frame-ancestors 'none'");
    expect(production).toContain("upgrade-insecure-requests");
  });

  it("the browser may reach the realtime server and send forms to the login service only", () => {
    expect(production).toContain("connect-src 'self' https://api.astax.it wss://api.astax.it;");
    expect(production).toContain("form-action 'self' https://login.astax.it;");
  });

  it("development allows the reload of Next.js", () => {
    const dev = contentSecurityPolicy({
      nonce: "n",
      connectTo: ["http://localhost:4000"],
      formsTo: ["http://localhost:8180"],
      development: true,
    });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("connect-src 'self' http://localhost:4000 ws://localhost:4000 ws:");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });

  it("HSTS only in production; the API allows nothing to run", () => {
    expect(baseSecurityHeaders(false)["strict-transport-security"]).toBeUndefined();
    expect(baseSecurityHeaders(true)["strict-transport-security"]).toContain("max-age=");
    expect(apiSecurityHeaders(true)["content-security-policy"]).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
  });
});
