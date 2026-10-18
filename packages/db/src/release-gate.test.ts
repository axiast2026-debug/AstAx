import { describe, expect, it } from "vitest";
import { configurationBlockers, REQUIRED_PROVIDERS } from "./release-gate.js";

const real = Object.fromEntries(REQUIRED_PROVIDERS.map((k) => [k, "real"]));

describe("phase 8 the production release stops", () => {
  it("LEG-03 rule 13 with the development tools on", () => {
    expect(configurationBlockers({ ...real, NODE_ENV: "production", DEV_TOOLS: "true" })).toEqual([
      "DEV_TOOLS is on (rule 13)",
    ]);
  });

  it("when the configuration is not production", () => {
    expect(configurationBlockers({ ...real, NODE_ENV: "development" })).toHaveLength(1);
  });

  it("rule 9 with a fake provider, and with a provider not named (the default is the fake)", () => {
    expect(
      configurationBlockers({ ...real, NODE_ENV: "production", SIGNATURE_PROVIDER: "fake" }),
    ).toEqual(["SIGNATURE_PROVIDER is the fake provider (rule 9)"]);
    const withoutPayments = Object.fromEntries(
      Object.entries(real).filter(([k]) => k !== "PAYMENTS_PROVIDER"),
    );
    expect(configurationBlockers({ ...withoutPayments, NODE_ENV: "production" })).toEqual([
      "PAYMENTS_PROVIDER is the fake provider (rule 9)",
    ]);
  });

  it("a production configuration with every provider real passes", () => {
    expect(configurationBlockers({ ...real, NODE_ENV: "production", DEV_TOOLS: "false" })).toEqual(
      [],
    );
  });
});
