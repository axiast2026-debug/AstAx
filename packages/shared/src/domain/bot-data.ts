import type { AniaSheet } from "./ania.js";
import type { IntakeCandidate } from "./intake.js";
import type { QuoteData } from "./quote-data.js";
import { QUOTE_TYPE_PROVENANCE, type QuoteType } from "./verification-checks.js";

/**
 * Dan, 2026-10-28 (docs/piano-dati-dal-bot.md): the data of the request come
 * from what the bots found (documents, plate data, ANIA) and the operator only
 * confirms them; nothing is written by hand. What nobody found stays «non
 * disponibile», except what the choice of the agencies needs.
 */

/** «Categoria» of ANIA as the codes of the list vehicleType. */
export function vehicleTypeOfCategory(category: string | null): string | null {
  const c = (category ?? "").toUpperCase();
  if (c.startsWith("AUTOVETTURA")) return "CAR";
  if (c.startsWith("MOTOCICLO") || c.startsWith("MOTOVEICOLO")) return "MOTORCYCLE";
  if (c.startsWith("CICLOMOTORE")) return "MOPED";
  if (c.startsWith("AUTOCARRO")) return "LIGHT_TRUCK_OWN_USE";
  if (c.startsWith("AUTOCARAVAN") || c.startsWith("CAMPER")) return "CAMPER";
  return null;
}

/** «Alimentazione» of ANIA as the codes of the list fuel. */
export function fuelOfAnia(fuel: string | null): string | null {
  const f = (fuel ?? "").toUpperCase();
  if (f.includes("IBRID")) return "HYBRID";
  if (f.includes("GPL")) return "LPG";
  if (f.includes("METANO")) return "CNG";
  if (f.includes("ELETTR")) return "ELECTRIC";
  if (f.includes("GASOLIO") || f.includes("DIESEL")) return "DIESEL";
  if (f.includes("BENZINA")) return "PETROL";
  return null;
}

/** Fields shown as «non disponibile» when nobody found them. */
export const BOT_OPTIONAL_FIELDS = [
  "vehicle.fuel",
  "vehicle.powerKw",
  "vehicle.firstRegistrationDate",
  "vehicle.purchaseDate",
  "policyHolder.birthPlace",
  "policyHolder.sex",
  "history.cuClass",
  "history.currentInsurer",
  "history.currentExpiryDate",
] as const;

export interface BotDataInput {
  /** The data in force, or the candidate of a request with the essential data only. */
  base: QuoteData | Omit<IntakeCandidate, "missing">;
  sheet: AniaSheet | null;
  /** Type of quote confirmed in the fifth check. */
  quoteType: QuoteType | null;
}

export interface BotData {
  /** To be checked by QuoteDataSchema. */
  quoteData: Record<string, unknown>;
  /** Paths left «non disponibile», and the vehicle type when it was assumed. */
  notAvailable: string[];
}

const present = (v: unknown) => v !== undefined && v !== null && v !== "";

export function quoteDataFromBot({ base, sheet, quoteType }: BotDataInput): BotData {
  const holder = { ...(base.policyHolder as Record<string, unknown>) };
  const vehicle = { ...(base.vehicle as Record<string, unknown>) };
  const history = { ...(base.history as Record<string, unknown>) };
  const notAvailable: string[] = [];
  const fill = (target: Record<string, unknown>, key: string, value: unknown) => {
    if (!present(target[key]) && present(value)) target[key] = value;
  };

  if (sheet) {
    if (holder.kind === "PERSON") {
      fill(holder, "surname", sheet.surname);
      fill(holder, "givenName", sheet.givenName);
      fill(holder, "fiscalCode", sheet.ownerFiscalCode);
      fill(holder, "sex", sheet.sex);
    }
    fill(vehicle, "make", sheet.make);
    fill(vehicle, "model", sheet.model);
    fill(vehicle, "version", sheet.version);
    fill(vehicle, "type", vehicleTypeOfCategory(sheet.category));
    fill(vehicle, "fuel", fuelOfAnia(sheet.fuel));
    fill(vehicle, "powerKw", sheet.maxPowerKw ? Math.round(sheet.maxPowerKw) : null);
    fill(vehicle, "displacementCc", sheet.displacementCc ? Math.round(sheet.displacementCc) : null);
    fill(vehicle, "firstRegistrationDate", sheet.firstRegistrationDate);
    // ANIA is the register: the dates and the insurance history it says win.
    if (sheet.purchaseDate) vehicle.purchaseDate = sheet.purchaseDate;
    const cu = Number(sheet.cuClass);
    if (Number.isInteger(cu) && cu >= 1 && cu <= 18) history.cuClass = cu;
    if (sheet.currentInsurer?.name) history.currentInsurer = sheet.currentInsurer.name;
    if (sheet.coverExpiry) history.currentExpiryDate = sheet.coverExpiry;
    const year = Number(base.request.startDate.slice(0, 4));
    const main = sheet.mainClaims ?? 0;
    const shared = sheet.sharedClaims ?? 0;
    history.claims =
      main + shared > 0
        ? [{ year, mainResponsibility: main, sharedResponsibility: shared }]
        : (history.claims ?? []);
  }
  if (!Array.isArray(history.claims)) history.claims = [];
  if (quoteType) history.provenance = QUOTE_TYPE_PROVENANCE[quoteType];
  if (!present(vehicle.type)) {
    // The choice of the agencies needs a type: a car, marked to check on the registration.
    vehicle.type = "CAR";
    notAvailable.push("vehicle.type");
  }
  if (!present(vehicle.use)) vehicle.use = "PRIVATE";
  if (!present(vehicle.isNew)) vehicle.isNew = false;

  const drivers = (base.drivers as { person: Record<string, unknown> }[]).map((d) => ({
    ...d,
    // The main driver is the holder when the bots found nothing else.
    person:
      holder.kind === "PERSON" && d.person.fiscalCode === undefined
        ? holder
        : holder.kind === "PERSON" && d.person.fiscalCode === holder.fiscalCode
          ? { ...d.person, ...holder }
          : d.person,
  }));

  for (const path of BOT_OPTIONAL_FIELDS) {
    const [section, key] = path.split(".") as [string, string];
    const target = section === "vehicle" ? vehicle : section === "history" ? history : holder;
    if (section === "policyHolder" && holder.kind !== "PERSON") continue;
    if (!present(target[key])) notAvailable.push(path);
  }

  return {
    quoteData: {
      ...("schemaVersion" in base ? {} : { schemaVersion: 1 }),
      ...base,
      policyHolder: holder,
      drivers,
      drivingFormula: base.drivingFormula ?? "FREE",
      vehicle,
      history,
    },
    notAvailable,
  };
}
