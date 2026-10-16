/**
 * States of a request and of an offer, and the only transitions allowed
 * between them. The diagrams in docs/modello-dati.md are the source: a test
 * checks that these tables match them edge by edge.
 */

export const REQUEST_STATUSES = [
  "DRAFT",
  "IN_VERIFICATION",
  "INTEGRATION_REQUESTED",
  "EXCLUDED",
  "AUCTION_OPEN",
  "OFFERS_AVAILABLE",
  "DESERTED",
  "EXPIRED",
  "IN_RECONFIRMATION",
  "ACCEPTED",
  "IN_ISSUANCE",
  "ISSUED",
  "CANCELLED",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_TRANSITIONS: readonly (readonly [RequestStatus, RequestStatus])[] = [
  ["DRAFT", "IN_VERIFICATION"],
  ["IN_VERIFICATION", "INTEGRATION_REQUESTED"],
  ["INTEGRATION_REQUESTED", "IN_VERIFICATION"],
  ["IN_VERIFICATION", "EXCLUDED"],
  ["IN_VERIFICATION", "AUCTION_OPEN"],
  ["AUCTION_OPEN", "AUCTION_OPEN"],
  ["AUCTION_OPEN", "OFFERS_AVAILABLE"],
  ["AUCTION_OPEN", "DESERTED"],
  ["DESERTED", "AUCTION_OPEN"],
  ["OFFERS_AVAILABLE", "ACCEPTED"],
  ["OFFERS_AVAILABLE", "EXPIRED"],
  ["EXPIRED", "IN_RECONFIRMATION"],
  ["IN_RECONFIRMATION", "OFFERS_AVAILABLE"],
  ["IN_RECONFIRMATION", "DESERTED"],
  ["ACCEPTED", "OFFERS_AVAILABLE"],
  ["ACCEPTED", "IN_ISSUANCE"],
  ["IN_ISSUANCE", "ISSUED"],
  ["IN_ISSUANCE", "ACCEPTED"],
  ["ISSUED", "CANCELLED"],
  ["DRAFT", "CANCELLED"],
  ["OFFERS_AVAILABLE", "CANCELLED"],
  ["DESERTED", "CANCELLED"],
  ["EXPIRED", "CANCELLED"],
  ["IN_ISSUANCE", "CANCELLED"],
];

export const OFFER_STATUSES = [
  "SUBMITTED",
  "WITHDRAWN",
  "EXCLUDED",
  "AWAITING_CUSTOMER",
  "WINNING",
  "ISSUED",
  "NOT_CHOSEN",
  "EXPIRED",
  "MISSED_ISSUANCE",
] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_TRANSITIONS: readonly (readonly [OfferStatus, OfferStatus])[] = [
  ["SUBMITTED", "WITHDRAWN"],
  ["SUBMITTED", "EXCLUDED"],
  ["SUBMITTED", "AWAITING_CUSTOMER"],
  ["AWAITING_CUSTOMER", "EXCLUDED"],
  ["AWAITING_CUSTOMER", "WINNING"],
  ["AWAITING_CUSTOMER", "NOT_CHOSEN"],
  ["AWAITING_CUSTOMER", "EXPIRED"],
  ["WINNING", "ISSUED"],
  ["WINNING", "MISSED_ISSUANCE"],
  ["NOT_CHOSEN", "AWAITING_CUSTOMER"],
];

export class TransitionNotAllowed extends Error {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`Transition not allowed: ${from} -> ${to}`);
    this.name = "TransitionNotAllowed";
  }
}

/** The new status of a request; throws on a passage the diagram does not allow. */
export function transitionRequest(from: RequestStatus, to: RequestStatus): RequestStatus {
  if (!REQUEST_TRANSITIONS.some(([a, b]) => a === from && b === to)) {
    throw new TransitionNotAllowed(from, to);
  }
  return to;
}

/** The new status of an offer; throws on a passage the diagram does not allow. */
export function transitionOffer(from: OfferStatus, to: OfferStatus): OfferStatus {
  if (!OFFER_TRANSITIONS.some(([a, b]) => a === from && b === to)) {
    throw new TransitionNotAllowed(from, to);
  }
  return to;
}
