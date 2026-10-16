import { z } from "zod";
import { WEEKDAY_KEYS } from "./working-calendar.js";

/**
 * The requests an agency (AgencyFilter) or one of its members (MemberFilter)
 * wants to receive (docs/modello-dati.md, «Filtri»; ASTA-05, VIS-06).
 * A missing list means "any": `provinces: null` is every province.
 */
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const dayIntervals = z.array(
  z
    .tuple([clockTime, clockTime])
    .refine(([from, to]) => from < to, "interval must end after it starts"),
);

export const WeeklyHoursSchema = z.strictObject(
  Object.fromEntries(WEEKDAY_KEYS.map((d) => [d, dayIntervals])) as Record<
    (typeof WEEKDAY_KEYS)[number],
    typeof dayIntervals
  >,
);

export const AgencyFilterCriteriaSchema = z
  .strictObject({
    vehicleTypes: z.array(z.string().min(1)).nonempty(),
    provinces: z.array(z.string().length(2)).nonempty().nullable(),
    cuClassMin: z.number().int().min(1).max(18),
    cuClassMax: z.number().int().min(1).max(18),
    maxClaimsLast5y: z.number().int().nonnegative().nullable(),
    driverAgeMin: z.number().int().min(18),
    driverAgeMax: z.number().int().max(120),
    packages: z.array(z.string().min(1)).nonempty(),
    /** Companies the agency means to offer with: among its mandates. */
    companies: z.array(z.uuid()).nonempty(),
    /** Furthest start date accepted, in calendar days from the opening. */
    maxStartDateDays: z.number().int().positive(),
    /** Longest guarantee the agency can give, in calendar days (ASTA-05). */
    maxGuaranteeDays: z.number().int().positive(),
  })
  .refine((c) => c.cuClassMin <= c.cuClassMax, "cuClassMin must not exceed cuClassMax")
  .refine((c) => c.driverAgeMin <= c.driverAgeMax, "driverAgeMin must not exceed driverAgeMax");
export type AgencyFilterCriteria = z.infer<typeof AgencyFilterCriteriaSchema>;

/** The part of a request the filters look at: the derived columns of QuoteRequest. */
export interface FilterableRequest {
  vehicleType: string;
  province: string;
  cuClass: number | null;
  claimsLast5y: number;
  youngestDriverAge: number;
  packageCode: string;
  /** Calendar days from the opening to the start date. */
  startInDays: number;
  minValidityDays: number;
}

export type FilterMismatch =
  | "VEHICLE_TYPE"
  | "PROVINCE"
  | "CU_CLASS"
  | "CLAIMS"
  | "DRIVER_AGE"
  | "PACKAGE"
  | "START_DATE"
  | "GUARANTEE";

/**
 * ASTA-05: why the request falls outside the filters (empty when it fits).
 * A request without a CU class (first policy, no risk certificate) fits any
 * range of classes.
 */
export function filterMismatches(
  criteria: AgencyFilterCriteria,
  request: FilterableRequest,
): FilterMismatch[] {
  const out: FilterMismatch[] = [];
  if (!criteria.vehicleTypes.includes(request.vehicleType)) out.push("VEHICLE_TYPE");
  if (criteria.provinces && !criteria.provinces.includes(request.province)) out.push("PROVINCE");
  if (
    request.cuClass !== null &&
    (request.cuClass < criteria.cuClassMin || request.cuClass > criteria.cuClassMax)
  ) {
    out.push("CU_CLASS");
  }
  if (criteria.maxClaimsLast5y !== null && request.claimsLast5y > criteria.maxClaimsLast5y) {
    out.push("CLAIMS");
  }
  if (
    request.youngestDriverAge < criteria.driverAgeMin ||
    request.youngestDriverAge > criteria.driverAgeMax
  ) {
    out.push("DRIVER_AGE");
  }
  if (!criteria.packages.includes(request.packageCode)) out.push("PACKAGE");
  if (request.startInDays > criteria.maxStartDateDays) out.push("START_DATE");
  if (criteria.maxGuaranteeDays < request.minValidityDays) out.push("GUARANTEE");
  return out;
}

export type MemberFilterProblem =
  | "VEHICLE_TYPES"
  | "PROVINCES"
  | "CU_CLASS"
  | "CLAIMS"
  | "DRIVER_AGE"
  | "PACKAGES"
  | "COMPANIES"
  | "START_DATE"
  | "GUARANTEE";

const subset = (inner: readonly string[], outer: readonly string[]) =>
  inner.every((v) => outer.includes(v));

/**
 * VIS-06: a member's filters may only narrow the agency's, never widen them.
 * Returns the criteria that go beyond the agency's (empty when inside).
 */
export function memberFilterProblems(
  agency: AgencyFilterCriteria,
  member: AgencyFilterCriteria,
): MemberFilterProblem[] {
  const out: MemberFilterProblem[] = [];
  if (!subset(member.vehicleTypes, agency.vehicleTypes)) out.push("VEHICLE_TYPES");
  if (agency.provinces && (!member.provinces || !subset(member.provinces, agency.provinces))) {
    out.push("PROVINCES");
  }
  if (member.cuClassMin < agency.cuClassMin || member.cuClassMax > agency.cuClassMax) {
    out.push("CU_CLASS");
  }
  if (
    agency.maxClaimsLast5y !== null &&
    (member.maxClaimsLast5y === null || member.maxClaimsLast5y > agency.maxClaimsLast5y)
  ) {
    out.push("CLAIMS");
  }
  if (member.driverAgeMin < agency.driverAgeMin || member.driverAgeMax > agency.driverAgeMax) {
    out.push("DRIVER_AGE");
  }
  if (!subset(member.packages, agency.packages)) out.push("PACKAGES");
  if (!subset(member.companies, agency.companies)) out.push("COMPANIES");
  if (member.maxStartDateDays > agency.maxStartDateDays) out.push("START_DATE");
  if (member.maxGuaranteeDays > agency.maxGuaranteeDays) out.push("GUARANTEE");
  return out;
}
