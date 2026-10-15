import { createHash } from "node:crypto";
import type { Clock } from "../clock/clock.js";

/**
 * Vehicle data from the plate (docs/adattatori.md; real provider Openapi
 * Automotive, phase 8). Development and tests use only the fake (rule 9).
 */
export type VehicleType = "CAR" | "MOTORCYCLE" | "MOPED";

export interface PlateLookupVehicle {
  make: string;
  model: string;
  version?: string;
  providerCode?: string;
  fuel?: string;
  displacementCc?: number;
  powerKw?: number;
  firstRegistrationDate?: string;
}

export type PlateLookupResult =
  | {
      found: true;
      vehicle: PlateLookupVehicle;
      insurance?: { companyName?: string; expiryDate?: string };
    }
  | { found: false; reason: "NOT_FOUND" | "INVALID_PLATE" | "PROVIDER_ERROR" };

export interface PlateLookupPort {
  lookup(input: { plate: string; vehicleType?: VehicleType }): Promise<PlateLookupResult>;
}

export const FAKE_PLATE_NOT_FOUND = "ZZ000ZZ";
export const FAKE_PLATE_PROVIDER_ERROR = "XX999XX";
/** Fake plates starting with these letters belong to a vehicle first registered in 1990. */
export const FAKE_VINTAGE_PREFIX = "EP";

const MAKES = [
  { make: "Marca Prova", models: ["Modello Uno", "Modello Due", "Modello Tre"] },
  { make: "Auto Demo", models: ["City", "Familiare", "Sport"] },
  { make: "Veicoli Esempio", models: ["Compatta", "Berlina"] },
] as const;
const FUELS = ["PETROL", "DIESEL", "HYBRID", "LPG", "ELECTRIC"] as const;
const INSURERS = [
  "Compagnia Alfa",
  "Compagnia Beta",
  "Compagnia Gamma",
  "Compagnia Delta",
] as const;

function pick<T>(list: readonly T[], n: number): T {
  return list[n % list.length] as T;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Fake: the same plate always gives the same vehicle (from a hash of the
 * plate). The current policy expires within the next 60 days, counted from
 * the injected clock. `ZZ000ZZ` is not found, `XX999XX` is a provider error.
 */
export class FakePlateLookup implements PlateLookupPort {
  constructor(private readonly clock: Clock) {}

  async lookup(input: { plate: string; vehicleType?: VehicleType }): Promise<PlateLookupResult> {
    const plate = input.plate.replace(/[\s-]/g, "").toUpperCase();
    if (!/^[A-Z0-9]{5,10}$/.test(plate)) return { found: false, reason: "INVALID_PLATE" };
    if (plate === FAKE_PLATE_NOT_FOUND) return { found: false, reason: "NOT_FOUND" };
    if (plate === FAKE_PLATE_PROVIDER_ERROR) return { found: false, reason: "PROVIDER_ERROR" };

    const hash = createHash("sha256").update(plate).digest();
    const n = (i: number) => hash.readUInt16BE(i * 2);
    const family = pick(MAKES, n(0));
    const vintage = plate.startsWith(FAKE_VINTAGE_PREFIX);
    const year = vintage ? 1990 : 2008 + (n(1) % 17);
    const month = 1 + (n(2) % 12);
    const day = 1 + (n(3) % 28);
    const moto = input.vehicleType === "MOTORCYCLE" || input.vehicleType === "MOPED";
    const expiry = new Date(this.clock.now().getTime() + (15 + (n(4) % 45)) * 86_400_000);
    return {
      found: true,
      vehicle: {
        make: family.make,
        model: pick(family.models, n(5)),
        version: `Versione ${1 + (n(6) % 4)}`,
        providerCode: `FAKE-${hash.toString("hex").slice(0, 8).toUpperCase()}`,
        fuel: pick(FUELS, n(7)),
        displacementCc: moto ? 125 + (n(8) % 6) * 125 : 999 + (n(8) % 10) * 100,
        powerKw: moto ? 11 + (n(9) % 60) : 50 + (n(9) % 120),
        firstRegistrationDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      },
      insurance: { companyName: pick(INSURERS, n(10)), expiryDate: isoDay(expiry) },
    };
  }
}
