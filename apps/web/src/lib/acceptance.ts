/** Answers of the acceptance area of the API (phase 5). */
export interface OfferRow {
  id: string;
  companyId: string;
  company: string;
  product: string;
  packageName: string | null;
  annualGrossPremiumCents: number;
  guaranteeUntil: string;
  guaranteed: boolean;
  daysLeft: number;
  savingCents: number | null;
  coverage: Record<string, Record<string, unknown>> | null;
  notes: string | null;
  pdfDocumentId: string | null;
  block: "EXPIRED" | "TOO_LATE" | null;
  feeCents: number;
  feeWithAiCents: number | null;
}

export interface Presentation {
  channel: "PRIVATE" | "BROKER";
  aiUsed: boolean;
  offers: OfferRow[];
  suggestion: { recommendedOfferId: string; text: string; shownAt: string } | null;
}

export interface AcceptanceView {
  id: string;
  offerId: string;
  status: "PENDING_SIGNATURE" | "SIGNED" | "PAID" | "VOIDED";
  premiumCents: number;
  feeCents: number;
  totalCents: number;
  feeRule: string;
  aiUsed: boolean;
  signingUrl: string | null;
  documents: { id: string; kind: string; signed: boolean }[];
  payment: { status: string; method: string | null; redirectUrl: string | null } | null;
  signedAt: string | null;
  paidAt: string | null;
  issuanceDeadlineAt: string | null;
}

export interface CurrentAcceptance {
  acceptance: AcceptanceView | null;
  issuer: { name: string; pec: string | null } | null;
}

export interface ToIssueRow {
  auctionId: string;
  code: string;
  holder: string;
  vehicle: string;
  startDate: string | null;
  premiumCents: number;
  paidAt: string | null;
  issuanceDeadlineAt: string | null;
  email: string | null;
  phone: string | null;
}
