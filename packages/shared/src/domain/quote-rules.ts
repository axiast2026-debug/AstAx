import { completedYears, compareCalendarDates, parseCalendarDate } from "./calendar-date.js";
import { decodeFiscalCode } from "./fiscal-code.js";
import { isItalianPlate } from "./plates.js";
import type {
  DrivingFormula,
  NaturalPerson,
  QuoteData,
  QuoteDraft,
  StartMode,
} from "./quote-data.js";

/** An excluded case of `seed/elenchi.json` (`exclusionCase`), ASTA-10. */
export interface ExclusionCase {
  code: string;
  blockingInWizard: boolean;
}

export const FOREIGN_OR_TEMPORARY_PLATE = "FOREIGN_OR_TEMPORARY_PLATE";
export const VINTAGE = "VINTAGE";

/**
 * ASTA-10: the excluded cases declared in the wizard (special uses such as
 * taxi or rental, a plate that is not Italian) block the submission. Returns
 * the codes of the blocking cases the draft hits, empty when it may go on.
 */
export function wizardBlockingExclusions(
  draft: QuoteDraft,
  cases: readonly ExclusionCase[],
): string[] {
  const blocking = new Set(cases.filter((c) => c.blockingInWizard).map((c) => c.code));
  const hits = new Set((draft.specialUses ?? []).filter((code) => blocking.has(code)));
  if (
    draft.vehicle &&
    !isItalianPlate(draft.vehicle.plate) &&
    blocking.has(FOREIGN_OR_TEMPORARY_PLATE)
  ) {
    hits.add(FOREIGN_OR_TEMPORARY_PLATE);
  }
  return [...hits].sort();
}

/**
 * Possible vintage vehicle: at least `vintageAgeYears` completed years from the
 * first registration to the policy start (`vehicle.vintageAgeYears`, Dan's
 * answer to question 6). Not blocking: the back office decides.
 */
export function isPossibleVintage(quoteData: QuoteData, vintageAgeYears: number): boolean {
  return (
    completedYears(quoteData.vehicle.firstRegistrationDate, quoteData.request.startDate) >=
    vintageAgeYears
  );
}

export function driverAgesAtStart(quoteData: QuoteData): number[] {
  return quoteData.drivers.map((driver) =>
    completedYears(driver.person.birthDate, quoteData.request.startDate),
  );
}

export type DrivingFormulaProblem = "EXPERT_DRIVER_TOO_YOUNG" | "EXCLUSIVE_NEEDS_ONE_DRIVER";

/**
 * Expert formula: every driver has at least `expertMinAge` years at the policy
 * start (`drivingFormula.expertMinAge`). Exclusive formula: one driver only.
 */
export function drivingFormulaProblems(
  formula: DrivingFormula,
  driverAges: readonly number[],
  expertMinAge: number,
): DrivingFormulaProblem[] {
  if (formula === "EXPERT" && driverAges.some((age) => age < expertMinAge))
    return ["EXPERT_DRIVER_TOO_YOUNG"];
  if (formula === "EXCLUSIVE" && driverAges.length !== 1) return ["EXCLUSIVE_NEEDS_ONE_DRIVER"];
  return [];
}

export type SubmissionProblem =
  | DrivingFormulaProblem
  | "NO_MAIN_DRIVER"
  | "MORE_THAN_ONE_MAIN_DRIVER"
  | "START_DATE_IN_THE_PAST"
  | "CU_CLASS_REQUIRED"
  | "CURRENT_INSURER_REQUIRED"
  | "FAMILY_RC_REQUIRED"
  | "PURCHASE_BEFORE_REGISTRATION"
  | "LICENCE_DATES_INVERTED"
  | "AUCTION_DURATION_NOT_ALLOWED"
  | "MIN_VALIDITY_NOT_ALLOWED"
  | "MARKET_VALUE_REQUIRED";

export interface SubmissionContext {
  /** Today, from `Clock`, in the Rome calendar. */
  today: string;
  expertMinAge: number;
  auctionDurations: readonly number[];
  minValidityDaysOptions: readonly number[];
  /** True when the chosen package includes theft and fire (spec 09 §3: market value). */
  packageIncludesTheft: boolean;
}

/**
 * Problems that keep a complete draft from being submitted: required fields
 * that depend on other answers (spec 09 §3) and choices outside the options
 * in force (CLAUDE.md rule 7). The excluded cases are checked separately
 * (`wizardBlockingExclusions`).
 */
export function submissionProblems(
  quoteData: QuoteData,
  ctx: SubmissionContext,
): SubmissionProblem[] {
  const problems: SubmissionProblem[] = [];
  const mainDrivers = quoteData.drivers.filter((d) => d.isMain).length;
  if (mainDrivers === 0) problems.push("NO_MAIN_DRIVER");
  if (mainDrivers > 1) problems.push("MORE_THAN_ONE_MAIN_DRIVER");
  problems.push(
    ...drivingFormulaProblems(
      quoteData.drivingFormula,
      driverAgesAtStart(quoteData),
      ctx.expertMinAge,
    ),
  );

  const { request, history, vehicle } = quoteData;
  if (compareCalendarDates(request.startDate, ctx.today) < 0)
    problems.push("START_DATE_IN_THE_PAST");
  const firstRegistration = history.provenance === "FIRST_REGISTRATION";
  if (!firstRegistration && history.provenance !== "USED_WITHOUT_OWN_CERTIFICATE") {
    if (history.cuClass === undefined) problems.push("CU_CLASS_REQUIRED");
    if (!history.currentInsurer || !history.currentExpiryDate)
      problems.push("CURRENT_INSURER_REQUIRED");
  }
  if (history.provenance === "FAMILY_RC" && !history.familyRc) problems.push("FAMILY_RC_REQUIRED");
  if (compareCalendarDates(vehicle.purchaseDate, vehicle.firstRegistrationDate) < 0) {
    problems.push("PURCHASE_BEFORE_REGISTRATION");
  }
  if (
    quoteData.drivers.some(
      (d) => compareCalendarDates(d.licence.issuedOn, d.licence.expiresOn) >= 0,
    )
  ) {
    problems.push("LICENCE_DATES_INVERTED");
  }
  if (!ctx.auctionDurations.includes(request.auctionDurationHours))
    problems.push("AUCTION_DURATION_NOT_ALLOWED");
  if (!ctx.minValidityDaysOptions.includes(request.minValidityDays))
    problems.push("MIN_VALIDITY_NOT_ALLOWED");
  if (ctx.packageIncludesTheft && vehicle.marketValueEur === undefined)
    problems.push("MARKET_VALUE_REQUIRED");
  return [...new Set(problems)];
}

export type RequiredDocumentKind =
  "REGISTRATION_CERTIFICATE" | "DRIVING_LICENCE" | "RISK_CERTIFICATE" | "IDENTITY_DOCUMENT";

export interface RequiredDocument {
  kind: RequiredDocumentKind;
  /** For a licence, the index of the driver in `quoteData.drivers`. */
  driverIndex?: number;
}

/**
 * Documents a request needs before the back office can verify it: the
 * registration certificate, each driver's licence and, when the vehicle
 * comes from another policy, the risk certificate (Dan's answer to question 10).
 */
export function requiredDocuments(): RequiredDocument[] {
  // Dan, 2026-10-28: the registration and the ID card, whatever the vehicle's
  // history; licences and the risk certificate are no longer asked.
  return [{ kind: "REGISTRATION_CERTIFICATE" }, { kind: "IDENTITY_DOCUMENT" }];
}

/** Derived columns of `QuoteRequest`, used by filters and agency selection. */
export interface DerivedColumns {
  vehicleType: string;
  province: string;
  cuClass: number | null;
  claimsLast5y: number;
  youngestDriverAge: number;
  packageCode: string;
  startDate: string;
  startMode: StartMode;
  chosenCoverages: string[];
  minValidityDays: number;
}

export function derivedColumns(quoteData: QuoteData): DerivedColumns {
  const holder = quoteData.policyHolder;
  const residence = holder.kind === "PERSON" ? holder.residence : holder.registeredOffice;
  const startYear = parseCalendarDate(quoteData.request.startDate)?.year ?? 0;
  // The risk certificate lists the last five years plus the current one.
  const claimsLast5y = quoteData.history.claims
    .filter((claim) => claim.year >= startYear - 5 && claim.year <= startYear)
    .reduce((sum, claim) => sum + claim.mainResponsibility + claim.sharedResponsibility, 0);
  return {
    vehicleType: quoteData.vehicle.type,
    province: residence.province,
    cuClass: quoteData.history.cuClass ?? null,
    claimsLast5y,
    youngestDriverAge: Math.min(...driverAgesAtStart(quoteData)),
    packageCode: quoteData.request.packageCode,
    startDate: quoteData.request.startDate,
    startMode: quoteData.request.startMode ?? "DATE",
    chosenCoverages:
      quoteData.request.packageCode === "CUSTOM" ? [...(quoteData.request.coverages ?? [])] : [],
    minValidityDays: quoteData.request.minValidityDays,
  };
}

export type FiscalCodeProblem =
  "INVALID" | "BIRTH_DATE_MISMATCH" | "SEX_MISMATCH" | "BIRTH_PLACE_MISMATCH";

/**
 * Coherence of a person's fiscal code with the declared birth data.
 * `istatOfCadastral` maps a cadastral code to the ISTAT code of the
 * municipality (null when unknown: then the birth place is not compared).
 */
export function fiscalCodeProblems(
  person: NaturalPerson,
  today: string,
  istatOfCadastral: (cadastralCode: string) => string | null,
): FiscalCodeProblem[] {
  const decoded = decodeFiscalCode(person.fiscalCode, today);
  if (!decoded) return ["INVALID"];
  const problems: FiscalCodeProblem[] = [];
  if (decoded.birthDate !== person.birthDate) problems.push("BIRTH_DATE_MISMATCH");
  if (decoded.sex !== person.sex) problems.push("SEX_MISMATCH");
  const place = decoded.bornAbroad
    ? decoded.birthPlaceCadastralCode
    : istatOfCadastral(decoded.birthPlaceCadastralCode);
  if (place !== null && place !== person.birthPlace) problems.push("BIRTH_PLACE_MISMATCH");
  return problems;
}
