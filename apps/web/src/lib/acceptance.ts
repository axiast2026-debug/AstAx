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
  creditCents: number;
  dueCents: number;
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
  requestId: string;
  code: string;
  holder: string;
  vehicle: string;
  startDate: string | null;
  startMode?: string;
  premiumCents: number;
  paidAt: string | null;
  issuanceDeadlineAt: string | null;
  email: string | null;
  phone: string | null;
}

export interface IssuanceDetail {
  requestId: string;
  code: string;
  status: string;
  holder: string;
  vehicle: string;
  startDate: string | null;
  startMode?: string;
  company: string;
  product: string;
  premiumCents: number;
  paidAt: string | null;
  issuanceDeadlineAt: string | null;
  email: string | null;
  phone: string | null;
  signedDocuments: { id: string }[];
  uploaded: { kind: string; documentId: string | null; uploadedAt: string | null }[];
  policy: { number: string; issuedAt: string } | null;
}

export interface PolicyRow {
  id: string;
  requestId?: string;
  code: string;
  policyNumber: string;
  holder: string;
  plate: string;
  company: string;
  agency?: { name: string; pec: string | null };
  startDate: string;
  startsAt?: string | null;
  endDate: string;
  premiumCents: number;
  status: string;
  autoRenewal?: boolean;
  /** Process 10: «Rinnova in asta» is open, and the renewal request once made. */
  renewable?: boolean;
  renewalRequestId?: string | null;
  /** S08: the withdrawal, its state once asked. */
  withdrawable?: boolean;
  /** Question 18: withdrawal and cancellation outside the platform. */
  withdrawalOutside?: boolean;
  withdrawal?: "REQUESTED" | "PRICED" | "APPROVED" | "REJECTED" | null;
  documents?: { id: string; kind: string }[];
}

export interface NextOffer {
  id: string;
  kind: "SECOND_OFFER" | "REPRICE";
  status: "PROPOSED" | "ACCEPTED" | "REFUSED" | "EXPIRED";
  company: string;
  product: string;
  guaranteeUntil: string | null;
  premiumCents: number;
  feeCents: number;
  differenceCents: number;
  expiresAt: string;
}
