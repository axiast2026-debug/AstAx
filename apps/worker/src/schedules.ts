import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import type { RuiRegistryPort } from "@astax/adapters/rui-registry";
import {
  importRuiRecords,
  issueBrokerInvoices,
  prepareRemittances,
  settingsAt,
  SYSTEM_CONTEXT,
  withContext,
  type DbClient,
} from "@astax/db";
import { addCalendarDays, isRemittanceDay, previousMonth } from "@astax/shared/domain";
import { romeCalendarDate } from "@astax/shared/format";
import { errorForLog, type Logger } from "@astax/shared/logging";
import { label, loadNotificationLabels } from "@astax/shared/notifications";

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
): Promise<{ runDate: string; created: number }> {
  return withContext(db, SYSTEM_CONTEXT, async (tx) => {
    const { "remittance.runDay": runDay } = await settingsAt(tx, ["remittance.runDay"], now);
    // The latest run day up to today: a worker stopped on Monday catches up
    // later (one remittance per agency and run day, so it adds nothing twice).
    let runDate = romeCalendarDate(now);
    while (!isRemittanceDay(runDate, runDay)) runDate = addCalendarDays(runDate, -1);
    const { created } = await prepareRemittances(tx, runDate, now);
    return { runDate, created: created.length };
  });
}

/**
 * Decision 24: on the first day of the month (in Rome), the brokers'
 * invoices B of the month before. The API sends them to SDI (it holds the
 * e-invoicing adapter and the PDF): the back office's «Fatturazione» sends
 * the pending ones. Running it again adds nothing.
 */
export async function issueBrokerInvoicesIfDue(
  db: DbClient,
  cipher: FieldCipher,
  now: Date,
  lineDescription: string,
): Promise<{ period: string; created: number }> {
  // Every day for the month before: a worker stopped on the first catches up
  // (one invoice per broker and month).
  const period = previousMonth(romeCalendarDate(now));
  const { created } = await withContext(db, SYSTEM_CONTEXT, (tx) =>
    issueBrokerInvoices(tx, (plain) => cipher.encrypt(plain), period, lineDescription, now),
  );
  return { period, created: created.length };
}

/**
 * Phase 7: the local copy of the RUI, imported once a day (Rome) from the
 * registry adapter; the entry of agencies and brokers is checked on it.
 */
export async function importRuiIfDue(
  db: DbClient,
  rui: RuiRegistryPort,
  now: Date,
): Promise<{ runDate: string; imported: number; skipped: boolean }> {
  const runDate = romeCalendarDate(now);
  const done = await withContext(db, SYSTEM_CONTEXT, (tx) =>
    tx.ruiImport.findUnique({ where: { runDate } }),
  );
  if (done?.finishedAt) return { runDate, imported: 0, skipped: true };
  const records = await rui.downloadLatest();
  const result = await withContext(
    db,
    SYSTEM_CONTEXT,
    (tx) => importRuiRecords(tx, runDate, records, now),
    { timeoutMs: 120_000 },
  );
  return { runDate, ...result };
}

/** Checks every few minutes; the identifiers and counts only go to the log (rule 8). */
export function startSchedules(
  deps: { db: DbClient; clock: Clock; cipher: FieldCipher; logger: Logger; rui: RuiRegistryPort },
  intervalMs: number,
): () => void {
  if (intervalMs === 0) return () => undefined;
  const { db, clock, cipher, logger, rui } = deps;
  const brokerLine = label(loadNotificationLabels(), "invoice.brokerLine", "it");
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    const now = clock.now();
    Promise.all([
      prepareRemittancesIfDue(db, now).then((result) => {
        if (result.created > 0) logger.info(result, "remittances prepared");
      }),
      issueBrokerInvoicesIfDue(db, cipher, now, brokerLine).then((result) => {
        if (result.created > 0) logger.info(result, "broker invoices issued");
      }),
      importRuiIfDue(db, rui, now).then((result) => {
        if (!result.skipped) logger.info(result, "RUI imported");
      }),
    ])
      .catch((error: unknown) => logger.error({ err: errorForLog(error) }, "scheduled job failed"))
      .finally(() => {
        running = false;
      });
  };
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}
