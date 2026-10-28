import { describe, expect, it } from "vitest";
import { ManualClock } from "../clock/manual-clock.js";
import { FakePlateLookup } from "../vehicle-data/plate-lookup.js";
import { FakeAniaReader } from "./ania-reader.js";

const clock = new ManualClock("2026-10-28T08:00:00Z");
const reader = new FakeAniaReader(clock);
const owner = { fiscalCode: "DLCMGR85C52H501X", fullName: "De Luca Maria Grazia" };

describe("fake ANIA reader (rule 11: invented data only)", () => {
  it("the same plate gives the same record, whatever the spelling; vehicle and insurer agree with the plate lookup", async () => {
    const a = await reader.read({ plate: "GN123AB", owner });
    const b = await reader.read({ plate: "gn 123 ab", owner });
    expect(a).toEqual(b);
    const plate = await new FakePlateLookup(clock).lookup({ plate: "GN123AB" });
    if (!a.found || !plate.found) throw new Error("expected a record");
    expect(a.record.vehicle.description).toBe(plate.vehicle.make.toUpperCase());
    expect(a.record.registration.firstRegistrationDate).toBe(plate.vehicle.firstRegistrationDate);
    expect(a.record.latestCover?.coverExpiry).toBe(plate.insurance?.expiryDate);
    expect(a.record.owner.fiscalCode).toBe(owner.fiscalCode);
    expect(a.record.latestCertificate?.entitledName).toBe("DE LUCA MARIA GRAZIA");
  });

  it("knows the special plates: not found, provider error, invalid, no certificate", async () => {
    expect(await reader.read({ plate: "ZZ000ZZ" })).toEqual({ found: false, reason: "NOT_FOUND" });
    expect(await reader.read({ plate: "XX999XX" })).toEqual({
      found: false,
      reason: "PROVIDER_ERROR",
    });
    expect(await reader.read({ plate: "A!" })).toEqual({ found: false, reason: "INVALID_PLATE" });
    const first = await reader.read({ plate: "NV123AB" });
    expect(first.found && first.record.latestCertificate).toBeNull();
  });
});
