import { errorForLog, type Logger } from "@astax/shared/logging";
import { ApplicationFailure, Context } from "@temporalio/activity";
import { auctionActivities } from "./auctions.js";
import { guaranteeActivities } from "./guarantees.js";
import type { ActivityDeps } from "./support.js";
import type { AuctionActivities } from "./types.js";

/** About ten minutes of retries (2 s, doubling): from then on each failure is an alarm. */
const ALARM_AFTER_ATTEMPTS = 6;

function currentAttempt(): number {
  try {
    return Context.current().info.attempt;
  } catch {
    return 0;
  }
}

/**
 * BC-07, rule 8: an activity's error reaches Temporal's history and the logs
 * with its type, code and stack frames only, never with the message of a
 * database error (it repeats the query values). Our own failures keep theirs.
 * The steps of the auction retry without limit: past a few attempts every
 * failure is an alarm in the logs, with identifiers only.
 */
export function safe<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  alarm?: { name: string; logger: Logger },
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (error) {
      const loggable = errorForLog(error);
      const attempt = currentAttempt();
      if (alarm && attempt >= ALARM_AFTER_ATTEMPTS) {
        alarm.logger.error(
          { activity: alarm.name, attempt, err: loggable },
          "ALARM: an auction step keeps failing",
        );
      }
      if (error instanceof ApplicationFailure) throw error;
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
      safe(fn as (...a: unknown[]) => Promise<unknown>, { name, logger: deps.logger }),
    ]),
  ) as unknown as AuctionActivities;
}

export type { ActivityDeps, RealtimeEvent } from "./support.js";
export type * from "./types.js";
