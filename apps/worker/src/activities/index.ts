import { errorForLog } from "@astax/shared/logging";
import { ApplicationFailure } from "@temporalio/activity";
import { auctionActivities } from "./auctions.js";
import { guaranteeActivities } from "./guarantees.js";
import type { ActivityDeps } from "./support.js";
import type { AuctionActivities } from "./types.js";

/**
 * BC-07, rule 8: an activity's error reaches Temporal's history and the logs
 * with its type, code and stack frames only, never with the message of a
 * database error (it repeats the query values). Our own failures keep theirs.
 */
export function safe<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof ApplicationFailure) throw error;
      const loggable = errorForLog(error);
      throw ApplicationFailure.create({
        type: loggable.code ? `${loggable.type}:${loggable.code}` : loggable.type,
        message: loggable.message ?? `${loggable.type} (message withheld)`,
        details: loggable.stack ? [loggable.stack] : [],
      });
    }
  };
}

export function createActivities(deps: ActivityDeps): AuctionActivities {
  const all = { ...auctionActivities(deps), ...guaranteeActivities(deps) };
  return Object.fromEntries(
    Object.entries(all).map(([name, fn]) => [
      name,
      safe(fn as (...a: unknown[]) => Promise<unknown>),
    ]),
  ) as unknown as AuctionActivities;
}

export type { ActivityDeps, RealtimeEvent } from "./support.js";
export type * from "./types.js";
