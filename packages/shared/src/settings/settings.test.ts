import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  crossSettingErrors,
  InvalidSettingChangeError,
  parseSeedSettings,
  planSettingChange,
  requireSettingAt,
  resolveSettingAt,
  SETTING_KEYS,
  SettingNotFoundError,
  settingInputOf,
  settingsOfPage,
  settingsPageOf,
  snapshotSettingsAt,
  type SettingValues,
  type SettingVersion,
} from "./index.js";

const seedUrl = new URL("../../../../seed/parametri.json", import.meta.url);
const seed = parseSeedSettings(JSON.parse(readFileSync(seedUrl, "utf8")));
const GENESIS = new Date("2026-01-01T00:00:00.000Z");
const seedVersions: SettingVersion[] = seed.map((s) => ({
  key: s.key,
  version: 1,
  value: s.value as never,
  validFrom: GENESIS,
  changedBy: null,
  reason: null,
}));

describe("seed/parametri.json", () => {
  it("contains every known parameter once, with valid values", () => {
    expect(seed.length).toBeGreaterThan(60);
  });

  it("is consistent across related parameters", () => {
    expect(crossSettingErrors(snapshotSettingsAt(seedVersions, GENESIS))).toEqual([]);
  });

  it("FEE-01 FEE-02 FEE-04 default fees match the domain rules", () => {
    const values = snapshotSettingsAt(seedVersions, GENESIS);
    expect(values["fees.private.amountCents"]).toBe(3000);
    expect(values["fees.private.aiSupplementCents"]).toBe(500);
    expect(values["fees.private.lowPremium.thresholdCents"]).toBe(20000);
    expect(values["fees.agency.amountCents"]).toBe(1500);
  });

  it("rejects an unknown key and a value of the wrong type", () => {
    const base = {
      schemaVersion: 1,
      settings: [{ key: "x.y", value: 1, description: "", rule: "" }],
    };
    expect(() => parseSeedSettings(base)).toThrow(/Unknown setting/);
    const wrong = {
      schemaVersion: 1,
      settings: [{ key: "fees.agency.amountCents", value: 15.5, description: "", rule: "FEE-07" }],
    };
    expect(() => parseSeedSettings(wrong)).toThrow();
  });

  it("PRES-07 AI weights must add up to 1", () => {
    const weights = { price: 0.6, coverage: 0.3, companyComplaints: 0.1, agencyIssuanceSpeed: 0.1 };
    const current = seedVersions.find(
      (v) => v.key === "ai.weights",
    ) as SettingVersion<"ai.weights">;
    expect(() =>
      planSettingChange(current, {
        key: "ai.weights",
        value: weights,
        validFrom: new Date("2026-06-01T00:00:00.000Z"),
        changedBy: "admin",
        reason: "test",
      }),
    ).toThrow(/add up to 1/);
  });
});

describe("reading a parameter at a date", () => {
  const v1: SettingVersion<"invitations.max"> = {
    key: "invitations.max",
    version: 1,
    value: 8,
    validFrom: GENESIS,
    changedBy: null,
    reason: null,
  };
  const v2 = planSettingChange(v1, {
    key: "invitations.max",
    value: 6,
    validFrom: new Date("2026-11-16T09:00:00.000Z"),
    changedBy: "user-admin",
    reason: "Pilota con poche agenzie",
  });
  const versions = [v2, v1];

  it("returns the version in force at that moment", () => {
    expect(
      requireSettingAt(versions, "invitations.max", new Date("2026-11-16T08:59:59.999Z")),
    ).toBe(8);
    expect(
      requireSettingAt(versions, "invitations.max", new Date("2026-11-16T09:00:00.000Z")),
    ).toBe(6);
    expect(
      requireSettingAt(versions, "invitations.max", new Date("2027-01-01T00:00:00.000Z")),
    ).toBe(6);
  });

  it("fails clearly before the first version", () => {
    expect(
      resolveSettingAt(versions, "invitations.max", new Date("2025-12-31T23:59:59.000Z")),
    ).toBeUndefined();
    expect(() =>
      requireSettingAt(versions, "invitations.max", new Date("2025-01-01T00:00:00.000Z")),
    ).toThrow(SettingNotFoundError);
  });

  it("ASTA-09 a snapshot keeps the values in force when it is taken", () => {
    const all = [...seedVersions.filter((v) => v.key !== "invitations.max"), ...versions];
    const before: SettingValues = snapshotSettingsAt(all, new Date("2026-11-15T12:00:00.000Z"));
    expect(before["invitations.max"]).toBe(8);
    expect(snapshotSettingsAt(all, new Date("2026-11-17T12:00:00.000Z"))["invitations.max"]).toBe(
      6,
    );
  });
});

describe("changing a parameter", () => {
  const current: SettingVersion<"fees.agency.amountCents"> = {
    key: "fees.agency.amountCents",
    version: 3,
    value: 1500,
    validFrom: new Date("2026-03-01T00:00:00.000Z"),
    changedBy: "user-admin",
    reason: "prima",
  };
  const change = {
    key: "fees.agency.amountCents" as const,
    value: 1800,
    validFrom: new Date("2026-12-01T00:00:00.000Z"),
    changedBy: "user-admin",
    reason: "  Nuovo accordo con le agenzie  ",
  };

  it("creates a new version with author and reason, never overwriting", () => {
    const next = planSettingChange(current, change);
    expect(next).toEqual({
      key: "fees.agency.amountCents",
      version: 4,
      value: 1800,
      validFrom: change.validFrom,
      changedBy: "user-admin",
      reason: "Nuovo accordo con le agenzie",
    });
    expect(current.value).toBe(1500);
  });

  it("requires a reason and an author", () => {
    expect(() => planSettingChange(current, { ...change, reason: "  " })).toThrow(
      InvalidSettingChangeError,
    );
    expect(() => planSettingChange(current, { ...change, changedBy: "" })).toThrow(
      InvalidSettingChangeError,
    );
  });

  it("refuses a validity date not after the current version", () => {
    expect(() => planSettingChange(current, { ...change, validFrom: current.validFrom })).toThrow(
      InvalidSettingChangeError,
    );
  });

  it("FEE-07 refuses decimal money", () => {
    expect(() => planSettingChange(current, { ...change, value: 15.5 })).toThrow();
  });
});

describe("phase 7 the panel pages of the parameters", () => {
  it("every parameter is on exactly one page of the administrator's panel", () => {
    for (const key of SETTING_KEYS) expect(settingsPageOf(key), key).toBeDefined();
    const all = (["auctionRules", "economy", "system"] as const).flatMap((p) =>
      settingsOfPage(p).flatMap((g) => g.keys),
    );
    expect([...all].sort()).toEqual([...SETTING_KEYS].sort());
  });

  it("FEE-07 amounts in cents are edited as money; the rest by the type of the value", () => {
    expect(settingInputOf("fees.private.amountCents", 3000)).toBe("money");
    expect(settingInputOf("invitations.max", 8)).toBe("number");
    expect(settingInputOf("brokerCommission.enabled", false)).toBe("boolean");
    expect(settingInputOf("remittance.runDay", "MONDAY")).toBe("text");
    expect(settingInputOf("ai.weights", { price: 0.6 })).toBe("json");
  });
});
