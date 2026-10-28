import { describe, expect, it } from "vitest";
import {
  aniaSheet,
  aniaWarnings,
  claimsInLastYears,
  purchaseDateOf,
  splitCategoryUse,
  splitFullName,
  type AniaRecord,
} from "./ania.js";
import { buildFiscalCode } from "./fiscal-code.js";

// Dan, 2026-10-28: the rules of the ANIA sheet, the same as the CorteXa bot's.
const rules = { today: "2026-10-28", claimsYears: 5, expiryNoticeDays: 60, ownerMinAge: 14 };
const owner = buildFiscalCode({
  surname: "De Luca",
  givenName: "Maria Grazia",
  birthDate: "1985-03-12",
  sex: "F",
  birthPlaceCadastralCode: "H501",
});
const other = buildFiscalCode({
  surname: "Bianchi",
  givenName: "Luca",
  birthDate: "1960-01-01",
  sex: "M",
  birthPlaceCadastralCode: "F205",
});

function must<T>(value: T | null): T {
  if (value === null) throw new Error("expected a value");
  return value;
}

function record(overrides: Partial<AniaRecord> = {}): AniaRecord {
  return {
    plate: "GN123AB",
    readAt: "2026-10-28T09:00:00.000Z",
    vehicle: {
      description: "MARCA PROVA",
      categoryUse: "AUTOVETTURA PER TRASPORTO DI PERSONE / PROPRIO",
      fuel: "BENZINA",
      displacementCc: 1199,
      maxPowerKw: 55,
      fullLoadWeightKg: 1500,
    },
    owner: { fiscalCode: owner, residenceMunicipality: "ROMA", residenceProvince: "RM" },
    registration: {
      firstRegistrationDate: "2018-05-02",
      history: [
        { issuedOn: "2018-05-02", ownerFiscalCode: other },
        { issuedOn: "2021-09-10", ownerFiscalCode: owner },
        { issuedOn: "2020-02-01", ownerFiscalCode: owner },
      ],
    },
    latestCover: {
      company: { code: "123", name: "COMPAGNIA ALFA" },
      policyHolderFiscalCode: owner,
      coverExpiry: "2027-03-31",
      contractExpiry: "2027-03-31",
    },
    latestCertificate: {
      company: { code: "123", name: "COMPAGNIA ALFA" },
      policyHolderFiscalCode: owner,
      vehicleType: "AUTOVETTURA",
      entitledName: "DE LUCA MARIA GRAZIA",
      entitledFiscalCode: owner,
      assignedClass: "1",
      assignedClassCu: "1",
      claims: [
        { year: 2026, group: "MAIN", total: null, things: 1, people: 0, peopleAndThings: "--" },
        { year: 2022, group: "MAIN", total: null, things: 1, people: "N.A.", peopleAndThings: 0 },
        { year: 2021, group: "MAIN", total: null, things: 5, people: 0, peopleAndThings: 0 },
        { year: 2025, group: "SHARED", total: null, things: 0, people: 1, peopleAndThings: 0 },
      ],
    },
    ...overrides,
  };
}

describe("ANIA sheet", () => {
  it("separates category and use; an unconfirmed code or two slashes give nothing", () => {
    expect(splitCategoryUse("AUTOVETTURA PER TRASPORTO DI PERSONE / PROPRIO")).toEqual({
      category: "AUTOVETTURA",
      use: "PROPRIO",
    });
    expect(splitCategoryUse("C6")).toEqual({ category: null, use: null });
    expect(splitCategoryUse("A / B / C")).toEqual({ category: null, use: null });
  });

  it("sums the claims of the last five years; N.D. makes the total unknown", () => {
    const claims = record().latestCertificate?.claims ?? [];
    expect(claimsInLastYears(claims, "MAIN", 5)).toBe(2);
    expect(claimsInLastYears(claims, "SHARED", 5)).toBe(1);
    expect(
      claimsInLastYears(
        [{ year: 2026, group: "MAIN", total: null, things: "N.D.", people: 0, peopleAndThings: 0 }],
        "MAIN",
        5,
      ),
    ).toBeNull();
  });

  it("the purchase date is the oldest registration row with the owner's code", () => {
    expect(purchaseDateOf(record().registration.history, owner)).toBe("2020-02-01");
    expect(purchaseDateOf(record().registration.history, "N.D.")).toBeNull();
  });

  it("splits the full name only when the fiscal code confirms one split", () => {
    expect(splitFullName("DE LUCA MARIA GRAZIA", owner)).toEqual({
      surname: "DE LUCA",
      givenName: "MARIA GRAZIA",
    });
    expect(splitFullName("MARIA GRAZIA DE LUCA", owner)).toEqual({
      surname: "DE LUCA",
      givenName: "MARIA GRAZIA",
    });
    expect(splitFullName("ROSSI MARIO", owner)).toEqual({ surname: null, givenName: null });
  });

  it("birth data from the fiscal code, the name only when the entitled person is the owner, weight only for trucks", () => {
    const sheet = aniaSheet(record(), rules);
    expect(sheet).toMatchObject({
      category: "AUTOVETTURA",
      use: "PROPRIO",
      birthDate: "1985-03-12",
      sex: "F",
      birthPlaceCadastralCode: "H501",
      bornAbroad: false,
      surname: "DE LUCA",
      fullLoadWeightKg: null,
      purchaseDate: "2020-02-01",
      cuClass: "1",
      mainClaims: 2,
      currentInsurer: { code: "123", name: "COMPAGNIA ALFA" },
    });
    const notOwner = record({
      latestCertificate: { ...must(record().latestCertificate), entitledFiscalCode: other },
    });
    expect(aniaSheet(notOwner, rules).fullName).toBeNull();
    const truck = record({ vehicle: { ...record().vehicle, categoryUse: "AUTOCARRO / PROPRIO" } });
    expect(aniaSheet(truck, rules).fullLoadWeightKg).toBe(1500);
  });

  it("an owner younger than 14 this year belongs to the 1900s (2013 → 1913, 2012 stays)", () => {
    const young = buildFiscalCode({
      surname: "Verdi",
      givenName: "Anna",
      birthDate: "2013-01-01",
      sex: "F",
      birthPlaceCadastralCode: "H501",
    });
    const sheet = aniaSheet(record({ owner: { ...record().owner, fiscalCode: young } }), rules);
    expect(sheet.birthDate).toBe("1913-01-01");
  });

  it("warnings: type, holder, entitled, expiry (the expiry day still covers), certificate, class", () => {
    expect(aniaWarnings(record(), rules)).toEqual([]);
    const expiring = record({
      latestCover: { ...must(record().latestCover), coverExpiry: "2026-12-27" },
    });
    expect(aniaWarnings(expiring, rules)).toEqual(["COVER_EXPIRING"]);
    const today = record({
      latestCover: { ...must(record().latestCover), coverExpiry: "2026-10-28" },
    });
    expect(aniaWarnings(today, rules)).toEqual(["COVER_EXPIRING"]);
    const expired = record({
      vehicle: { ...record().vehicle, categoryUse: "T6" },
      latestCover: {
        ...must(record().latestCover),
        coverExpiry: "2026-10-27",
        policyHolderFiscalCode: other,
      },
      latestCertificate: null,
    });
    expect(aniaWarnings(expired, rules)).toEqual([
      "TYPE_NOT_IDENTIFIED",
      "HOLDER_NOT_OWNER",
      "COVER_EXPIRED",
      "NO_CERTIFICATE",
    ]);
    const noClass = record({
      latestCertificate: {
        ...must(record().latestCertificate),
        assignedClassCu: "N.D.",
        policyHolderFiscalCode: other,
      },
      latestCover: null,
    });
    expect(aniaWarnings(noClass, rules)).toEqual([
      "HOLDER_NOT_OWNER",
      "ENTITLED_NOT_HOLDER",
      "CU_CLASS_MISSING",
    ]);
  });
});
