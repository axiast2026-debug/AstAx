import type { ConfirmedAnia } from "@/components/ania-confirmed";
import type { WorkingTime } from "@/components/countdown-ring";

/** Answers of the agency area of the API (spec 04). */
export type IncomingState =
  "NEW" | "CLAIMED_BY_ME" | "CLAIMED_BY_COLLEAGUE" | "OFFERED" | "DECLINED";

export interface IncomingRow {
  auctionId: string;
  code: string;
  kind: string;
  vehicleType: string | null;
  province: string | null;
  cuClass: number | null;
  claimsLast5y: number | null;
  youngestDriverAge: number | null;
  packageCode: string | null;
  packageName: string | null;
  startDate: string | null;
  startMode?: string;
  minValidityDays: number | null;
  minGuaranteeDate: string;
  auctionStatus: string;
  scheduledCloseAt: string;
  /** ASTA-02: the working time of an open round, from the server. */
  live: WorkingTime | null;
  /** P5 radar: closes within the «closing soon» minutes with nothing sent. */
  urgent: boolean;
  state: IncomingState;
  claimedBy: string | null;
  /** OFF-02 OFF-03: the person already works on it for another of their agencies. */
  elsewhere: { agency: string; offered: boolean } | null;
  offer: { id: string; status: string; version: number } | null;
  /** ADR 0014: a request of a broker's lot sent without documents. */
  withoutDocuments?: boolean;
}

export interface Requirement {
  required: boolean;
  [key: string]: unknown;
}

export interface AgencyRequest {
  plate: string;
  drivingFormula: string;
  blackBox: boolean;
  startDate: string;
  startMode: string | null;
  minValidityDays: number;
  auctionDurationHours: number;
  holder: {
    kind: "PERSON" | "COMPANY";
    taxCode: string;
    address: { street: string; postalCode: string; municipality: string; province: string };
  };
}

export interface AgencyRequestDetail {
  auctionId: string;
  code: string;
  kind: string;
  auctionStatus: string;
  scheduledCloseAt: string;
  live: WorkingTime | null;
  minGuaranteeDate: string;
  invitation: string;
  claim: { byMe: boolean; holder: string | null } | null;
  elsewhere: { agency: string; offered: boolean } | null;
  offer: { id: string; status: string; version: number; readable?: boolean } | null;
  /** Dan, 2026-10-29: the request without names, vehicle, persons or history. */
  request: AgencyRequest;
  /** The type of quote the back office confirmed (fifth check). */
  quoteType: string | null;
  /** Dan, 2026-10-28: the ANIA data confirmed by the back office. */
  ania: ConfirmedAnia | null;
  package: { code: string; name: string; requirements: Record<string, Requirement> } | null;
  companies: { id: string; name: string }[];
  products: { id: string; companyId: string; name: string }[];
  documents: { id: string; kind: string; driverIndex: number | null }[];
  members: { membershipId: string; name: string }[];
  /** GAR-07: in a reconfirmation, the agency's offer of the last round. */
  previousOffer: {
    annualGrossPremiumCents: number;
    companyId: string;
    productId: string;
    coverage: Record<string, Record<string, unknown>>;
    notes: string | null;
    guaranteeUntil: string;
    hasPdf: boolean;
  } | null;
  accessLogged: boolean;
}

export interface OwnOffer {
  id: string;
  status: string;
  version: number;
  /** PRES-01: server time of the submission or of the last change. */
  lastChangedAt: string;
  /** P3 receipt: the colleague who sent it. */
  sentBy: string | null;
  offer: {
    annualGrossPremiumCents: number;
    companyId: string;
    productId: string;
    coverage: Record<string, Record<string, unknown>>;
    guaranteeUntil: string;
    notes: string | null;
  };
  hasPdf: boolean;
}

export interface MyOfferRow {
  id: string;
  auctionId: string;
  code: string;
  profile: { vehicleType: string | null; province: string | null; packageCode: string | null };
  status: string;
  kind: string;
  annualGrossPremiumCents: number | null;
  company: string | null;
  guaranteeUntil: string | null;
  author: string | null;
  exclusionReason: string | null;
  scheduledCloseAt: string;
  /** GAR-08: the guarantee has not ended yet. */
  guaranteed: boolean;
}

export interface AgencyDashboard {
  counters: Record<string, number | null>;
  last30Days: Record<string, number | null>;
}

export const COVERAGE_ITEMS = [
  "rca",
  "recourseWaiver",
  "roadsideAssistance",
  "legalProtection",
  "driverAccident",
  "theftFire",
  "naturalEvents",
  "vandalism",
  "glass",
  "collisionKasko",
  "fullKasko",
  "wildlifeCollision",
] as const;

/** Dan, 2026-10-28: the coverages with a coinsurance the agency declares. */
export const COINSURANCE_ITEMS: readonly string[] = [
  "theftFire",
  "naturalEvents",
  "vandalism",
  "collisionKasko",
  "fullKasko",
  "wildlifeCollision",
];

/** «505,00» or «505» to cents; null when not a positive amount (rule 5: integers only). */
export function euroToCents(value: string): number | null {
  const clean = value.trim().replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, decimals = ""] = clean.split(".");
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  return cents > 0 ? cents : null;
}

export function centsToEuroInput(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}
