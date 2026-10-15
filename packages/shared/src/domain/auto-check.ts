import { compareCalendarDates } from "./calendar-date.js";
import { normalizeFiscalCodeInput } from "./fiscal-code.js";
import { plateFitsVehicleType } from "./plates.js";
import type { NaturalPerson, QuoteData } from "./quote-data.js";
import {
  type ExclusionCase,
  VINTAGE,
  drivingFormulaProblems,
  driverAgesAtStart,
  fiscalCodeProblems,
  isPossibleVintage,
  requiredDocuments,
} from "./quote-rules.js";

/**
 * The automatic check of a submitted request (fase 2): every checklist item
 * gets GREEN, YELLOW or RED, and the request takes the worst one.
 *
 * - RED: an excluded case (for example a possible vintage vehicle) or a
 *   serious inconsistency (invalid fiscal code, licence expired at the start).
 * - YELLOW: a document field read below the confidence threshold
 *   (`documents.confidenceThreshold`) or a minor difference (for example the
 *   residence differs from the registration certificate).
 * - GREEN otherwise.
 *
 * The check reads identifiers and codes only: its result can be logged and
 * stored without personal data (CLAUDE.md rule 8).
 */
export type CheckOutcome = "GREEN" | "YELLOW" | "RED";

export type ChecklistItemCode =
  | "EXCLUDED_CASES"
  | "FISCAL_CODES"
  | "DRIVING_LICENCES"
  | "DRIVING_FORMULA"
  | "VEHICLE"
  | "RESIDENCE"
  | "HISTORY"
  | "DOCUMENTS"
  | "CONSENT";

export interface ChecklistItem {
  code: ChecklistItemCode;
  outcome: CheckOutcome;
  /** Codes explaining a YELLOW or RED outcome, for the back office card. */
  reasons: string[];
  /** Paths of the `quoteData` fields concerned, to highlight them. */
  fields: string[];
}

export interface AutoCheckResult {
  outcome: CheckOutcome;
  items: ChecklistItem[];
}

/** A document read by the document reader (docs/adattatori.md). */
export interface ExtractedDocument {
  kind: string;
  driverIndex?: number;
  fields: Record<string, { value: string | number | boolean | null; confidence: number }>;
}

/** Vehicle data from the plate lookup, when found. */
export interface PlateLookupVehicle {
  make: string;
  model: string;
  firstRegistrationDate?: string;
}

export interface AutoCheckInput {
  quoteData: QuoteData;
  documents: readonly ExtractedDocument[];
  plateLookup: PlateLookupVehicle | null;
  /** Today, from `Clock`, in the Rome calendar. */
  today: string;
  confidenceThreshold: number;
  vintageAgeYears: number;
  expertMinAge: number;
  exclusionCases: readonly ExclusionCase[];
  istatOfCadastral: (cadastralCode: string) => string | null;
}

const RANK: Record<CheckOutcome, number> = { GREEN: 0, YELLOW: 1, RED: 2 };

export function worstOutcome(outcomes: readonly CheckOutcome[]): CheckOutcome {
  return outcomes.reduce<CheckOutcome>((worst, o) => (RANK[o] > RANK[worst] ? o : worst), "GREEN");
}

function item(
  code: ChecklistItemCode,
  red: string[],
  yellow: string[],
  fields: string[],
): ChecklistItem {
  const outcome: CheckOutcome = red.length > 0 ? "RED" : yellow.length > 0 ? "YELLOW" : "GREEN";
  return { code, outcome, reasons: [...red, ...yellow], fields: [...new Set(fields)] };
}

function sameText(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) =>
    String(v ?? "")
      .replace(/\s/g, "")
      .toUpperCase();
  return norm(a) === norm(b);
}

function people(quoteData: QuoteData): { path: string; person: NaturalPerson }[] {
  const list: { path: string; person: NaturalPerson }[] = [];
  if (quoteData.policyHolder.kind === "PERSON")
    list.push({ path: "policyHolder", person: quoteData.policyHolder });
  const owner = quoteData.vehicleOwner;
  if (owner !== "SAME_AS_POLICY_HOLDER" && owner.kind === "PERSON")
    list.push({ path: "vehicleOwner", person: owner });
  quoteData.drivers.forEach((driver, i) =>
    list.push({ path: `drivers.${i}.person`, person: driver.person }),
  );
  return list;
}

function documentOf(
  input: AutoCheckInput,
  kind: string,
  driverIndex?: number,
): ExtractedDocument | undefined {
  return input.documents.find(
    (d) => d.kind === kind && (driverIndex === undefined || d.driverIndex === driverIndex),
  );
}

export function runAutoCheck(input: AutoCheckInput): AutoCheckResult {
  const { quoteData } = input;
  const items: ChecklistItem[] = [];

  // Excluded cases signalled by the check (ASTA-10: the back office decides).
  const excludedRed: string[] = [];
  const activeCodes = new Set(input.exclusionCases.map((c) => c.code));
  if (activeCodes.has(VINTAGE) && isPossibleVintage(quoteData, input.vintageAgeYears))
    excludedRed.push(VINTAGE);
  items.push(
    item(
      "EXCLUDED_CASES",
      excludedRed,
      [],
      excludedRed.length ? ["vehicle.firstRegistrationDate"] : [],
    ),
  );

  // Fiscal codes: invalid or not matching the birth data is serious.
  const cfRed: string[] = [];
  const cfFields: string[] = [];
  for (const { path, person } of people(quoteData)) {
    const problems = fiscalCodeProblems(person, input.today, input.istatOfCadastral);
    if (problems.length > 0) {
      cfRed.push(...problems.map((p) => `FISCAL_CODE_${p}`));
      cfFields.push(`${path}.fiscalCode`);
    }
  }
  items.push(item("FISCAL_CODES", [...new Set(cfRed)], [], cfFields));

  // Licences: expired at the policy start is serious.
  const licenceRed: string[] = [];
  const licenceFields: string[] = [];
  quoteData.drivers.forEach((driver, i) => {
    if (compareCalendarDates(driver.licence.expiresOn, quoteData.request.startDate) < 0) {
      licenceRed.push("LICENCE_EXPIRED");
      licenceFields.push(`drivers.${i}.licence.expiresOn`);
    }
  });
  items.push(item("DRIVING_LICENCES", [...new Set(licenceRed)], [], licenceFields));

  const formula = drivingFormulaProblems(
    quoteData.drivingFormula,
    driverAgesAtStart(quoteData),
    input.expertMinAge,
  );
  items.push(item("DRIVING_FORMULA", formula, [], formula.length ? ["drivingFormula"] : []));

  // Vehicle: plate shape and plate lookup against the declared data.
  const vehicleYellow: string[] = [];
  const vehicleFields: string[] = [];
  if (!plateFitsVehicleType(quoteData.vehicle.plate, quoteData.vehicle.type)) {
    vehicleYellow.push("PLATE_NOT_MATCHING_VEHICLE_TYPE");
    vehicleFields.push("vehicle.plate", "vehicle.type");
  }
  if (input.plateLookup === null) {
    vehicleYellow.push("PLATE_LOOKUP_UNAVAILABLE");
  } else {
    if (!sameText(input.plateLookup.make, quoteData.vehicle.make)) {
      vehicleYellow.push("MAKE_DIFFERS_FROM_PLATE_LOOKUP");
      vehicleFields.push("vehicle.make");
    }
    const lookupDate = input.plateLookup.firstRegistrationDate;
    if (lookupDate !== undefined && lookupDate !== quoteData.vehicle.firstRegistrationDate) {
      vehicleYellow.push("REGISTRATION_DATE_DIFFERS_FROM_PLATE_LOOKUP");
      vehicleFields.push("vehicle.firstRegistrationDate");
    }
  }
  items.push(item("VEHICLE", [], vehicleYellow, vehicleFields));

  // Residence: the owner's residence on the registration certificate.
  const residenceYellow: string[] = [];
  const registration = documentOf(input, "REGISTRATION_CERTIFICATE");
  const owner =
    quoteData.vehicleOwner === "SAME_AS_POLICY_HOLDER"
      ? quoteData.policyHolder
      : quoteData.vehicleOwner;
  const ownerAddress = owner.kind === "PERSON" ? owner.residence : owner.registeredOffice;
  const ownerPath =
    quoteData.vehicleOwner === "SAME_AS_POLICY_HOLDER" ? "policyHolder" : "vehicleOwner";
  const ownerAddressPath =
    owner.kind === "PERSON" ? `${ownerPath}.residence` : `${ownerPath}.registeredOffice`;
  const docMunicipality = registration?.fields.ownerMunicipalityIstat?.value;
  if (
    docMunicipality !== undefined &&
    docMunicipality !== null &&
    !sameText(docMunicipality, ownerAddress.municipalityIstat)
  ) {
    residenceYellow.push("RESIDENCE_DIFFERS_FROM_REGISTRATION");
  }
  items.push(
    item(
      "RESIDENCE",
      [],
      residenceYellow,
      residenceYellow.length ? [`${ownerAddressPath}.municipalityIstat`] : [],
    ),
  );

  // History: the risk certificate against the declared class.
  const historyYellow: string[] = [];
  const certificate = documentOf(input, "RISK_CERTIFICATE");
  const certClass = certificate?.fields.cuClass?.value;
  if (
    certClass !== undefined &&
    certClass !== null &&
    Number(certClass) !== quoteData.history.cuClass
  ) {
    historyYellow.push("CU_CLASS_DIFFERS_FROM_CERTIFICATE");
  }
  items.push(item("HISTORY", [], historyYellow, historyYellow.length ? ["history.cuClass"] : []));

  // Documents: missing ones, and fields read below the threshold.
  const docYellow: string[] = [];
  const docFields: string[] = [];
  for (const required of requiredDocuments(quoteData)) {
    if (!documentOf(input, required.kind, required.driverIndex))
      docYellow.push(`MISSING_${required.kind}`);
  }
  for (const doc of input.documents) {
    for (const [name, field] of Object.entries(doc.fields)) {
      if (field.confidence < input.confidenceThreshold) {
        docYellow.push("LOW_CONFIDENCE");
        docFields.push(
          `documents.${doc.kind}${doc.driverIndex === undefined ? "" : `.${doc.driverIndex}`}.${name}`,
        );
      }
    }
  }
  const holderCode =
    quoteData.policyHolder.kind === "PERSON" ? quoteData.policyHolder.fiscalCode : null;
  const docHolder = registration?.fields.ownerFiscalCode?.value;
  if (
    holderCode &&
    ownerPath === "policyHolder" &&
    typeof docHolder === "string" &&
    normalizeFiscalCodeInput(docHolder) !== holderCode
  ) {
    docYellow.push("OWNER_DIFFERS_FROM_REGISTRATION");
    docFields.push("policyHolder.fiscalCode");
  }
  items.push(item("DOCUMENTS", [], [...new Set(docYellow)], docFields));

  return { outcome: worstOutcome(items.map((i) => i.outcome)), items };
}
