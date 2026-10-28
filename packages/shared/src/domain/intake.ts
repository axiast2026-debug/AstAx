import { z } from "zod";
import { isCalendarDate } from "./calendar-date.js";
import { decodeFiscalCode } from "./fiscal-code.js";
import { normalizePlate } from "./plates.js";
import {
  AddressSchema,
  DRIVING_FORMULAS,
  type QuoteData,
  type RequestTermsSchema,
} from "./quote-data.js";

/**
 * The essential data of the private customer (ADR 0013, Dan 2026-10-21,
 * docs/piano-flusso-semplificato.md): what the customer writes. The rest of
 * `quoteData` comes from the documents read by the bot and is confirmed by
 * the back office before the auction.
 */
const calendarDate = z.string().refine(isCalendarDate, { message: "INVALID_DATE" });
const plate = z
  .string()
  .transform(normalizePlate)
  .pipe(z.string().regex(/^[A-Z0-9]{5,10}$/));

/** Where the merit class of a vehicle to insure for the first time comes from. */
export const CLASS_SOURCES = ["OWN_VEHICLE", "SOLD_VEHICLE", "FAMILY", "FIRST_POLICY"] as const;
export type ClassSource = (typeof CLASS_SOURCES)[number];

export const IntakeSchema = z
  .strictObject({
    /** «Già assicurato» or «Nuovo da assicurare». */
    vehicleStatus: z.enum(["INSURED", "NEW"]),
    plate,
    /**
     * Required for a person; a company has none (Dan, 2026-10-22, question 25:
     * the lots and the requests for companies). Checked at the submission.
     */
    ownerBirthDate: calendarDate.optional(),
    residence: AddressSchema,
    /** Chosen on its own screen, required at the submission (Dan: «obbligatorio»). */
    drivingFormula: z.enum(DRIVING_FORMULAS).optional(),
    /** Only for a new vehicle. */
    classSource: z
      .strictObject({
        kind: z.enum(CLASS_SOURCES),
        /** The other vehicle: own, sold, demolished or scrapped, or the relative's. */
        plate: plate.optional(),
        /** The relative living at the same address (answer: plate and birth date). */
        relativeBirthDate: calendarDate.optional(),
      })
      .optional(),
  })
  .superRefine((intake, ctx) => {
    const source = intake.classSource;
    if (intake.vehicleStatus === "NEW" && !source) {
      ctx.addIssue({ code: "custom", path: ["classSource"], message: "REQUIRED" });
    }
    if (!source) return;
    if (source.kind !== "FIRST_POLICY" && !source.plate) {
      ctx.addIssue({ code: "custom", path: ["classSource", "plate"], message: "REQUIRED" });
    }
    if (source.kind === "FAMILY" && !source.relativeBirthDate) {
      ctx.addIssue({
        code: "custom",
        path: ["classSource", "relativeBirthDate"],
        message: "REQUIRED",
      });
    }
  });
export type Intake = z.infer<typeof IntakeSchema>;

/**
 * The documents the customer uploads (ADR 0013): the registration and the ID
 * card, for a vehicle already insured too (Dan, 2026-10-28: no driving
 * licence, no risk certificate).
 */
export function intakeDocuments(): string[] {
  return ["REGISTRATION_CERTIFICATE", "IDENTITY_DOCUMENT"];
}

type Extracted = Record<string, string | number | boolean | null | undefined>;

export interface IntakeEvidence {
  /** Fields read by the bot, by document kind (the latest document of each kind). */
  extracted: Partial<
    Record<
      "REGISTRATION_CERTIFICATE" | "DRIVING_LICENCE" | "RISK_CERTIFICATE" | "IDENTITY_DOCUMENT",
      Extracted
    >
  >;
  /** The vehicle from the plate (Openapi Automotive, fake in development). */
  vehicle?: {
    make: string;
    model: string;
    version?: string;
    providerCode?: string;
    fuel?: string;
    displacementCc?: number;
    powerKw?: number;
    firstRegistrationDate?: string;
  } | null;
  /**
   * The broker's customer (docs/piano-broker.md, B): the policy holder is the
   * customer (LEG-04), so its name and fiscal code win over the documents.
   */
  customer?:
    | { kind?: "PERSON"; surname?: string; givenName?: string; fiscalCode?: string }
    | { kind: "COMPANY"; companyName: string; vatNumber: string }
    | null;
  /** ISTAT code of the municipality of a cadastral code, when known. */
  istatOfCadastral: (cadastral: string) => string | null;
  /** Today in Rome, from `Clock`. */
  today: string;
}

/** The candidate the back office completes: the sections of `quoteData`, possibly partial. */
export interface IntakeCandidate {
  policyHolder: Record<string, unknown>;
  vehicleOwner: "SAME_AS_POLICY_HOLDER";
  drivers: Record<string, unknown>[];
  drivingFormula: QuoteData["drivingFormula"] | undefined;
  vehicle: Record<string, unknown>;
  history: Record<string, unknown>;
  request: z.infer<typeof RequestTermsSchema>;
  /** What the back office still has to write or check (paths of quoteData). */
  missing: string[];
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

/**
 * ADR 0013: the `quoteData` the back office starts from, built from the
 * essential data, the documents read by the bot and the plate. Nothing is
 * invented: a field nobody gave is left out and listed in `missing`.
 */
export function quoteDataFromIntake(
  intake: Intake,
  request: z.infer<typeof RequestTermsSchema>,
  evidence: IntakeEvidence,
): IntakeCandidate {
  const reg = evidence.extracted.REGISTRATION_CERTIFICATE ?? {};
  const licence = evidence.extracted.DRIVING_LICENCE ?? {};
  const identity = evidence.extracted.IDENTITY_DOCUMENT ?? {};
  const risk = evidence.extracted.RISK_CERTIFICATE ?? {};

  const company = evidence.customer?.kind === "COMPANY" ? evidence.customer : null;
  const customer = evidence.customer?.kind === "COMPANY" ? null : (evidence.customer ?? null);
  const fiscalCode =
    str(customer?.fiscalCode) ?? str(reg.ownerFiscalCode) ?? str(identity.fiscalCode);
  const decoded = fiscalCode ? decodeFiscalCode(fiscalCode, evidence.today) : null;
  const birthPlace = decoded
    ? decoded.bornAbroad
      ? decoded.birthPlaceCadastralCode
      : (evidence.istatOfCadastral(decoded.birthPlaceCadastralCode) ?? undefined)
    : undefined;
  const person = {
    kind: "PERSON",
    surname:
      str(customer?.surname) ??
      str(reg.ownerSurname) ??
      str(identity.surname) ??
      str(licence.surname),
    givenName:
      str(customer?.givenName) ??
      str(reg.ownerGivenName) ??
      str(identity.givenName) ??
      str(licence.givenName),
    fiscalCode: decoded?.normalized ?? fiscalCode,
    birthDate: intake.ownerBirthDate,
    birthPlace,
    sex: decoded?.sex,
    residence: intake.residence,
  };
  const holder: Record<string, unknown> = company
    ? {
        kind: "COMPANY",
        companyName: company.companyName,
        vatNumber: company.vatNumber,
        registeredOffice: intake.residence,
      }
    : person;
  // A company's vehicle: the main driver is a person, never the company: the one of
  // the ID card (Dan, 2026-10-28), or of a licence uploaded before that change.
  const driver: Record<string, unknown> = company
    ? {
        kind: "PERSON",
        surname: str(identity.surname) ?? str(licence.surname),
        givenName: str(identity.givenName) ?? str(licence.givenName),
        fiscalCode: str(identity.fiscalCode) ?? str(licence.fiscalCode),
        birthDate: str(identity.birthDate) ?? str(licence.birthDate),
        residence: intake.residence,
      }
    : person;

  const driverLicence = {
    category: str(licence.category),
    number: str(licence.number),
    issuedOn: str(licence.issuedOn),
    expiresOn: str(licence.expiresOn),
  };

  const v = evidence.vehicle ?? null;
  const vehicle = {
    plate: intake.plate,
    type: str(reg.vehicleType),
    use: str(reg.use) ?? "PRIVATE",
    make: v?.make,
    model: v?.model,
    version: v?.version,
    providerCode: v?.providerCode,
    fuel: v?.fuel,
    displacementCc: v?.displacementCc,
    powerKw: v?.powerKw,
    firstRegistrationDate: v?.firstRegistrationDate,
    isNew: false,
  };

  const source = intake.classSource;
  const provenance =
    intake.vehicleStatus === "INSURED"
      ? "FROM_OTHER_COMPANY"
      : source?.kind === "FIRST_POLICY"
        ? "FIRST_REGISTRATION"
        : source?.kind === "FAMILY"
          ? "FAMILY_RC"
          : undefined;
  const claimsMain = num(risk.claimsMainLast5y);
  const claimsShared = num(risk.claimsSharedLast5y);
  const history = {
    provenance,
    cuClass: num(risk.cuClass),
    claims: claimsMain === 0 && claimsShared === 0 ? [] : undefined,
    riskUniqueId: str(risk.riskUniqueId),
    currentInsurer: str(risk.currentInsurer),
    currentExpiryDate: str(risk.expiryDate),
  };

  const missing = [
    ...Object.entries(holder)
      .filter(([, value]) => value === undefined)
      .map(([key]) => `policyHolder.${key}`),
    ...(company
      ? Object.entries(driver)
          .filter(([, value]) => value === undefined)
          .map(([key]) => `drivers.0.person.${key}`)
      : []),
    ...Object.entries(driverLicence)
      .filter(([, value]) => value === undefined)
      .map(([key]) => `drivers.0.licence.${key}`),
    ...["type", "make", "model", "fuel", "powerKw", "firstRegistrationDate"]
      .filter((key) => vehicle[key as keyof typeof vehicle] === undefined)
      .map((key) => `vehicle.${key}`),
    // Never on a document: the purchase date is asked to the customer by phone (answer 6B).
    "vehicle.purchaseDate",
    ...(intake.drivingFormula ? [] : ["drivingFormula"]),
    ...(provenance ? [] : ["history.provenance"]),
    ...(history.claims ? [] : ["history.claims"]),
    // The other vehicle's plate (own, sold, relative's) is for the back office to check.
    ...(source && source.kind !== "FIRST_POLICY" ? ["history.classSource"] : []),
  ];

  const clean = <T extends Record<string, unknown>>(o: T) =>
    Object.fromEntries(Object.entries(o).filter(([, value]) => value !== undefined));
  return {
    policyHolder: clean(holder),
    vehicleOwner: "SAME_AS_POLICY_HOLDER",
    drivers: [{ person: clean(driver), isMain: true, licence: clean(driverLicence) }],
    drivingFormula: intake.drivingFormula,
    vehicle: clean(vehicle),
    history: clean(history),
    request,
    missing,
  };
}

/**
 * ADR 0013, Dan 2026-10-21: whether a photo can be read. The bot found at
 * least one field above `documents.confidenceThreshold` and did not flag the
 * document as unreadable or of the wrong kind; otherwise the customer takes
 * the photo again at once.
 */
export function documentReadable(
  extraction: { fields: Record<string, { confidence: number }>; warnings: string[] } | null,
  threshold: number,
): boolean {
  if (!extraction) return true;
  if (extraction.warnings.some((w) => w === "UNREADABLE" || w === "WRONG_DOCUMENT")) return false;
  return Object.values(extraction.fields).some((f) => f.confidence >= threshold);
}
