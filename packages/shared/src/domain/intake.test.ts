import { describe, expect, it } from "vitest";
import { buildFiscalCode } from "./fiscal-code.js";
import {
  documentReadable,
  IntakeSchema,
  intakeDocuments,
  quoteDataFromIntake,
  type Intake,
} from "./intake.js";

// ADR 0013, Dan 2026-10-21: the essential data of the private customer.
const residence = {
  street: "Via delle Prove 1",
  postalCode: "20121",
  municipalityIstat: "015146",
  province: "MI",
};
const insured: Intake = IntakeSchema.parse({
  vehicleStatus: "INSURED",
  plate: "gn 123 ab",
  ownerBirthDate: "1990-05-12",
  residence,
  drivingFormula: "FREE",
});
const request = {
  packageCode: "RECOMMENDED" as const,
  packageVersion: 1,
  startDate: "2026-11-30",
  startMode: "DATE" as const,
  blackBox: false,
  paymentFrequency: "ANNUAL" as const,
  auctionDurationHours: 2,
  minValidityDays: 15,
};
// What the fake bot reads from Giulia Neri's documents (fixtures of the document reader).
const evidence = {
  extracted: {
    REGISTRATION_CERTIFICATE: {
      plate: "GN123AB",
      vehicleType: "CAR",
      use: "PRIVATE",
      ownerSurname: "Neri",
      ownerGivenName: "Giulia",
      ownerFiscalCode: "NREGLI90E52F205X",
    },
    DRIVING_LICENCE: {
      number: "MI5550001X",
      category: "B",
      issuedOn: "2009-06-01",
      expiresOn: "2034-05-12",
    },
    RISK_CERTIFICATE: {
      cuClass: 1,
      currentInsurer: "Compagnia Alfa",
      expiryDate: "2026-11-30",
      riskUniqueId: "IUR0000000001",
      claimsMainLast5y: 0,
      claimsSharedLast5y: 0,
    },
  },
  vehicle: {
    make: "Marca Prova",
    model: "Modello Uno",
    fuel: "PETROL",
    powerKw: 55,
    firstRegistrationDate: "2019-03-01",
  },
  istatOfCadastral: (cadastral: string) => (cadastral === "F205" ? "015146" : null),
  today: "2026-10-21",
};

describe("ADR 0013: the request in two stages", () => {
  it("the essential data: plate, owner's birth date, residence, type of driving", () => {
    expect(insured.plate).toBe("GN123AB");
    expect(IntakeSchema.safeParse({ ...insured, plate: "" }).success).toBe(false);
    // The type of driving has its own screen: saved later, required at the submission.
    expect(IntakeSchema.safeParse({ ...insured, drivingFormula: undefined }).success).toBe(true);
    const candidate = quoteDataFromIntake(
      { ...insured, drivingFormula: undefined },
      request,
      evidence,
    );
    expect(candidate.missing).toContain("drivingFormula");
  });

  it("a new vehicle needs where the class comes from: plate, and birth date for a relative", () => {
    const base = { ...insured, vehicleStatus: "NEW" };
    expect(IntakeSchema.safeParse(base).success).toBe(false);
    expect(
      IntakeSchema.safeParse({ ...base, classSource: { kind: "SOLD_VEHICLE", plate: "AB123CD" } })
        .success,
    ).toBe(true);
    expect(
      IntakeSchema.safeParse({ ...base, classSource: { kind: "FAMILY", plate: "AB123CD" } })
        .success,
    ).toBe(false);
    expect(
      IntakeSchema.safeParse({
        ...base,
        classSource: { kind: "FAMILY", plate: "AB123CD", relativeBirthDate: "1960-01-01" },
      }).success,
    ).toBe(true);
    // Answer 1A: the first policy ever needs no other vehicle.
    expect(IntakeSchema.safeParse({ ...base, classSource: { kind: "FIRST_POLICY" } }).success).toBe(
      true,
    );
  });

  it("the documents: registration and ID card, also for a vehicle already insured (Dan, 2026-10-28)", () => {
    expect(intakeDocuments()).toEqual(["REGISTRATION_CERTIFICATE", "IDENTITY_DOCUMENT"]);
  });

  it("the back office starts from what the bot read: holder, licence, vehicle, class", () => {
    const c = quoteDataFromIntake(insured, request, evidence);
    expect(c.policyHolder).toEqual({
      kind: "PERSON",
      surname: "Neri",
      givenName: "Giulia",
      fiscalCode: "NREGLI90E52F205X",
      birthDate: "1990-05-12",
      birthPlace: "015146",
      sex: "F",
      residence,
    });
    expect(c.drivers[0]).toMatchObject({ isMain: true, licence: { number: "MI5550001X" } });
    expect(c.vehicle).toMatchObject({ plate: "GN123AB", type: "CAR", make: "Marca Prova" });
    expect(c.history).toMatchObject({ provenance: "FROM_OTHER_COMPANY", cuClass: 1, claims: [] });
    expect(c.drivingFormula).toBe("FREE");
    // Only the purchase date is never on a document.
    expect(c.missing).toEqual(["vehicle.purchaseDate"]);
  });

  it("LEG-04 the broker's customer is the holder: its name and fiscal code win over the documents", () => {
    const fiscalCode = buildFiscalCode({
      surname: "Riva",
      givenName: "Anna",
      birthDate: "1985-09-03",
      sex: "F",
      birthPlaceCadastralCode: "F205",
    });
    const c = quoteDataFromIntake(insured, request, {
      ...evidence,
      customer: { surname: "Riva", givenName: "Anna", fiscalCode },
    });
    expect(c.policyHolder).toMatchObject({
      surname: "Riva",
      givenName: "Anna",
      fiscalCode,
      sex: "F",
    });
  });

  it("question 25: a company customer is the holder with its seat; the driver is the person of the licence", () => {
    const c = quoteDataFromIntake({ ...insured, ownerBirthDate: undefined }, request, {
      ...evidence,
      customer: { kind: "COMPANY", companyName: "Trasporti Prova Srl", vatNumber: "01234567897" },
    });
    expect(c.policyHolder).toEqual({
      kind: "COMPANY",
      companyName: "Trasporti Prova Srl",
      vatNumber: "01234567897",
      registeredOffice: residence,
    });
    expect(c.drivers[0]?.person).toMatchObject({ kind: "PERSON", residence });
    expect(c.missing).not.toContain("policyHolder.birthDate");
  });

  it("nothing is invented: what the bot did not read is listed for the back office", () => {
    const c = quoteDataFromIntake(
      { ...insured, vehicleStatus: "NEW", classSource: { kind: "OWN_VEHICLE", plate: "AB123CD" } },
      request,
      { ...evidence, extracted: {}, vehicle: null },
    );
    expect(c.policyHolder).not.toHaveProperty("fiscalCode");
    expect(c.missing).toEqual(
      expect.arrayContaining([
        "policyHolder.surname",
        "policyHolder.fiscalCode",
        "drivers.0.licence.number",
        "vehicle.make",
        "history.provenance",
        "history.claims",
        "history.classSource",
      ]),
    );
  });
});

describe("ADR 0013: readable photos", () => {
  it("readable when a field is above the threshold and no warning says otherwise", () => {
    const field = (confidence: number) => ({ plate: { confidence } });
    expect(documentReadable({ fields: field(0.95), warnings: [] }, 0.85)).toBe(true);
    expect(documentReadable({ fields: field(0.4), warnings: [] }, 0.85)).toBe(false);
    expect(documentReadable({ fields: {}, warnings: [] }, 0.85)).toBe(false);
    expect(documentReadable({ fields: field(0.95), warnings: ["UNREADABLE"] }, 0.85)).toBe(false);
    expect(documentReadable({ fields: field(0.95), warnings: ["WRONG_DOCUMENT"] }, 0.85)).toBe(
      false,
    );
    // A document the bot does not read (a consent form) is never refused here.
    expect(documentReadable(null, 0.85)).toBe(true);
  });
});
