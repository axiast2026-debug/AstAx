import type { QuoteData } from "@astax/shared/domain";

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
  minValidityDays: number | null;
  minGuaranteeDate: string;
  auctionStatus: string;
  scheduledCloseAt: string;
  state: IncomingState;
  claimedBy: string | null;
  offer: { id: string; status: string; version: number } | null;
}

export interface Requirement {
  required: boolean;
  [key: string]: unknown;
}

export interface AgencyRequestDetail {
  auctionId: string;
  code: string;
  kind: string;
  auctionStatus: string;
  scheduledCloseAt: string;
  minGuaranteeDate: string;
  invitation: string;
  claim: { byMe: boolean; holder: string | null } | null;
  elsewhere: { agency: string; offered: boolean } | null;
  offer: { id: string; status: string; version: number } | null;
  quoteData: QuoteData;
  package: { code: string; name: string; requirements: Record<string, Requirement> } | null;
  companies: { id: string; name: string }[];
  products: { id: string; companyId: string; name: string }[];
  documents: { id: string; kind: string; driverIndex: number | null }[];
  members: { membershipId: string; name: string }[];
  accessLogged: boolean;
}

export interface OwnOffer {
  id: string;
  status: string;
  version: number;
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
  "naturalEventsVandalism",
  "glass",
] as const;

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
