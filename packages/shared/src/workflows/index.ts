/**
 * Names shared by the worker, which defines QuoteRequestWorkflow, and the API,
 * which signals it (ADR 0008). Payloads carry identifiers only (SIC-06).
 */
export const QUOTE_REQUEST_WORKFLOW = "quoteRequestWorkflow";
export const DEFAULT_TASK_QUEUE = "astax-requests";

export const SIGNALS = {
  approved: "approved",
  fireNextTimer: "fireNextTimer",
  auctionExtended: "auctionExtended",
  invitationsAdded: "invitationsAdded",
  auctionCancelled: "auctionCancelled",
  /** GAR-06: the requester asks the agencies to reconfirm (from the outbox). */
  reconfirmationRequested: "reconfirmationRequested",
  /** PAG-02: the payment is confirmed (from the outbox): the issuance phase starts. */
  paymentConfirmed: "paymentConfirmed",
  /** EMI-02, EMI-04: the issuance changed (issued, second offer, cancelled): read it again. */
  issuanceChanged: "issuanceChanged",
} as const;

export const workflowIdOf = (requestId: string) => `quote-request-${requestId}`;
