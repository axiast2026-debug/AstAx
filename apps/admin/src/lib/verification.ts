import "server-only";
import type { QuoteData } from "@astax/shared/domain";
import { notFound } from "next/navigation";
import { api } from "./auth";

/** Shapes of the verification API (apps/api, verification module). */
export interface ChecklistItem {
  code: string;
  outcome: "GREEN" | "YELLOW" | "RED";
  reasons: string[];
  fields: string[];
  correction: string | null;
  note: string | null;
}

export interface CardDocument {
  id: string;
  kind: string;
  driverIndex: number | null;
  fileName: string;
  mime: string;
  extraction: {
    fields: Record<string, { value: string | number | boolean | null; confidence: number }>;
  } | null;
  uploadedAt: string;
}

export interface Reason {
  code: string;
  it: string;
  sq: string;
}

export interface VerificationCard {
  id: string;
  code: string;
  status: string;
  channel: "PRIVATE" | "BROKER";
  /** ADR 0014: sent from a broker's lot without documents. */
  withoutDocuments?: boolean;
  customer: string | null;
  quoteData: QuoteData | null;
  quoteDataVersion: number | null;
  completion: Completion | null;
  versions: {
    version: number;
    source: string;
    changedFields: string[];
    reason: string | null;
    createdAt: string;
  }[];
  consent: { method: string; acceptedAt: string; evidence: Record<string, unknown> } | null;
  reasons: { integration: Reason[]; exclusion: Reason[] };
  verification: {
    round: number;
    autoOutcome: "GREEN" | "YELLOW" | "RED";
    checklist: ChecklistItem[];
    assignedToUserId: string | null;
    decision: string | null;
    reasonCodes: string[];
    message: string | null;
    decidedAt: string | null;
  } | null;
  documents: CardDocument[];
  timeline: { type: string; actorKind: string; at: string }[];
}

export interface QueueRow {
  requestId: string;
  code: string;
  channel: "PRIVATE" | "BROKER";
  round: number;
  autoOutcome: "GREEN" | "YELLOW" | "RED";
  waitingSince: string;
  waitingMinutes: number;
  assignedTo: { id: string; name: string } | null;
}

/** The card; the API logs every opening (QUOTE_DATA_VIEWED). */
export async function verificationCard(id: string): Promise<VerificationCard> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { status, body } = await api<VerificationCard>(`/verification/requests/${id}`);
  if (status === 404 || status === 403) notFound();
  return body;
}

/**
 * Declared values next to the ones read from the documents: the rows of the
 * comparison in the card (spec 06 «Scheda di verifica»).
 */
export interface ComparisonRow {
  key: string;
  declared: string;
  document: string | null;
  confidence: number | null;
  path: string;
}

export function comparisonRows(
  data: QuoteData,
  documents: readonly CardDocument[],
  municipalityName: (istat: string) => string,
): ComparisonRow[] {
  const doc = (kind: string, index?: number) =>
    [...documents]
      .reverse()
      .find((d) => d.kind === kind && (index === undefined || d.driverIndex === index));
  const field = (kind: string, name: string, index?: number) =>
    doc(kind, index)?.extraction?.fields[name];
  const holder = data.policyHolder;
  const owner = data.vehicleOwner === "SAME_AS_POLICY_HOLDER" ? holder : data.vehicleOwner;
  const residence = owner.kind === "PERSON" ? owner.residence : owner.registeredOffice;
  const row = (
    key: string,
    declared: string | number | undefined,
    found: { value: unknown; confidence: number } | undefined,
    path: string,
    show: (v: unknown) => string = (v) => String(v),
  ): ComparisonRow => ({
    key,
    declared: declared === undefined ? "" : String(declared),
    document: found?.value === undefined || found.value === null ? null : show(found.value),
    confidence: found?.confidence ?? null,
    path,
  });
  const rows = [
    row("plate", data.vehicle.plate, field("REGISTRATION_CERTIFICATE", "plate"), "vehicle.plate"),
    row("make", data.vehicle.make, field("REGISTRATION_CERTIFICATE", "make"), "vehicle.make"),
    row("model", data.vehicle.model, field("REGISTRATION_CERTIFICATE", "model"), "vehicle.model"),
    row(
      "powerKw",
      data.vehicle.powerKw,
      field("REGISTRATION_CERTIFICATE", "powerKw"),
      "vehicle.powerKw",
    ),
    row(
      "firstRegistration",
      data.vehicle.firstRegistrationDate,
      field("REGISTRATION_CERTIFICATE", "firstRegistrationDate"),
      "vehicle.firstRegistrationDate",
    ),
    row(
      "ownerFiscalCode",
      owner.kind === "PERSON" ? owner.fiscalCode : owner.vatNumber,
      field("REGISTRATION_CERTIFICATE", "ownerFiscalCode"),
      "policyHolder.fiscalCode",
    ),
    row(
      "residence",
      municipalityName(residence.municipalityIstat),
      field("REGISTRATION_CERTIFICATE", "ownerMunicipalityIstat"),
      "policyHolder.residence.municipalityIstat",
      (v) => municipalityName(String(v)),
    ),
    ...data.drivers.flatMap((d, i) => [
      row(
        "licenceNumber",
        d.licence.number,
        field("DRIVING_LICENCE", "number", i),
        `drivers.${i}.licence.number`,
      ),
      row(
        "licenceExpires",
        d.licence.expiresOn,
        field("DRIVING_LICENCE", "expiresOn", i),
        `drivers.${i}.licence.expiresOn`,
      ),
    ]),
    row("cuClass", data.history.cuClass, field("RISK_CERTIFICATE", "cuClass"), "history.cuClass"),
    row(
      "currentInsurer",
      data.history.currentInsurer,
      field("RISK_CERTIFICATE", "currentInsurer"),
      "history.currentInsurer",
    ),
    row(
      "currentExpiry",
      data.history.currentExpiryDate,
      field("RISK_CERTIFICATE", "expiryDate"),
      "history.currentExpiryDate",
    ),
  ];
  return rows;
}

export function differs(row: ComparisonRow): boolean {
  if (row.document === null) return false;
  const norm = (v: string) => v.replace(/\s/g, "").toUpperCase();
  return norm(row.document) !== norm(row.declared);
}

/** ADR 0013: the starting data of a request with the essential data only. */
export interface Completion {
  intake: {
    vehicleStatus: "INSURED" | "NEW";
    plate: string;
    ownerBirthDate: string;
    residence: { street: string; postalCode: string; municipalityIstat: string; province: string };
    drivingFormula?: "FREE" | "EXPERT" | "EXCLUSIVE";
    classSource?: { kind: string; plate?: string; relativeBirthDate?: string };
  };
  candidate: {
    policyHolder: Record<string, unknown>;
    drivers: { licence?: Record<string, unknown> }[];
    drivingFormula?: "FREE" | "EXPERT" | "EXCLUSIVE";
    vehicle: Record<string, unknown>;
    history: Record<string, unknown>;
    request: QuoteData["request"];
    missing: string[];
  };
  phone: string | null;
  lists: Record<string, { code: string; it: string; sq: string | null }[]>;
}
