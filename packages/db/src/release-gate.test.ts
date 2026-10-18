import { describe, expect, it } from "vitest";
import { configurationBlockers } from "./release-gate.js";

describe("phase 8 the production release stops", () => {
  it("LEG-03 rule 13 with the development tools on", () => {
    expect(configurationBlockers({ NODE_ENV: "production", DEV_TOOLS: "true" })).toEqual([
      "DEV_TOOLS is on (rule 13)",
    ]);
  });

  it("when the configuration is not production", () => {
    expect(configurationBlockers({ NODE_ENV: "development" })).toHaveLength(1);
  });

  it("rule 9 with a fake provider", () => {
    expect(configurationBlockers({ NODE_ENV: "production", SIGNATURE_PROVIDER: "fake" })).toEqual([
      "SIGNATURE_PROVIDER is the fake provider (rule 9)",
    ]);
  });

  it("a production configuration passes", () => {
    expect(
      configurationBlockers({
        NODE_ENV: "production",
        DEV_TOOLS: "false",
        SIGNATURE_PROVIDER: "namirial",
      }),
    ).toEqual([]);
  });
});
