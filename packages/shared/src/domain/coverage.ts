import { z } from "zod";

/**
 * Coverage packages (seed/pacchetti.json) and the coverage an agency declares
 * in its offer (OFF-04). An offer may give the same or better coverage, never
 * less (OFF-06): a declaration below the package excludes the offer at closing,
 * with the items that fall short as the reason. Amounts in whole euros (rule 5).
 */

const eur = z.number().int().nonnegative();
const pct = z.number().min(0).max(100);
const notRequired = z.strictObject({ required: z.literal(false) });

/** The cases of recourse waiver that the packages name; others go in the PDF. */
export const RECOURSE_WAIVER_CASES = [
  "EXPIRED_LICENCE",
  "NON_COMPLIANT_PASSENGER_TRANSPORT",
] as const;
export const RecourseWaiverCaseSchema = z.enum(RECOURSE_WAIVER_CASES);

const coinsurance = {
  maxCoinsurancePct: pct,
  maxCoinsuranceMinEur: eur,
};

export const PackageRequirementsSchema = z.strictObject({
  rca: z.discriminatedUnion("limitType", [
    z.strictObject({ limitType: z.literal("LEGAL_MINIMUMS") }),
    z.strictObject({ limitType: z.literal("SINGLE_LIMIT"), minSingleLimitEur: eur }),
  ]),
  recourseWaiver: z.union([
    notRequired,
    z.strictObject({ required: z.literal(true), minCases: z.array(RecourseWaiverCaseSchema) }),
  ]),
  roadsideAssistance: z.union([notRequired, z.strictObject({ required: z.literal(true) })]),
  legalProtection: z.union([notRequired, z.strictObject({ required: z.literal(true) })]),
  driverAccident: z.union([
    notRequired,
    z.strictObject({ required: z.literal(true), minCapitalEur: eur }),
  ]),
  theftFire: z.union([
    notRequired,
    z.strictObject({ required: z.literal(true), ...coinsurance, requiresMarketValue: z.boolean() }),
  ]),
  naturalEventsVandalism: z.union([
    notRequired,
    z.strictObject({ required: z.literal(true), ...coinsurance }),
  ]),
  glass: z.union([
    notRequired,
    z.strictObject({ required: z.literal(true), maxDeductibleEur: eur }),
  ]),
});
export type PackageRequirements = z.infer<typeof PackageRequirementsSchema>;

const excluded = z.strictObject({ included: z.literal(false) });
const withCoinsurance = {
  coinsurancePct: pct,
  coinsuranceMinEur: eur,
};

/** What the agency declares for each item of the package (OFF-04). */
export const OfferCoverageSchema = z.strictObject({
  rca: z.union([
    z.strictObject({ limitType: z.literal("SINGLE_LIMIT"), singleLimitEur: eur }),
    z.strictObject({
      limitType: z.literal("SEPARATE_LIMITS"),
      bodilyInjuryPerClaimEur: eur,
      propertyDamagePerClaimEur: eur,
    }),
  ]),
  recourseWaiver: z.union([
    excluded,
    z.strictObject({ included: z.literal(true), cases: z.array(RecourseWaiverCaseSchema) }),
  ]),
  roadsideAssistance: z.strictObject({ included: z.boolean() }),
  legalProtection: z.strictObject({ included: z.boolean() }),
  driverAccident: z.union([
    excluded,
    z.strictObject({ included: z.literal(true), capitalEur: eur }),
  ]),
  theftFire: z.union([
    excluded,
    z.strictObject({ included: z.literal(true), ...withCoinsurance, marketValue: z.boolean() }),
  ]),
  naturalEventsVandalism: z.union([
    excluded,
    z.strictObject({ included: z.literal(true), ...withCoinsurance }),
  ]),
  glass: z.union([excluded, z.strictObject({ included: z.literal(true), deductibleEur: eur })]),
});
export type OfferCoverage = z.infer<typeof OfferCoverageSchema>;

export type CoverageItem = keyof PackageRequirements;

export interface LegalMinimums {
  rcaBodilyInjuryPerClaimEur: number;
  rcaPropertyDamagePerClaimEur: number;
}

/**
 * OFF-06: the items of the package that the declared coverage does not reach.
 * Empty when the offer conforms. Items the package does not require are not
 * checked: anything the agency adds is better, never worse.
 */
export function coverageShortfalls(
  required: PackageRequirements,
  declared: OfferCoverage,
  legal: LegalMinimums,
): CoverageItem[] {
  const short: CoverageItem[] = [];
  const rca = declared.rca;
  const minimum = required.rca.limitType === "SINGLE_LIMIT" ? required.rca.minSingleLimitEur : 0;
  const rcaOk =
    rca.limitType === "SINGLE_LIMIT"
      ? rca.singleLimitEur >= Math.max(minimum, legal.rcaBodilyInjuryPerClaimEur)
      : rca.bodilyInjuryPerClaimEur >= Math.max(minimum, legal.rcaBodilyInjuryPerClaimEur) &&
        rca.propertyDamagePerClaimEur >= Math.max(minimum, legal.rcaPropertyDamagePerClaimEur);
  if (!rcaOk) short.push("rca");

  const rw = required.recourseWaiver;
  if (rw.required) {
    const d = declared.recourseWaiver;
    if (!d.included || !rw.minCases.every((c) => d.cases.includes(c))) short.push("recourseWaiver");
  }
  if (required.roadsideAssistance.required && !declared.roadsideAssistance.included) {
    short.push("roadsideAssistance");
  }
  if (required.legalProtection.required && !declared.legalProtection.included) {
    short.push("legalProtection");
  }
  const da = required.driverAccident;
  if (da.required) {
    const d = declared.driverAccident;
    if (!d.included || d.capitalEur < da.minCapitalEur) short.push("driverAccident");
  }
  const tf = required.theftFire;
  if (tf.required) {
    const d = declared.theftFire;
    if (
      !d.included ||
      d.coinsurancePct > tf.maxCoinsurancePct ||
      d.coinsuranceMinEur > tf.maxCoinsuranceMinEur ||
      (tf.requiresMarketValue && !d.marketValue)
    ) {
      short.push("theftFire");
    }
  }
  const nv = required.naturalEventsVandalism;
  if (nv.required) {
    const d = declared.naturalEventsVandalism;
    if (
      !d.included ||
      d.coinsurancePct > nv.maxCoinsurancePct ||
      d.coinsuranceMinEur > nv.maxCoinsuranceMinEur
    ) {
      short.push("naturalEventsVandalism");
    }
  }
  const gl = required.glass;
  if (gl.required) {
    const d = declared.glass;
    if (!d.included || d.deductibleEur > gl.maxDeductibleEur) short.push("glass");
  }
  return short;
}
