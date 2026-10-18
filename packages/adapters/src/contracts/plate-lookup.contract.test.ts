import { describe, expect, it } from "vitest";
import { ManualClock } from "../clock/manual-clock.js";
import {
  FAKE_PLATE_NOT_FOUND,
  FakePlateLookup,
  type PlateLookupPort,
} from "../vehicle-data/plate-lookup.js";
import {
  fuelCode,
  OPENAPI_AUTOMOTIVE_URLS,
  OpenapiPlateLookup,
} from "../vehicle-data/openapi-plate-lookup.js";

// Phase 8: what every plate lookup must do, then Openapi Automotive with a simulated server.
function plateContract(make: () => PlateLookupPort, known: string, unknown: string) {
  it("contract: a known plate gives make and model; an unknown one NOT_FOUND; a malformed one INVALID_PLATE", async () => {
    const lookup = make();
    const found = await lookup.lookup({ plate: known, vehicleType: "CAR" });
    expect(found.found).toBe(true);
    if (found.found) {
      expect(found.vehicle.make).not.toBe("");
      expect(found.vehicle.model).not.toBe("");
    }
    expect(await lookup.lookup({ plate: unknown })).toEqual({ found: false, reason: "NOT_FOUND" });
    expect(await lookup.lookup({ plate: "??" })).toEqual({ found: false, reason: "INVALID_PLATE" });
  });
}

function simulatedOpenapi() {
  const urls: string[] = [];
  const fetchStub = (async (url: string | URL) => {
    urls.push(String(url));
    if (String(url).includes("ZZ000ZZ")) {
      return Response.json({ data: [], success: true, message: "car not found" }, { status: 404 });
    }
    if (String(url).includes("/IT-insurance/")) {
      return Response.json({
        data: {
          LicensePlate: "EX117YA",
          Company: "COMPAGNIA ALFA",
          Expiry: "2027-01-08T00:00:00",
          IsInsured: true,
        },
      });
    }
    return Response.json({
      data: {
        LicensePlate: "EX117YA",
        CarMake: "MARCA PROVA",
        CarModel: "Modello Uno",
        Version: "Modello Uno 1.6 diesel",
        FuelType: "Diesel",
        EngineSize: "1598",
        PowerKW: 85,
      },
      success: true,
    });
  }) as typeof fetch;
  return { urls, fetch: fetchStub };
}

describe("plate lookup contract — fake and Openapi (simulated)", () => {
  plateContract(
    () => new FakePlateLookup(new ManualClock("2026-11-16T09:00:00Z")),
    "AB123CD",
    FAKE_PLATE_NOT_FOUND,
  );
  const server = simulatedOpenapi();
  plateContract(
    () =>
      new OpenapiPlateLookup({
        baseUrl: OPENAPI_AUTOMOTIVE_URLS.sandbox,
        token: "t",
        fetch: server.fetch,
      }),
    "EX117YA",
    "ZZ000ZZ",
  );

  it("Openapi: data mapped to the port; insurance from IT-insurance; no date invented", async () => {
    const lookup = new OpenapiPlateLookup({
      baseUrl: OPENAPI_AUTOMOTIVE_URLS.sandbox,
      token: "t",
      fetch: simulatedOpenapi().fetch,
    });
    expect(await lookup.lookup({ plate: "ex 117 ya" })).toEqual({
      found: true,
      vehicle: {
        make: "MARCA PROVA",
        model: "Modello Uno",
        version: "Modello Uno 1.6 diesel",
        fuel: "DIESEL",
        displacementCc: 1598,
        powerKw: 85,
      },
      insurance: { companyName: "COMPAGNIA ALFA", expiryDate: "2027-01-08" },
    });
    expect(await lookup.lookup({ plate: "EX117YA", vehicleType: "MOTORCYCLE" })).toEqual({
      found: false,
      reason: "PROVIDER_ERROR",
    });
    expect([fuelCode("Benzina"), fuelCode("Ibrida benzina"), fuelCode("Metano")]).toEqual([
      "PETROL",
      "HYBRID",
      "CNG",
    ]);
  });

  it("Openapi: a provider down is PROVIDER_ERROR, never an exception", async () => {
    const down = (async () => {
      throw new Error("network");
    }) as typeof fetch;
    const lookup = new OpenapiPlateLookup({ baseUrl: "https://x.test", token: "t", fetch: down });
    expect(await lookup.lookup({ plate: "EX117YA" })).toEqual({
      found: false,
      reason: "PROVIDER_ERROR",
    });
  });
});

const env = process.env;
describe.skipIf(!env.CONTRACT_OPENAPI_AUTOMOTIVE_TOKEN || !env.CONTRACT_PLATE_KNOWN)(
  "plate lookup contract — Openapi sandbox",
  () => {
    plateContract(
      () =>
        new OpenapiPlateLookup({
          baseUrl: OPENAPI_AUTOMOTIVE_URLS.sandbox,
          token: env.CONTRACT_OPENAPI_AUTOMOTIVE_TOKEN ?? "",
        }),
      env.CONTRACT_PLATE_KNOWN ?? "",
      env.CONTRACT_PLATE_UNKNOWN ?? "ZZ000ZZ",
    );
  },
);
