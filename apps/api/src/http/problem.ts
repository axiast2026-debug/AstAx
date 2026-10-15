import { ERROR_STATUS, type ErrorCode, type Problem } from "@astax/shared/errors";
import type { z } from "zod";

const TITLES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Authentication required",
  FORBIDDEN: "Forbidden",
  CONTEXT_REQUIRED: "Active context required",
  CONTEXT_INVALID: "Active context not valid for this user",
  LEGAL_ACCEPTANCE_REQUIRED: "Legal documents must be accepted first",
  VALIDATION_FAILED: "Invalid request",
  NOT_FOUND: "Not found",
  CONFLICT: "Conflict",
  SEALED_BID: "Sealed bid: offers cannot be read before closing",
  AUCTION_CLOSED: "Auction closed",
  CLAIMED_BY_COLLEAGUE: "Request claimed by a colleague",
  RATE_LIMITED: "Too many requests",
  INTERNAL: "Internal error",
};

/**
 * Error raised by use cases and guards; the filter turns it into
 * application/problem+json. `detail` must contain identifiers only (SIC-06).
 */
export class ProblemError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly detail?: string,
    readonly errors?: Problem["errors"],
  ) {
    super(code);
    this.name = "ProblemError";
  }

  static fromZod(error: z.ZodError): ProblemError {
    return new ProblemError(
      "VALIDATION_FAILED",
      undefined,
      error.issues.map((issue) => ({ path: issue.path.join("."), issue: issue.code })),
    );
  }
}

export function toProblem(
  code: ErrorCode,
  instance?: string,
  detail?: string,
  errors?: Problem["errors"],
): Problem {
  return {
    type: `https://astax.it/problems/${code.toLowerCase().replaceAll("_", "-")}`,
    title: TITLES[code],
    status: ERROR_STATUS[code],
    code,
    ...(detail === undefined ? {} : { detail }),
    ...(instance === undefined ? {} : { instance }),
    ...(errors === undefined ? {} : { errors }),
  };
}
