import { describe, expect, it } from "vitest";
import { fuelOfAnia, quoteDataFromBot, vehicleTypeOfCategory } from "./bot-data.js";
import { QuoteDataSchema } from "./quote-data.js";
import type { AniaSheet } from "./ania.js";

// Dan, 2026-10-28 (docs/piano-dati-dal-bot.md): the data from the bots, confirmed by the operator.
const sheet: AniaSheet = {
  make: "MARCA PROVA",
  model: "MODELLO UNO",
  version: null,
  category: "AUTOVETTURA",
  use: "PROPRIO",
  fuel: "BENZINA/GPL",
  displacementCc: 1199,
  maxPowerKw: 51.5,
  fullLoadWeightKg: null,
  firstRegistrationDate: "2018-05-02",
  purchaseDate: "2020-02-01",
  ownerFiscalCode: "NRIGLI90E52F205Z",
  fullName: "NERI GIULIA",
  surname: "NERI",
  givenName: "GIULIA",
  birthDate: "1990-05-12",
  sex: "F",
  birthPlaceCadastralCode: "F205",
  bornAbroad: false,
  residenceMunicipality: "MILANO",
  residenceProvince: "MI",
  currentInsurer: { code: "901", name: "COMPAGNIA ALFA" },
  coverExpiry: "2027-03-31",
  contractExpiry: "2027-03-31",
  cuClass: "3",
  internalClass: "3",
  mainClaims: 1,
  sharedClaims: 0,
};

const candidate = {
  policyHolder: {
    kind: "PERSON",
    surname: "Neri",
    givenName: "Giulia",
    fiscalCode: "NRIGLI90E52F205Z",
    birthDate: "1990-05-12",
    birthPlace: "015146",
    residence: {
      street: "Via Roma 1",
      postalCode: "20121",
      municipalityIstat: "015146",
      province: "MI",
    },
  },
  vehicleOwner: "SAME_AS_POLICY_HOLDER" as const,
  drivers: [{ person: { kind: "PERSON" }, isMain: true }],
  drivingFormula: undefined,
  vehicle: { plate: "GN123AB", use: "PRIVATE", isNew: false },
  history: { provenance: "FROM_OTHER_COMPANY" },
  request: {
    packageCode: "RECOMMENDED" as const,
    packageVersion: 2,
    startDate: "2026-11-02",
    startMode: "ON_ISSUANCE" as const,
    blackBox: false,
    paymentFrequency: "ANNUAL" as const,
    minValidityDays: 7,
    auctionDurationHours: 2,
  },
};

describe("data from the bots", () => {
  it("category and fuel of ANIA as the codes of the lists", () => {
    expect(vehicleTypeOfCategory("AUTOVETTURA")).toBe("CAR");
    expect(vehicleTypeOfCategory("AUTOCARRO")).toBe("LIGHT_TRUCK_OWN_USE");
    expect(vehicleTypeOfCategory("C6")).toBeNull();
    expect(fuelOfAnia("BENZINA/GPL")).toBe("LPG");
    expect(fuelOfAnia("IBRIDO BENZINA/ELETTRICO")).toBe("HYBRID");
    expect(fuelOfAnia("GASOLIO")).toBe("DIESEL");
  });

  it("ANIA fills the vehicle and the insurance history; the confirmed type sets the provenance", () => {
    const { quoteData, notAvailable } = quoteDataFromBot({
      base: candidate as never,
      sheet,
      quoteType: "RENEWAL",
    });
    const parsed = QuoteDataSchema.safeParse(quoteData);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(quoteData).toMatchObject({
      vehicle: {
        type: "CAR",
        fuel: "LPG",
        powerKw: 52,
        purchaseDate: "2020-02-01",
        make: "MARCA PROVA",
      },
      history: {
        provenance: "FROM_OTHER_COMPANY",
        cuClass: 3,
        currentInsurer: "COMPAGNIA ALFA",
        currentExpiryDate: "2027-03-31",
        claims: [{ year: 2026, mainResponsibility: 1, sharedResponsibility: 0 }],
      },
      drivingFormula: "FREE",
    });
    expect(notAvailable).toEqual([]);
  });

  it("without ANIA: what nobody found is «non disponibile», the type a car to check, and the data is still valid", () => {
    const { quoteData, notAvailable } = quoteDataFromBot({
      base: {
        ...candidate,
        vehicle: { ...candidate.vehicle, make: "MARCA", model: "UNO" },
      } as never,
      sheet: null,
      quoteType: "NEW_VEHICLE",
    });
    expect(notAvailable).toEqual([
      "vehicle.type",
      "vehicle.fuel",
      "vehicle.powerKw",
      "vehicle.firstRegistrationDate",
      "vehicle.purchaseDate",
      "policyHolder.sex",
      "history.cuClass",
      "history.currentInsurer",
      "history.currentExpiryDate",
    ]);
    const parsed = QuoteDataSchema.safeParse(quoteData);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });
});
