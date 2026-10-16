import { auctionActivities } from "./auctions.js";
import { guaranteeActivities } from "./guarantees.js";
import type { ActivityDeps } from "./support.js";
import type { AuctionActivities } from "./types.js";

export function createActivities(deps: ActivityDeps): AuctionActivities {
  return { ...auctionActivities(deps), ...guaranteeActivities(deps) };
}

export type { ActivityDeps, RealtimeEvent } from "./support.js";
export type * from "./types.js";
