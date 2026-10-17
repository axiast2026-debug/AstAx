/**
 * What the workflow and the activities exchange (ADR 0008): identifiers,
 * counts and instants as ISO strings. Never premiums, names or fiscal codes
 * (BC-07, SIC-06): a test checks the serialized history.
 */

export type RoundKind = "MAIN" | "REOPEN" | "RECONFIRMATION";

export interface RoundTimes {
  auctionId: string;
  status: "OPEN" | "CLOSING" | "CLOSED" | "CANCELLED";
  scheduledCloseAt: string;
  topUpAt: string;
  reminderAt: string;
}

export type OpenResult =
  | ({ opened: true; invited: number } & RoundTimes)
  | {
      opened: false;
      reason:
        | "NO_AGENCIES"
        | "CONSENT_REVOKED"
        | "NOT_APPROVED"
        | "NOT_REOPENABLE"
        /** GAR-06: not «Scaduta», or the reconfirmations are used up. */
        | "NOT_RECONFIRMABLE";
    };

export interface CloseResult {
  validOffers: number;
  excludedOffers: number;
  cancelled: boolean;
}

export interface GuaranteeSchedule {
  /** False once the request has left «Offerte disponibili» (accepted, cancelled, expired). */
  active: boolean;
  /** GAR-05: when to remind about the best guaranteed offer; null when sent or none. */
  reminderAt: string | null;
  reminderOfferId: string | null;
  /** When the best guaranteed offer ends: then another may become the best (GAR-05). */
  bestExpiresAt: string | null;
  /** GAR-06: when the last guarantee ends; null when none is left. */
  allExpiredAt: string | null;
  /** PAG-02: the request is paid and in issuance (absent in the histories before phase 5). */
  issuance?: boolean;
}

/** EMI-01: the issuance deadline and the reminder before it. */
export interface IssuanceSchedule {
  deadlineAt: string | null;
  reminderAt: string | null;
}

/** GAR-06: a request «Scaduta» waits for a reconfirmation or closes by itself. */
export interface ExpiredSchedule {
  expired: boolean;
  autoCancelAt: string | null;
  /** The requester has asked for a reconfirmation, whose signal is on its way. */
  pending?: boolean;
}

export interface ReopenPolicy {
  enabled: boolean;
  maxAttempts: number;
}

/**
 * A back office request on one auction (ASTA-06). The reason stays in the API's
 * audit log, under `actionId`: free text never enters Temporal (BC-07, rule 8).
 */
export interface BackOfficeAction {
  auctionId: string;
  actionId: string;
  byUserId: string;
}

export interface AuctionActivities {
  openRound(input: { requestId: string; kind: RoundKind; round: number }): Promise<OpenResult>;
  roundTimes(input: { auctionId: string }): Promise<RoundTimes>;
  reopenPolicy(input: { auctionId: string }): Promise<ReopenPolicy>;
  topUp(input: { auctionId: string }): Promise<{ invited: number }>;
  remindAgencies(input: { auctionId: string }): Promise<{ reminded: number }>;
  closeRound(input: { auctionId: string }): Promise<CloseResult>;
  markDeserted(input: { requestId: string }): Promise<void>;
  extendRound(input: { workingHours: number } & BackOfficeAction): Promise<void>;
  addInvitations(
    input: { organizationIds: string[] } & BackOfficeAction,
  ): Promise<{ invited: number }>;
  cancelRound(input: BackOfficeAction): Promise<void>;
  recordBackOfficeOutcome(
    input: BackOfficeAction & {
      kind: "extend" | "invite" | "cancel";
      result: "OTHER_ROUND" | "REFUSED";
    },
  ): Promise<void>;
  guaranteeSchedule(input: { requestId: string }): Promise<GuaranteeSchedule>;
  sendGuaranteeReminder(input: { requestId: string; offerId: string }): Promise<void>;
  expireRequest(input: { requestId: string }): Promise<{ expired: boolean }>;
  expiredSchedule(input: { requestId: string }): Promise<ExpiredSchedule>;
  /** OFF-09: counts only (BC-07): never a premium nor a company. */
  reviewQuotes(input: { auctionId: string }): Promise<{ checked: number; flagged: number }>;
  autoCancelExpired(input: { requestId: string }): Promise<{ cancelled: boolean }>;
  issuanceSchedule(input: { requestId: string }): Promise<IssuanceSchedule>;
  sendIssuanceReminder(input: { requestId: string }): Promise<void>;
}
