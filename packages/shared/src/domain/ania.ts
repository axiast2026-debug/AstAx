import { z } from "zod";
import { addCalendarDays } from "./calendar-date.js";
import { decodeFiscalCode, givenNameCode, surnameCode } from "./fiscal-code.js";

/**
 * Dan, 2026-10-28 (docs/piano-back-office-verifica.md): the ANIA record read
 * by plate and the sheet of the essential quote data the agencies get, with
 * the same rules as the bot built for CorteXa, rebuilt here. The record is
 * what the reader returns (the fake one in development, rule 11); the sheet
 * and the warnings are derived from it here, without AI.
 */

/** Codes the portal writes instead of a value: kept, never turned into null. */
export const ANIA_SPECIAL_CODES = ["N.A.", "N.D.", "--"] as const;
export type AniaSpecialCode = (typeof ANIA_SPECIAL_CODES)[number];

const text = z.string().min(1).nullable();
const date = z.iso.date().nullable();
const amount = z.number().finite().nonnegative().nullable();
const fiscalCode = z.string().min(1).nullable();
/** In the tables the portal shows only the code; the name only in the detail. */
const company = z
  .strictObject({ code: z.string().regex(/^\d+$/).nullable(), name: text })
  .nullable();
const claimCell = z.union([z.int().nonnegative(), z.enum(ANIA_SPECIAL_CODES)]).nullable();

export const AniaRecordSchema = z.strictObject({
  plate: z.string().regex(/^[A-Z0-9]{4,10}$/),
  readAt: z.iso.datetime({ offset: true }),
  vehicle: z.strictObject({
    description: text,
    /** «Categoria/Uso», e.g. «AUTOVETTURA PER TRASPORTO DI PERSONE / PROPRIO». */
    categoryUse: text,
    fuel: text,
    displacementCc: amount,
    maxPowerKw: amount,
    fullLoadWeightKg: amount,
    /** From the public quote form of Prima, when the bot read it. */
    model: text.optional(),
    version: text.optional(),
  }),
  owner: z.strictObject({
    fiscalCode,
    residenceMunicipality: text,
    residenceProvince: text,
  }),
  registration: z.strictObject({
    firstRegistrationDate: date,
    history: z.array(z.strictObject({ issuedOn: date, ownerFiscalCode: fiscalCode })),
  }),
  latestCover: z
    .strictObject({
      company,
      policyHolderFiscalCode: fiscalCode,
      coverExpiry: date,
      contractExpiry: date,
    })
    .nullable(),
  latestCertificate: z
    .strictObject({
      company,
      policyHolderFiscalCode: fiscalCode,
      vehicleType: text,
      /** «Avente diritto»: the portal writes «SURNAME NAME». */
      entitledName: text,
      entitledFiscalCode: fiscalCode,
      assignedClass: text,
      assignedClassCu: text,
      claims: z.array(
        z.strictObject({
          year: z.int().min(1900).max(2200),
          group: z.enum(["MAIN", "SHARED"]),
          /** Only in old certificates: the year's total without things and people. */
          total: claimCell,
          things: claimCell,
          people: claimCell,
          peopleAndThings: claimCell,
        }),
      ),
    })
    .nullable(),
});
export type AniaRecord = z.infer<typeof AniaRecordSchema>;
type Claims = NonNullable<AniaRecord["latestCertificate"]>["claims"];

export interface AniaSheet {
  make: string | null;
  model: string | null;
  version: string | null;
  category: string | null;
  use: string | null;
  fuel: string | null;
  displacementCc: number | null;
  maxPowerKw: number | null;
  /** Only for trucks. */
  fullLoadWeightKg: number | null;
  firstRegistrationDate: string | null;
  purchaseDate: string | null;
  ownerFiscalCode: string | null;
  /** From the certificate, only when the entitled person is the owner. */
  fullName: string | null;
  surname: string | null;
  givenName: string | null;
  /** From the owner's fiscal code (natural persons with a valid code). */
  birthDate: string | null;
  sex: "M" | "F" | null;
  birthPlaceCadastralCode: string | null;
  bornAbroad: boolean | null;
  residenceMunicipality: string | null;
  residenceProvince: string | null;
  currentInsurer: { code: string | null; name: string | null } | null;
  coverExpiry: string | null;
  contractExpiry: string | null;
  cuClass: string | null;
  internalClass: string | null;
  mainClaims: number | null;
  sharedClaims: number | null;
}

export const ANIA_WARNINGS = [
  "TYPE_NOT_IDENTIFIED",
  "HOLDER_NOT_OWNER",
  "ENTITLED_NOT_HOLDER",
  "COVER_EXPIRED",
  "COVER_EXPIRING",
  "NO_CERTIFICATE",
  "CU_CLASS_MISSING",
] as const;
export type AniaWarning = (typeof ANIA_WARNINGS)[number];

export interface AniaRules {
  /** Rome calendar date of today. */
  today: string;
  claimsYears: number;
  expiryNoticeDays: number;
  ownerMinAge: number;
}

/**
 * Codes of «Categoria/Uso» that the portal shows for some commercial
 * vehicles. A code is added only once checked on a real registration
 * certificate: an unknown code gives the warning TYPE_NOT_IDENTIFIED.
 */
export const CONFIRMED_CATEGORY_CODES: Readonly<Record<string, { category: string; use: string }>> =
  {};

/** A real fiscal code, not one of the special codes. */
function isRealCode(value: string | null): value is string {
  return value !== null && !(ANIA_SPECIAL_CODES as readonly string[]).includes(value);
}

/**
 * «AUTOVETTURA PER TRASPORTO DI PERSONE / PROPRIO» → AUTOVETTURA, PROPRIO.
 * More than one «/», or an unconfirmed code: both null.
 */
export function splitCategoryUse(value: string | null): {
  category: string | null;
  use: string | null;
} {
  if (!value) return { category: null, use: null };
  const code = value.trim().toUpperCase();
  if (/^[A-Z]{1,2}\d{1,2}$/.test(code)) {
    return CONFIRMED_CATEGORY_CODES[code] ?? { category: null, use: null };
  }
  const parts = value.split("/").map((p) => p.trim());
  if (parts.length > 2) return { category: null, use: null };
  const category = parts[0]?.split(/\s+PER\s+/i)[0]?.trim() || null;
  return { category, use: parts[1] || null };
}

/**
 * Claims of the last years of the certificate for a group: things, people,
 * both and, in old certificates, the year's total. N.A. and -- count zero;
 * N.D. (not available) makes the total unknown.
 */
export function claimsInLastYears(
  rows: Claims,
  group: "MAIN" | "SHARED",
  years: number,
): number | null {
  if (rows.length === 0) return null;
  const last = Math.max(...rows.map((r) => r.year));
  let total = 0;
  for (const row of rows) {
    if (row.group !== group || row.year <= last - years) continue;
    for (const cell of [row.total, row.things, row.people, row.peopleAndThings]) {
      if (cell === "N.D.") return null;
      if (typeof cell === "number") total += cell;
    }
  }
  return total;
}

/**
 * The purchase date: the oldest registration row issued to the owner's
 * fiscal code, whatever the kind of issue (duplicates too).
 */
export function purchaseDateOf(
  history: AniaRecord["registration"]["history"],
  owner: string | null,
): string | null {
  if (!isRealCode(owner)) return null;
  const dates = history
    .filter((r) => r.ownerFiscalCode === owner && r.issuedOn)
    .map((r) => r.issuedOn as string)
    .sort();
  return dates[0] ?? null;
}

/**
 * «DE LUCA MARIA GRAZIA» with the fiscal code → DE LUCA, MARIA GRAZIA: the
 * only split that agrees with the first six letters of the code, trying also
 * the reversed order. None or more than one: null, never a guess.
 */
export function splitFullName(
  fullName: string | null,
  code: string | null,
): { surname: string | null; givenName: string | null } {
  const none = { surname: null, givenName: null };
  if (!fullName || !code || !/^[A-Z]{6}/.test(code)) return none;
  const words = fullName.trim().split(/\s+/);
  const matches: { surname: string; givenName: string }[] = [];
  const attempt = (surname: string, givenName: string) => {
    if (
      surnameCode(surname) === code.slice(0, 3) &&
      givenNameCode(givenName) === code.slice(3, 6)
    ) {
      matches.push({ surname, givenName });
    }
  };
  for (let i = 1; i < words.length; i++) {
    attempt(words.slice(0, i).join(" "), words.slice(i).join(" "));
  }
  if (matches.length === 0) {
    for (let i = 1; i < words.length; i++) {
      attempt(words.slice(i).join(" "), words.slice(0, i).join(" "));
    }
  }
  return matches.length === 1 ? (matches[0] ?? none) : none;
}

function isTruck(record: AniaRecord, category: string | null): boolean {
  return (
    category === "AUTOCARRO" || record.latestCertificate?.vehicleType?.toUpperCase() === "AUTOCARRO"
  );
}

/** The essential quote data, derived the same way every time. */
export function aniaSheet(record: AniaRecord, rules: AniaRules): AniaSheet {
  const cover = record.latestCover;
  const certificate = record.latestCertificate;
  const { category, use } = splitCategoryUse(record.vehicle.categoryUse);
  const owner = record.owner.fiscalCode;
  const sameAsOwner =
    certificate?.entitledName && isRealCode(owner) && certificate.entitledFiscalCode === owner;
  const names = sameAsOwner ? splitFullName(certificate.entitledName, owner) : null;
  // The two-digit year: the century in which the owner, born that year, is at
  // least ownerMinAge years old this year.
  const decoded =
    isRealCode(owner) && /^[A-Z]{6}/.test(owner)
      ? decodeFiscalCode(owner, `${Number(rules.today.slice(0, 4)) - rules.ownerMinAge}-12-31`)
      : null;
  return {
    make: record.vehicle.description,
    model: record.vehicle.model ?? null,
    version: record.vehicle.version ?? null,
    category,
    use,
    fuel: record.vehicle.fuel,
    displacementCc: record.vehicle.displacementCc,
    maxPowerKw: record.vehicle.maxPowerKw,
    fullLoadWeightKg: isTruck(record, category) ? record.vehicle.fullLoadWeightKg : null,
    firstRegistrationDate: record.registration.firstRegistrationDate,
    purchaseDate: purchaseDateOf(record.registration.history, owner),
    ownerFiscalCode: owner,
    fullName: sameAsOwner ? certificate.entitledName : null,
    surname: names?.surname ?? null,
    givenName: names?.givenName ?? null,
    birthDate: decoded?.birthDate ?? null,
    sex: decoded?.sex ?? null,
    birthPlaceCadastralCode: decoded?.birthPlaceCadastralCode ?? null,
    bornAbroad: decoded ? decoded.bornAbroad : null,
    residenceMunicipality: record.owner.residenceMunicipality,
    residenceProvince: record.owner.residenceProvince,
    currentInsurer: cover?.company ?? null,
    coverExpiry: cover?.coverExpiry ?? null,
    contractExpiry: cover?.contractExpiry ?? null,
    cuClass: certificate?.assignedClassCu ?? null,
    internalClass: certificate?.assignedClass ?? null,
    mainClaims: certificate
      ? claimsInLastYears(certificate.claims, "MAIN", rules.claimsYears)
      : null,
    sharedClaims: certificate
      ? claimsInLastYears(certificate.claims, "SHARED", rules.claimsYears)
      : null,
  };
}

/**
 * The warnings, without AI. An expiry is a date without hour: the cover holds
 * the whole day, so it has expired only from the day after.
 */
export function aniaWarnings(record: AniaRecord, rules: AniaRules): AniaWarning[] {
  const warnings: AniaWarning[] = [];
  const { category, use } = splitCategoryUse(record.vehicle.categoryUse);
  if (!category || !use) warnings.push("TYPE_NOT_IDENTIFIED");
  const cover = record.latestCover;
  const certificate = record.latestCertificate;
  const owner = record.owner.fiscalCode;
  const holder = cover?.policyHolderFiscalCode ?? certificate?.policyHolderFiscalCode ?? null;
  if (isRealCode(owner) && isRealCode(holder) && owner !== holder) {
    warnings.push("HOLDER_NOT_OWNER");
  }
  if (
    certificate &&
    isRealCode(certificate.entitledFiscalCode) &&
    isRealCode(certificate.policyHolderFiscalCode) &&
    certificate.entitledFiscalCode !== certificate.policyHolderFiscalCode
  ) {
    warnings.push("ENTITLED_NOT_HOLDER");
  }
  if (cover?.coverExpiry) {
    if (cover.coverExpiry < rules.today) warnings.push("COVER_EXPIRED");
    else if (cover.coverExpiry <= addCalendarDays(rules.today, rules.expiryNoticeDays)) {
      warnings.push("COVER_EXPIRING");
    }
  }
  if (!certificate) warnings.push("NO_CERTIFICATE");
  else if (!isRealCode(certificate.assignedClassCu)) warnings.push("CU_CLASS_MISSING");
  return warnings;
}
