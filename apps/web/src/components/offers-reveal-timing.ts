/**
 * The opening of the envelopes, in ms from the first paint: when the lids go
 * up, when the cards start coming in. Shared by the server panel and the
 * client reveal, so it cannot live in the "use client" module.
 */
export const UNLOCK_AT = 600;
export const REVEAL_AT = UNLOCK_AT + 420;
