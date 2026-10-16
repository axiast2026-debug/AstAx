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
} as const;

export const workflowIdOf = (requestId: string) => `quote-request-${requestId}`;
