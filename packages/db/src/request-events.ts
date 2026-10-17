import type { DbTransaction } from "./client.js";

/** Entries of a request's timeline (QuoteRequestEvent), shown to its requester. */
export type RequestEventType =
  | "CREATED"
  | "DOCUMENT_ADDED"
  | "CONSENT_LINK_SENT"
  | "CONSENT_GIVEN"
  | "SUBMITTED"
  | "RESUBMITTED"
  | "AUTO_CHECKED"
  | "INTEGRATION_REQUESTED"
  | "CORRECTED"
  | "APPROVED"
  | "EXCLUDED"
  | "CANCELLED"
  | "AUCTION_OPENED"
  | "AUCTION_TOPPED_UP"
  | "AUCTION_EXTENDED"
  | "AUCTION_INVITATIONS_ADDED"
  | "AUCTION_CLOSED"
  | "AUCTION_REOPENED"
  | "AUCTION_CANCELLED"
  | "DESERTED"
  | "GUARANTEE_REMINDER_SENT"
  | "EXPIRED"
  | "RECONFIRMATION_REQUESTED"
  | "RECONFIRMATION_OPENED"
  | "AUTO_CANCELLED";

export type ActorKind = "REQUESTER" | "CUSTOMER" | "BACK_OFFICE" | "SYSTEM";

export async function addRequestEvent(
  tx: DbTransaction,
  request: { id: string; ownerUserId: string | null; ownerOrganizationId: string | null },
  event: {
    type: RequestEventType;
    actorKind: ActorKind;
    actorUserId: string | null;
    at: Date;
    details?: Record<string, string | number | boolean | null | string[]>;
  },
): Promise<void> {
  // createMany: no RETURNING, so a writer who cannot read the timeline still writes it.
  await tx.quoteRequestEvent.createMany({
    data: [
      {
        quoteRequestId: request.id,
        ownerUserId: request.ownerUserId,
        ownerOrganizationId: request.ownerOrganizationId,
        type: event.type,
        actorKind: event.actorKind,
        actorUserId: event.actorUserId,
        details: event.details ?? {},
        at: event.at,
      },
    ],
  });
}

/**
 * GAR-06: whether the requester asked for the reconfirmation number `used + 1`.
 * The request carries the count it was made at, not a time, so that the API
 * and the worker agree whatever their clocks (development clock included).
 */
export async function reconfirmationAsked(
  tx: DbTransaction,
  quoteRequestId: string,
  used: number,
): Promise<boolean> {
  const asked = await tx.quoteRequestEvent.count({
    where: {
      quoteRequestId,
      type: "RECONFIRMATION_REQUESTED",
      details: { path: ["used"], equals: used },
    },
  });
  return asked > 0;
}
