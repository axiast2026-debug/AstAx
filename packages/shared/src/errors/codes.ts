/**
 * Stable error codes of the API, returned in application/problem+json bodies.
 * The interfaces translate them; the API never sends user-facing sentences.
 */
export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "CONTEXT_REQUIRED",
  "CONTEXT_INVALID",
  "LEGAL_ACCEPTANCE_REQUIRED",
  "VALIDATION_FAILED",
  "NOT_FOUND",
  "CONFLICT",
  "SEALED_BID",
  "AUCTION_CLOSED",
  "CLAIMED_BY_COLLEAGUE",
  "RATE_LIMITED",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  CONTEXT_REQUIRED: 403,
  CONTEXT_INVALID: 403,
  LEGAL_ACCEPTANCE_REQUIRED: 403,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  SEALED_BID: 403,
  AUCTION_CLOSED: 409,
  CLAIMED_BY_COLLEAGUE: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** Body of an error response (RFC 9457). */
export interface Problem {
  type: string;
  title: string;
  status: number;
  code: ErrorCode;
  detail?: string;
  instance?: string;
  /** Field errors of a VALIDATION_FAILED: paths and issue codes, never the rejected values. */
  errors?: { path: string; issue: string }[];
}

export const PROBLEM_CONTENT_TYPE = "application/problem+json";
