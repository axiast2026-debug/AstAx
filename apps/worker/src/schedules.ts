import type { Clock } from "@astax/adapters/clock";
import {
  prepareRemittances,
  settingsAt,
  SYSTEM_CONTEXT,
  withContext,
  type DbClient,
} from "@astax/db";
import { isRemittanceDay } from "@astax/shared/domain";
import { romeCalendarDate } from "@astax/shared/format";
import { errorForLog, type Logger } from "@astax/shared/logging";

/**
 * CONT-01: on the run day (Monday, parameter `remittance.runDay`, in Rome)
 * the week's remittances are prepared as drafts for accounting to review.
 * A timer of the worker rather than a Temporal schedule, so it follows the
 * application clock (rule 6, and the dev clock of rule 13). Running it again
 * on the same day adds nothing: one remittance per agency and run day.
 */
export async function prepareRemittancesIfDue(
  db: DbClient,
  now: Date,
): Promise<{ runDate: string; created: number } | null> {
  return withContext(db, SYSTEM_CONTEXT, async (tx) => {
    const { "remittance.runDay": runDay } = await settingsAt(tx, ["remittance.runDay"], now);
    const today = romeCalendarDate(now);
    if (!isRemittanceDay(today, runDay)) return null;
    const { created } = await prepareRemittances(tx, today, now);
    return { runDate: today, created: created.length };
  });
}

/** Checks every few minutes; the identifiers and counts only go to the log (rule 8). */
export function startSchedules(
  db: DbClient,
  clock: Clock,
  logger: Logger,
  intervalMs: number,
): () => void {
  if (intervalMs === 0) return () => undefined;
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    prepareRemittancesIfDue(db, clock.now())
      .then((result) => {
        if (result && result.created > 0) logger.info(result, "remittances prepared");
      })
      .catch((error: unknown) =>
        logger.error({ err: errorForLog(error) }, "remittances not prepared"),
      )
      .finally(() => {
        running = false;
      });
  };
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}
