import type { AniaSheet } from "@astax/shared/domain";
import { describe, expect, it } from "vitest";
import { agencySheet } from "./agency-view.js";

const sheet: AniaSheet = {
  make: "MARCA PROVA",
  model: "MODELLO UNO",
  version: null,
  category: "AUTOVETTURA",
  use: "PROPRIO",
  fuel: "BENZINA",
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

describe("agencySheet", () => {
  it("VIS-01 Dan 2026-10-30: no owner's name, no cover or contract expiry; birth date, place and sex stay", () => {
    const s = agencySheet(sheet);
    expect(s).toMatchObject({
      fullName: null,
      surname: null,
      givenName: null,
      coverExpiry: null,
      contractExpiry: null,
      birthDate: "1990-05-12",
      birthPlaceCadastralCode: "F205",
      sex: "F",
      cuClass: "3",
    });
  });
});
