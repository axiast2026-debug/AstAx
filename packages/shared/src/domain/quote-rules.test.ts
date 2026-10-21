import { describe, expect, it } from "vitest";
import { type AutoCheckInput, type ExtractedDocument, runAutoCheck } from "./auto-check.js";
import { buildFiscalCode } from "./fiscal-code.js";
import {
  QuoteDataSchema,
  QuoteDraftSchema,
  missingDraftSections,
  quoteDataFromDraft,
} from "./quote-data.js";
import {
  type ExclusionCase,
  type SubmissionContext,
  derivedColumns,
  drivingFormulaProblems,
  isPossibleVintage,
  requiredDocuments,
  submissionProblems,
  wizardBlockingExclusions,
} from "./quote-rules.js";
import { MILAN, sampleQuoteData } from "./sample-quote-data.js";

const TODAY = "2026-10-15";

function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new Error(`no item ${index}`);
  return value;
}

const EXCLUSION_CASES: ExclusionCase[] = [
  { code: "VINTAGE", blockingInWizard: false },
  { code: "FOREIGN_OR_TEMPORARY_PLATE", blockingInWizard: true },
  { code: "TAXI", blockingInWizard: true },
  { code: "RENTAL", blockingInWizard: true },
];

const SUBMISSION: SubmissionContext = {
  today: TODAY,
  expertMinAge: 26,
  auctionDurations: [1, 2, 5, 24],
  minValidityDaysOptions: [7, 15, 30],
  packageIncludesTheft: false,
};

function documents(): ExtractedDocument[] {
  const quote = sampleQuoteData();
  const high = (value: string | number) => ({ value, confidence: 0.97 });
  return [
    {
      kind: "REGISTRATION_CERTIFICATE",
      fields: {
        plate: high(quote.vehicle.plate),
        ownerFiscalCode: high(
          quote.policyHolder.kind === "PERSON" ? quote.policyHolder.fiscalCode : "",
        ),
        ownerMunicipalityIstat: high(MILAN.istat),
      },
    },
    { kind: "DRIVING_LICENCE", driverIndex: 0, fields: { number: high("MI5550001X") } },
    { kind: "RISK_CERTIFICATE", fields: { cuClass: high(1) } },
  ];
}

function checkInput(overrides: Partial<AutoCheckInput> = {}): AutoCheckInput {
  return {
    quoteData: sampleQuoteData(),
    documents: documents(),
    plateLookup: { make: "Marca Prova", model: "Modello Uno", firstRegistrationDate: "2019-03-15" },
    today: TODAY,
    confidenceThreshold: 0.9,
    vintageAgeYears: 30,
    expertMinAge: 26,
    exclusionCases: EXCLUSION_CASES,
    istatOfCadastral: (code) => (code === MILAN.cadastral ? MILAN.istat : null),
    ...overrides,
  };
}

describe("quoteData schema", () => {
  it("accepts the sample request", () => {
    expect(QuoteDataSchema.parse(sampleQuoteData())).toEqual(sampleQuoteData());
  });

  it("VIS-01 has no place for the customer's phone or email, anywhere", () => {
    const quote = sampleQuoteData();
    const withContacts = [
      { ...quote, phone: "+390000000000" },
      { ...quote, policyHolder: { ...quote.policyHolder, email: "giulia.neri@example.test" } },
      { ...quote, request: { ...quote.request, customerPhone: "+390000000000" } },
      {
        ...quote,
        drivers: quote.drivers.map((d) => ({
          ...d,
          person: { ...d.person, phone: "+390000000000" },
        })),
      },
    ];
    for (const value of withContacts) expect(QuoteDataSchema.safeParse(value).success).toBe(false);
    const keys = JSON.stringify(QuoteDataSchema.toJSONSchema()).toLowerCase();
    for (const word of ["phone", "email", "mail", "telefono", "mobile"])
      expect(keys).not.toContain(`"${word}`);
  });

  it("VIS-12 does not collect nationality", () => {
    const json = JSON.stringify(QuoteDataSchema.toJSONSchema()).toLowerCase();
    expect(json).not.toContain("nationality");
    expect(json).not.toContain("citizenship");
  });

  it("normalizes plate and fiscal code", () => {
    const quote = sampleQuoteData();
    const parsed = QuoteDataSchema.parse({
      ...quote,
      vehicle: { ...quote.vehicle, plate: "gn 123 ab" },
    });
    expect(parsed.vehicle.plate).toBe("GN123AB");
  });

  it("builds quoteData from a complete draft only", () => {
    const quote = sampleQuoteData();
    const draft = QuoteDraftSchema.parse({
      policyHolder: quote.policyHolder,
      vehicleOwner: quote.vehicleOwner,
      vehicle: quote.vehicle,
      history: quote.history,
      driving: { drivers: quote.drivers, drivingFormula: quote.drivingFormula },
    });
    expect(missingDraftSections(draft)).toEqual(["request"]);
    expect(quoteDataFromDraft(draft)).toBeNull();
    expect(quoteDataFromDraft({ ...draft, request: quote.request })).toEqual(quote);
  });
});

describe("excluded cases", () => {
  it("ASTA-10 a special use declared in the wizard blocks the submission", () => {
    expect(wizardBlockingExclusions({ specialUses: ["TAXI"] }, EXCLUSION_CASES)).toEqual(["TAXI"]);
    expect(wizardBlockingExclusions({ specialUses: [] }, EXCLUSION_CASES)).toEqual([]);
  });

  it("ASTA-10 a foreign or temporary plate blocks the submission", () => {
    const vehicle = { ...sampleQuoteData().vehicle, plate: "BAB1234X" };
    expect(wizardBlockingExclusions({ vehicle }, EXCLUSION_CASES)).toEqual([
      "FOREIGN_OR_TEMPORARY_PLATE",
    ]);
  });

  it("ASTA-10 a non-blocking case (vintage) never blocks the wizard", () => {
    expect(wizardBlockingExclusions({ specialUses: ["VINTAGE"] }, EXCLUSION_CASES)).toEqual([]);
  });

  it("a vehicle is a possible vintage from 30 completed years at the policy start", () => {
    const quote = sampleQuoteData();
    const at = (firstRegistrationDate: string) =>
      isPossibleVintage({ ...quote, vehicle: { ...quote.vehicle, firstRegistrationDate } }, 30);
    expect(at("1996-12-01")).toBe(false);
    expect(at("1996-11-30")).toBe(true);
  });
});

describe("driving formula", () => {
  it("expert: every driver must have the minimum age from the parameters", () => {
    expect(drivingFormulaProblems("EXPERT", [26, 40], 26)).toEqual([]);
    expect(drivingFormulaProblems("EXPERT", [25, 40], 26)).toEqual(["EXPERT_DRIVER_TOO_YOUNG"]);
    expect(drivingFormulaProblems("EXPERT", [25], 25)).toEqual([]);
  });

  it("exclusive: exactly one driver; free: anything", () => {
    expect(drivingFormulaProblems("EXCLUSIVE", [30, 40], 26)).toEqual([
      "EXCLUSIVE_NEEDS_ONE_DRIVER",
    ]);
    expect(drivingFormulaProblems("FREE", [18, 19], 26)).toEqual([]);
  });
});

describe("submission", () => {
  it("accepts the sample request", () => {
    expect(submissionProblems(sampleQuoteData(), SUBMISSION)).toEqual([]);
  });

  it("requires CU class and current insurer unless first registration", () => {
    const quote = sampleQuoteData();
    const noClass = { ...quote, history: { provenance: "FROM_OTHER_COMPANY", claims: [] } };
    expect(submissionProblems(noClass, SUBMISSION)).toEqual([
      "CU_CLASS_REQUIRED",
      "CURRENT_INSURER_REQUIRED",
    ]);
    const first = { ...quote, history: { provenance: "FIRST_REGISTRATION", claims: [] } };
    expect(submissionProblems(first, SUBMISSION)).toEqual([]);
  });

  it("rule 7: duration and validity must be among the options in force", () => {
    const quote = sampleQuoteData();
    const odd = {
      ...quote,
      request: { ...quote.request, auctionDurationHours: 3, minValidityDays: 10 },
    };
    expect(submissionProblems(odd, SUBMISSION)).toEqual([
      "AUCTION_DURATION_NOT_ALLOWED",
      "MIN_VALIDITY_NOT_ALLOWED",
    ]);
  });

  it("rejects a start date in the past and a young driver with the expert formula", () => {
    const quote = sampleQuoteData();
    const young = buildFiscalCode({
      surname: "Neri",
      givenName: "Luca",
      birthDate: "2005-01-10",
      sex: "M",
      birthPlaceCadastralCode: MILAN.cadastral,
    });
    const driver = at(quote.drivers, 0);
    const value = {
      ...quote,
      drivers: [
        driver,
        {
          ...driver,
          isMain: false,
          person: {
            ...driver.person,
            givenName: "Luca",
            fiscalCode: young,
            birthDate: "2005-01-10",
            sex: "M" as const,
          },
        },
      ],
      request: { ...quote.request, startDate: "2026-10-14" },
    };
    expect(submissionProblems(value, SUBMISSION)).toEqual([
      "EXPERT_DRIVER_TOO_YOUNG",
      "START_DATE_IN_THE_PAST",
    ]);
  });

  it("requires the market value when the package includes theft and fire", () => {
    expect(
      submissionProblems(sampleQuoteData(), { ...SUBMISSION, packageIncludesTheft: true }),
    ).toEqual(["MARKET_VALUE_REQUIRED"]);
  });

  it("asks for the risk certificate only when the vehicle comes from another policy", () => {
    const quote = sampleQuoteData();
    expect(requiredDocuments(quote).map((d) => d.kind)).toEqual([
      "REGISTRATION_CERTIFICATE",
      "DRIVING_LICENCE",
      "RISK_CERTIFICATE",
    ]);
    const first = { ...quote, history: { provenance: "FIRST_REGISTRATION", claims: [] } };
    expect(requiredDocuments(first).map((d) => d.kind)).toEqual([
      "REGISTRATION_CERTIFICATE",
      "DRIVING_LICENCE",
    ]);
  });
});

describe("derived columns", () => {
  it("computes the columns used by filters and agency selection", () => {
    const quote = sampleQuoteData();
    const value = {
      ...quote,
      history: {
        ...quote.history,
        claims: [
          { year: 2021, mainResponsibility: 1, sharedResponsibility: 0 },
          { year: 2024, mainResponsibility: 0, sharedResponsibility: 1 },
          { year: 2020, mainResponsibility: 3, sharedResponsibility: 0 },
        ],
      },
    };
    expect(derivedColumns(value)).toEqual({
      vehicleType: "CAR",
      province: "MI",
      cuClass: 1,
      claimsLast5y: 2,
      youngestDriverAge: 36,
      packageCode: "BASE",
      startDate: "2026-11-30",
      // Question 1: data saved before the modes have a chosen date.
      startMode: "DATE",
      chosenCoverages: [],
      minValidityDays: 15,
    });
  });
});

describe("automatic check", () => {
  it("is GREEN for a coherent request with clear documents", () => {
    const result = runAutoCheck(checkInput());
    expect(result.items.filter((i) => i.outcome !== "GREEN")).toEqual([]);
    expect(result.outcome).toBe("GREEN");
  });

  it("is RED with the reason for a vehicle of more than thirty years", () => {
    const quote = sampleQuoteData();
    const old = {
      ...quote,
      vehicle: {
        ...quote.vehicle,
        firstRegistrationDate: "1990-04-01",
        purchaseDate: "1990-04-01",
      },
    };
    const result = runAutoCheck(
      checkInput({ quoteData: old, plateLookup: { make: "Marca Prova", model: "x" } }),
    );
    expect(result.outcome).toBe("RED");
    expect(result.items.find((i) => i.code === "EXCLUDED_CASES")).toMatchObject({
      outcome: "RED",
      reasons: ["VINTAGE"],
      fields: ["vehicle.firstRegistrationDate"],
    });
  });

  it("is RED for an invalid fiscal code or one not matching the birth data", () => {
    const quote = sampleQuoteData();
    const holder = quote.policyHolder;
    if (holder.kind !== "PERSON") throw new Error("sample holder is a person");
    const invalid = { ...quote, policyHolder: { ...holder, fiscalCode: "NREGLI90E52F205A" } };
    expect(
      runAutoCheck(checkInput({ quoteData: invalid })).items.find((i) => i.code === "FISCAL_CODES"),
    ).toMatchObject({
      outcome: "RED",
      reasons: ["FISCAL_CODE_INVALID"],
      fields: ["policyHolder.fiscalCode"],
    });
    const otherDate = { ...quote, policyHolder: { ...holder, birthDate: "1990-05-13" } };
    expect(runAutoCheck(checkInput({ quoteData: otherDate })).outcome).toBe("RED");
  });

  it("is RED for a licence expired at the policy start", () => {
    const quote = sampleQuoteData();
    const driver = at(quote.drivers, 0);
    const expired = {
      ...quote,
      drivers: [{ ...driver, licence: { ...driver.licence, expiresOn: "2026-11-29" } }],
    };
    const result = runAutoCheck(checkInput({ quoteData: expired }));
    expect(result.outcome).toBe("RED");
    expect(result.items.find((i) => i.code === "DRIVING_LICENCES")?.fields).toEqual([
      "drivers.0.licence.expiresOn",
    ]);
  });

  it("is YELLOW for fields read below the confidence threshold, with the fields highlighted", () => {
    const docs = documents();
    docs[1] = {
      kind: "DRIVING_LICENCE",
      driverIndex: 0,
      fields: { number: { value: "MI5550001X", confidence: 0.6 } },
    };
    const result = runAutoCheck(checkInput({ documents: docs }));
    expect(result.outcome).toBe("YELLOW");
    expect(result.items.find((i) => i.code === "DOCUMENTS")).toMatchObject({
      outcome: "YELLOW",
      reasons: ["LOW_CONFIDENCE"],
      fields: ["documents.DRIVING_LICENCE.0.number"],
    });
  });

  it("is YELLOW when the residence differs from the registration certificate", () => {
    const docs = documents();
    docs[0] = {
      ...at(docs, 0),
      fields: {
        ...at(docs, 0).fields,
        ownerMunicipalityIstat: { value: "058091", confidence: 0.95 },
      },
    };
    const result = runAutoCheck(checkInput({ documents: docs }));
    expect(result.outcome).toBe("YELLOW");
    expect(result.items.find((i) => i.code === "RESIDENCE")?.reasons).toEqual([
      "RESIDENCE_DIFFERS_FROM_REGISTRATION",
    ]);
  });

  it("is YELLOW when a required document is missing or the plate lookup failed", () => {
    expect(
      runAutoCheck(checkInput({ documents: documents().slice(0, 2) })).items.find(
        (i) => i.code === "DOCUMENTS",
      )?.reasons,
    ).toEqual(["MISSING_RISK_CERTIFICATE"]);
    expect(runAutoCheck(checkInput({ plateLookup: null })).outcome).toBe("YELLOW");
  });

  it("RED wins over YELLOW", () => {
    const quote = sampleQuoteData();
    const old = {
      ...quote,
      vehicle: {
        ...quote.vehicle,
        firstRegistrationDate: "1990-04-01",
        purchaseDate: "1990-04-01",
      },
    };
    expect(runAutoCheck(checkInput({ quoteData: old, plateLookup: null })).outcome).toBe("RED");
  });
});
