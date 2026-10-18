import type { PlateLookupPort, PlateLookupResult, VehicleType } from "./plate-lookup.js";

export const OPENAPI_AUTOMOTIVE_URLS = {
  sandbox: "https://test.automotive.openapi.com",
  production: "https://automotive.openapi.com",
} as const;

/** The plate formats the provider accepts (two letters, three digits, two letters; or 8 characters). */
const PLATE = /^([A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{2}[A-Z0-9]{6})$/;

/** Openapi's «FuelType» (Italian words) as the codes of the list «fuel». */
export function fuelCode(text: string): string | undefined {
  const t = text.toLowerCase();
  if (t.includes("ibrid") || t.includes("hybrid")) return "HYBRID";
  if (t.includes("elettr") || t.includes("electric")) return "ELECTRIC";
  if (t.includes("gpl") || t.includes("lpg")) return "LPG";
  if (t.includes("metano") || t.includes("cng")) return "CNG";
  if (t.includes("diesel") || t.includes("gasolio")) return "DIESEL";
  if (t.includes("benzina") || t.includes("petrol")) return "PETROL";
  return undefined;
}

interface OpenapiCar {
  CarMake?: string;
  CarModel?: string;
  Version?: string;
  KType?: string;
  FuelType?: string;
  EngineSize?: string;
  PowerKW?: number;
}

interface OpenapiInsurance {
  Company?: string;
  Expiry?: string;
  IsInsured?: boolean;
}

export interface OpenapiAutomotiveOptions {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Phase 8: vehicle data from the plate with Openapi Automotive (IT-car and
 * IT-insurance). Only cars: for motorcycles and mopeds the customer writes the
 * data (PROVIDER_ERROR, as for a provider down). The registration date is not
 * in the answer (only the year): it stays to be read from the registration
 * certificate. No plate or answer reaches the logs.
 */
export class OpenapiPlateLookup implements PlateLookupPort {
  readonly #fetch: typeof fetch;

  constructor(private readonly options: OpenapiAutomotiveOptions) {
    this.#fetch = options.fetch ?? fetch;
  }

  private async get<T>(path: string): Promise<{ status: number; data?: T }> {
    try {
      const response = await this.#fetch(`${this.options.baseUrl}${path}`, {
        headers: { authorization: `Bearer ${this.options.token}` },
        redirect: "manual",
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
      if (!response.ok) return { status: response.status };
      const body = (await response.json()) as { data?: T };
      return { status: response.status, ...(body.data ? { data: body.data } : {}) };
    } catch {
      return { status: 0 };
    }
  }

  async lookup(input: { plate: string; vehicleType?: VehicleType }): Promise<PlateLookupResult> {
    const plate = input.plate.replace(/\s/g, "").toUpperCase();
    if (!PLATE.test(plate)) return { found: false, reason: "INVALID_PLATE" };
    if (input.vehicleType && input.vehicleType !== "CAR") {
      return { found: false, reason: "PROVIDER_ERROR" };
    }
    const [car, insurance] = await Promise.all([
      this.get<OpenapiCar>(`/IT-car/${plate}`),
      this.get<OpenapiInsurance>(`/IT-insurance/${plate}`),
    ]);
    if (car.status === 404) return { found: false, reason: "NOT_FOUND" };
    if (car.status === 406) return { found: false, reason: "INVALID_PLATE" };
    const v = car.data;
    if (!v?.CarMake || !v.CarModel) return { found: false, reason: "PROVIDER_ERROR" };
    const fuel = v.FuelType ? fuelCode(v.FuelType) : undefined;
    const cc = Number.parseInt(v.EngineSize ?? "", 10);
    const ins = insurance.data;
    return {
      found: true,
      vehicle: {
        make: v.CarMake,
        model: v.CarModel,
        ...(v.Version ? { version: v.Version } : {}),
        ...(v.KType ? { providerCode: v.KType } : {}),
        ...(fuel ? { fuel } : {}),
        ...(Number.isInteger(cc) && cc > 0 ? { displacementCc: cc } : {}),
        ...(typeof v.PowerKW === "number" && v.PowerKW > 0 ? { powerKw: v.PowerKW } : {}),
      },
      ...(ins?.IsInsured && ins.Company
        ? {
            insurance: {
              companyName: ins.Company,
              ...(ins.Expiry ? { expiryDate: ins.Expiry.slice(0, 10) } : {}),
            },
          }
        : {}),
    };
  }
}
