import { describe, expect, it } from "vitest";
import { ManualClock } from "../clock/manual-clock.js";
import { FakePlateLookup } from "./plate-lookup.js";

const clock = new ManualClock("2026-10-15T08:00:00Z");
const lookup = new FakePlateLookup(clock);

describe("fake plate lookup", () => {
  it("gives the same vehicle for the same plate, whatever the spelling", async () => {
    const a = await lookup.lookup({ plate: "GN123AB" });
    const b = await lookup.lookup({ plate: "gn 123 ab" });
    expect(a).toEqual(b);
    expect(a.found).toBe(true);
  });

  it("gives different vehicles for different plates", async () => {
    const plates = ["GN123AB", "AR456CD", "MP789EF", "BC234DE", "FG567HL"];
    const results = await Promise.all(plates.map((plate) => lookup.lookup({ plate })));
    const codes = new Set(results.map((r) => (r.found ? r.vehicle.providerCode : r.reason)));
    expect(codes.size).toBe(plates.length);
  });

  it("knows the special plates: not found, provider error, invalid", async () => {
    expect(await lookup.lookup({ plate: "ZZ000ZZ" })).toEqual({
      found: false,
      reason: "NOT_FOUND",
    });
    expect(await lookup.lookup({ plate: "XX999XX" })).toEqual({
      found: false,
      reason: "PROVIDER_ERROR",
    });
    expect(await lookup.lookup({ plate: "A!" })).toEqual({ found: false, reason: "INVALID_PLATE" });
  });

  it("plates starting with EP belong to a vehicle registered in 1990", async () => {
    const result = await lookup.lookup({ plate: "EP111AA" });
    expect(result.found && result.vehicle.firstRegistrationDate?.startsWith("1990-")).toBe(true);
  });

  it("the current policy expires in the next 60 days, counted from the clock", async () => {
    const result = await lookup.lookup({ plate: "GN123AB" });
    if (!result.found) throw new Error("expected a vehicle");
    const expiry = result.insurance?.expiryDate ?? "";
    expect(expiry > "2026-10-15").toBe(true);
    expect(expiry <= "2026-12-14").toBe(true);
  });
});
