import { z } from "zod";
import { CHOOSABLE_COVERAGES } from "./coverage.js";
import { isCalendarDate } from "./calendar-date.js";
import { normalizeFiscalCodeInput } from "./fiscal-code.js";
import { isValidVatNumber } from "./italian-ids.js";
import { normalizePlate } from "./plates.js";

/**
 * `quoteData`: the data an agency needs to price the policy (spec 09 §3,
 * docs/modello-dati.md «Clienti e richieste»). It freezes at submission; a
 * back office correction creates a new version.
 *
 * VIS-01 by construction: there is no field for phone or email anywhere in
 * this schema, and every object is strict, so an extra key (a phone number
 * slipped in by mistake) is rejected instead of being stored. Nationality is
 * not collected (VIS-12).
 *
 * Codes of editable lists (vehicle type, use, provenance…) are checked here
 * only for shape; the API checks them against the active list values.
 */
export const QUOTE_DATA_SCHEMA_VERSION = 1;

const calendarDate = z.string().refine(isCalendarDate, { message: "INVALID_DATE" });
const listCode = z.string().regex(/^[A-Z0-9_]{1,40}$/);
const text = (max: number) => z.string().trim().min(1).max(max);
const istatCode = z.string().regex(/^\d{6}$/);
const provinceCode = z.string().regex(/^[A-Z]{2}$/);
const fiscalCode = z
  .string()
  .transform(normalizeFiscalCodeInput)
  .pipe(z.string().regex(/^[A-Z0-9]{16}$/));
const plate = z
  .string()
  .transform(normalizePlate)
  .pipe(z.string().regex(/^[A-Z0-9]{5,10}$/));

export const AddressSchema = z.strictObject({
  street: text(120),
  postalCode: z.string().regex(/^\d{5}$/),
  municipalityIstat: istatCode,
  province: provinceCode,
});

export const NaturalPersonSchema = z.strictObject({
  kind: z.literal("PERSON"),
  surname: text(80),
  givenName: text(80),
  fiscalCode,
  birthDate: calendarDate,
  /** ISTAT code of the municipality, or the cadastral "Z" code of the country. */
  birthPlace: z.string().regex(/^(\d{6}|Z\d{3})$/),
  sex: z.enum(["M", "F"]),
  residence: AddressSchema,
  profession: listCode.optional(),
  maritalStatus: listCode.optional(),
  children: z.int().min(0).max(20).optional(),
});

export const CompanySchema = z.strictObject({
  kind: z.literal("COMPANY"),
  companyName: text(160),
  vatNumber: z.string().refine(isValidVatNumber, { message: "INVALID_VAT_NUMBER" }),
  registeredOffice: AddressSchema,
});

export const PersonDataSchema = z.discriminatedUnion("kind", [NaturalPersonSchema, CompanySchema]);

export const LicenceSchema = z.strictObject({
  category: listCode,
  number: z.string().regex(/^[A-Z0-9]{5,20}$/),
  issuedOn: calendarDate,
  expiresOn: calendarDate,
});

export const DriverSchema = z.strictObject({
  person: NaturalPersonSchema,
  isMain: z.boolean(),
  licence: LicenceSchema,
});

export const DRIVING_FORMULAS = ["FREE", "EXPERT", "EXCLUSIVE"] as const;
export type DrivingFormula = (typeof DRIVING_FORMULAS)[number];

export const VehicleSchema = z.strictObject({
  plate,
  type: listCode,
  use: listCode,
  make: text(60),
  model: text(80),
  version: text(120).optional(),
  providerCode: text(40).optional(),
  fuel: listCode,
  displacementCc: z.int().min(1).max(20_000).optional(),
  powerKw: z.int().min(1).max(2_000),
  firstRegistrationDate: calendarDate,
  purchaseDate: calendarDate,
  isNew: z.boolean(),
  marketValueEur: z.int().min(0).optional(),
  satelliteAlarm: z.boolean().optional(),
  nightParking: listCode.optional(),
  annualKmBand: listCode.optional(),
});

export const ClaimYearSchema = z.strictObject({
  year: z.int().min(1990).max(2200),
  mainResponsibility: z.int().min(0).max(50),
  sharedResponsibility: z.int().min(0).max(50),
});

export const HistorySchema = z.strictObject({
  provenance: listCode,
  cuClass: z.int().min(1).max(18).optional(),
  claims: z.array(ClaimYearSchema).max(10),
  riskUniqueId: z
    .string()
    .regex(/^[A-Z0-9]{5,40}$/)
    .optional(),
  currentInsurer: text(120).optional(),
  currentExpiryDate: calendarDate.optional(),
  familyRc: z.strictObject({ plate, relativeFiscalCode: fiscalCode }).optional(),
});

export const PACKAGE_CODES = ["BASE", "PLUS", "COMPLETE", "RECOMMENDED", "CUSTOM"] as const;
export type PackageCode = (typeof PACKAGE_CODES)[number];

/**
 * Question 1 (Dan, 2026-10-18/19, docs/piano-decorrenza.md): the start of
 * cover is a chosen date, the moment of the issuance, or 24:00 of the day of
 * the issuance deadline. Missing in data saved before: a chosen date.
 */
export const START_MODES = ["DATE", "ON_ISSUANCE", "MIDNIGHT_AFTER_DEADLINE"] as const;
export type StartMode = (typeof START_MODES)[number];

export const RequestTermsSchema = z.strictObject({
  packageCode: z.enum(PACKAGE_CODES),
  packageVersion: z.int().min(1),
  /** The chosen start date; for the other modes, the day of the request (ages, licence). */
  startDate: calendarDate,
  startMode: z.enum(START_MODES).optional(),
  /** Package «CUSTOM»: the coverages chosen one by one (Dan, 2026-10-21). */
  coverages: z.array(z.enum(CHOOSABLE_COVERAGES)).max(CHOOSABLE_COVERAGES.length).optional(),
  blackBox: z.boolean(),
  paymentFrequency: z.literal("ANNUAL"),
  auctionDurationHours: z.int().min(1),
  minValidityDays: z.int().min(1),
  currentPremiumCents: z.int().min(0).optional(),
});

export const QuoteDataSchema = z.strictObject({
  schemaVersion: z.literal(QUOTE_DATA_SCHEMA_VERSION),
  policyHolder: PersonDataSchema,
  vehicleOwner: z.union([PersonDataSchema, z.literal("SAME_AS_POLICY_HOLDER")]),
  drivers: z.array(DriverSchema).min(1).max(10),
  drivingFormula: z.enum(DRIVING_FORMULAS),
  vehicle: VehicleSchema,
  history: HistorySchema,
  request: RequestTermsSchema,
});

export type Address = z.infer<typeof AddressSchema>;
export type NaturalPerson = z.infer<typeof NaturalPersonSchema>;
export type Company = z.infer<typeof CompanySchema>;
export type PersonData = z.infer<typeof PersonDataSchema>;
export type Driver = z.infer<typeof DriverSchema>;
export type VehicleData = z.infer<typeof VehicleSchema>;
export type HistoryData = z.infer<typeof HistorySchema>;
export type RequestTerms = z.infer<typeof RequestTermsSchema>;
export type QuoteData = z.infer<typeof QuoteDataSchema>;

/**
 * The draft is saved one wizard section at a time: a section is stored only
 * when it is complete and valid, so the submitted `quoteData` is simply the
 * sections put together. `specialUses` are the wizard's answers about uses
 * that are excluded cases (taxi, rental…, ASTA-10): they stay in the draft
 * and block the submission, they never reach `quoteData`.
 */
export const DriversSectionSchema = z.strictObject({
  drivers: z.array(DriverSchema).min(1).max(10),
  drivingFormula: z.enum(DRIVING_FORMULAS),
});

export const QuoteDraftSchema = z.strictObject({
  policyHolder: PersonDataSchema.optional(),
  vehicleOwner: z.union([PersonDataSchema, z.literal("SAME_AS_POLICY_HOLDER")]).optional(),
  vehicle: VehicleSchema.optional(),
  history: HistorySchema.optional(),
  driving: DriversSectionSchema.optional(),
  request: RequestTermsSchema.optional(),
  specialUses: z.array(listCode).max(20).optional(),
});

export type QuoteDraft = z.infer<typeof QuoteDraftSchema>;
export type QuoteDraftSection = Exclude<keyof QuoteDraft, "specialUses">;

export const QUOTE_DRAFT_SECTIONS: readonly QuoteDraftSection[] = [
  "policyHolder",
  "vehicleOwner",
  "vehicle",
  "history",
  "driving",
  "request",
];

export function missingDraftSections(draft: QuoteDraft): QuoteDraftSection[] {
  return QUOTE_DRAFT_SECTIONS.filter((section) => draft[section] === undefined);
}

/** The complete `quoteData` of a draft, or null while a section is missing. */
export function quoteDataFromDraft(draft: QuoteDraft): QuoteData | null {
  const { policyHolder, vehicleOwner, vehicle, history, driving, request } = draft;
  if (!policyHolder || !vehicleOwner || !vehicle || !history || !driving || !request) return null;
  return QuoteDataSchema.parse({
    schemaVersion: QUOTE_DATA_SCHEMA_VERSION,
    policyHolder,
    vehicleOwner,
    drivers: driving.drivers,
    drivingFormula: driving.drivingFormula,
    vehicle,
    history,
    request,
  });
}

/**
 * Question 1, answer 3A: with the start set by the payment, ages, licence and
 * vehicle years are counted on the day of the request, so `startDate` is that
 * day (`today`, from `Clock`). A chosen date stays as it is.
 */
export function withRequestDay<T extends { startDate: string; startMode?: StartMode }>(
  terms: T,
  today: string,
): T {
  return (terms.startMode ?? "DATE") === "DATE" ? terms : { ...terms, startDate: today };
}
