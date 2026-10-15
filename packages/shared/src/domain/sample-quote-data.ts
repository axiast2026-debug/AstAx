import { buildFiscalCode } from "./fiscal-code.js";
import { type QuoteData, QUOTE_DATA_SCHEMA_VERSION } from "./quote-data.js";

/**
 * A complete, valid `quoteData` with synthetic data (CLAUDE.md rule 11),
 * for tests and the seed: Giulia Neri, born in Milan, with her own car.
 * Milan is cadastral code F205, ISTAT 015146.
 */
export const MILAN = {
  cadastral: "F205",
  istat: "015146",
  province: "MI",
  postalCode: "20121",
} as const;

export function sampleQuoteData(): QuoteData {
  const giulia = {
    kind: "PERSON" as const,
    surname: "Neri",
    givenName: "Giulia",
    fiscalCode: buildFiscalCode({
      surname: "Neri",
      givenName: "Giulia",
      birthDate: "1990-05-12",
      sex: "F",
      birthPlaceCadastralCode: MILAN.cadastral,
    }),
    birthDate: "1990-05-12",
    birthPlace: MILAN.istat,
    sex: "F" as const,
    residence: {
      street: "Via delle Prove 1",
      postalCode: MILAN.postalCode,
      municipalityIstat: MILAN.istat,
      province: MILAN.province,
    },
  };
  return {
    schemaVersion: QUOTE_DATA_SCHEMA_VERSION,
    policyHolder: giulia,
    vehicleOwner: "SAME_AS_POLICY_HOLDER",
    drivers: [
      {
        person: giulia,
        isMain: true,
        licence: {
          category: "B",
          number: "MI5550001X",
          issuedOn: "2009-06-01",
          expiresOn: "2029-05-12",
        },
      },
    ],
    drivingFormula: "EXPERT",
    vehicle: {
      plate: "GN123AB",
      type: "CAR",
      use: "PRIVATE",
      make: "Marca Prova",
      model: "Modello Uno",
      fuel: "PETROL",
      displacementCc: 1200,
      powerKw: 55,
      firstRegistrationDate: "2019-03-15",
      purchaseDate: "2019-03-15",
      isNew: true,
    },
    history: {
      provenance: "FROM_OTHER_COMPANY",
      cuClass: 1,
      claims: [],
      currentInsurer: "Compagnia Alfa",
      currentExpiryDate: "2026-11-30",
    },
    request: {
      packageCode: "BASE",
      packageVersion: 1,
      startDate: "2026-11-30",
      blackBox: false,
      paymentFrequency: "ANNUAL",
      auctionDurationHours: 2,
      minValidityDays: 15,
    },
  };
}
