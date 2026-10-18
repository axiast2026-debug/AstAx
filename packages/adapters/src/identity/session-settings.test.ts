import { describe, expect, it } from "vitest";
import {
  emailCodeConfig,
  keycloakBruteForceSettings,
  keycloakSessionSettings,
} from "./session-settings.js";

describe("SIC-05 session durations from the parameters", () => {
  const settings = keycloakSessionSettings({
    privateDays: 30,
    professionalIdleHours: 8,
    staffIdleHours: 1,
  });

  it("privates: 30 days from login", () => {
    expect(settings.clients["astax-web-private"]).toEqual({
      "client.session.idle.timeout": "2592000",
      "client.session.max.lifespan": "2592000",
    });
  });

  it("professionals: 8 hours of inactivity; staff: 1 hour", () => {
    expect(settings.clients["astax-web-pro"]).toEqual({ "client.session.idle.timeout": "28800" });
    expect(settings.clients["astax-admin"]).toEqual({ "client.session.idle.timeout": "3600" });
  });

  it("the realm keeps the longest value, because clients can only shorten it", () => {
    expect(settings.realm).toEqual({
      ssoSessionIdleTimeout: 2592000,
      ssoSessionMaxLifespan: 2592000,
    });
    expect(
      keycloakSessionSettings({ privateDays: 1, professionalIdleHours: 48, staffIdleHours: 1 })
        .realm.ssoSessionIdleTimeout,
    ).toBe(172800);
  });

  it("email code validity and attempts follow otp.*", () => {
    expect(emailCodeConfig({ validityMinutes: 10, maxAttempts: 5, maxCodesPerHour: 10 })).toEqual({
      codeTtlMinutes: "10",
      maxAttempts: "5",
      codeLength: "6",
      maxCodesPerHour: "10",
    });
  });

  it("phase 8 the login lock follows security.loginMaxFailures and security.loginLockMinutes", () => {
    expect(keycloakBruteForceSettings({ maxFailures: 10, lockMinutes: 15 })).toMatchObject({
      bruteForceProtected: true,
      failureFactor: 10,
      maxFailureWaitSeconds: 900,
    });
  });
});
