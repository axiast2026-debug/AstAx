import "server-only";
import type { QuoteData, QuoteDraft, QuoteDraftSection } from "@astax/shared/domain";
import { notFound } from "next/navigation";
import { api } from "./auth";

/** Shapes of the API answers used by the request pages (apps/api, requests module). */
export interface ListOption {
  code: string;
  label: string;
}

export interface RequestOptions {
  auctionDurationsHours: number[];
  defaultAuctionDurationHours: number;
  minValidityDaysOptions: number[];
  defaultMinValidityDays: number;
  expertMinAge: number;
  maxUploadMb: number;
  lists: Record<string, ListOption[]>;
  specialUses: ListOption[];
  packages: { code: string; name: string; version: number; description: string }[];
}

export interface Extraction {
  fields: Record<string, { value: string | number | boolean | null; confidence: number }>;
}

export interface RequestDocument {
  id: string;
  kind: string;
  driverIndex: number | null;
  fileName: string;
  mime: string;
  size: number;
  uploadedAt: string;
  extraction: Extraction | null;
}

export interface RequestDetail {
  /** ASTA-02: the closing if the request were approved now (draft only). */
  closeIfApprovedNow: string | null;
  id: string;
  code: string;
  status: string;
  channel: "PRIVATE" | "BROKER";
  editable: boolean;
  draft: QuoteDraft | null;
  missingSections: QuoteDraftSection[];
  quoteData: QuoteData | null;
  quoteDataVersion: number | null;
  submittedAt: string | null;
  consent: { method: string; acceptedAt: string } | null;
  integration: { sections: string[]; documents: string[] } | null;
  lastDecision: {
    decision: string;
    reasonCodes: string[];
    message: string | null;
    decidedAt: string | null;
  } | null;
  documents: RequestDocument[];
  timeline: { type: string; actorKind: string; at: string; details: Record<string, unknown> }[];
}

export interface RequestSummary {
  id: string;
  code: string;
  status: string;
  channel: string;
  plate: string | null;
  packageCode: string | null;
  startDate: string | null;
  submittedAt: string | null;
  createdAt: string;
  customer: string | null;
}

export async function requestOptions(): Promise<RequestOptions> {
  return (await api<RequestOptions>("/reference/request-options")).body;
}

export async function requestDetail(id: string): Promise<RequestDetail> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { status, body } = await api<RequestDetail>(`/requests/${id}`);
  if (status === 404) notFound();
  return body;
}

export function latestDocument(detail: RequestDetail, kind: string, driverIndex?: number) {
  return [...detail.documents]
    .reverse()
    .find((d) => d.kind === kind && (driverIndex === undefined || d.driverIndex === driverIndex));
}

/** A field read from a document, as a string for a form default. */
export function extracted(
  document: RequestDocument | undefined,
  field: string,
): string | undefined {
  const value = document?.extraction?.fields[field]?.value;
  return value === null || value === undefined ? undefined : String(value);
}

/** The wizard steps; the broker's customer step comes before the draft exists. */
export const PRIVATE_STEPS = [
  "veicolo",
  "conducenti",
  "copertura",
  "asta",
  "consensi",
  "riepilogo",
] as const;
export const BROKER_STEPS = [
  "veicolo",
  "conducenti",
  "copertura",
  "asta",
  "consenso",
  "riepilogo",
] as const;
export type WizardStep = (typeof PRIVATE_STEPS)[number] | (typeof BROKER_STEPS)[number];

/** The draft sections each step saves (used for the integration scope too). */
export const STEP_SECTIONS: Record<WizardStep, QuoteDraftSection[]> = {
  veicolo: ["vehicle", "history"],
  conducenti: ["policyHolder", "vehicleOwner", "driving"],
  copertura: ["request"],
  asta: ["request"],
  consensi: [],
  consenso: [],
  riepilogo: [],
};

/** Five past years and the current one, for the claims table of the risk certificate. */
export function claimYears(startDate: string | undefined, today: string): number[] {
  const year = Number((startDate ?? today).slice(0, 4));
  return [year - 5, year - 4, year - 3, year - 2, year - 1, year];
}
