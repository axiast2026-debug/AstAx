import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import type { RuiRegistryPort } from "@astax/adapters/rui-registry";
import {
  KEYCLOAK_CLIENTS,
  KEYCLOAK_LOGIN_EVENTS,
  type KeycloakEvent,
} from "@astax/adapters/identity";
import type { KeyEventsSource } from "@astax/adapters/kms";
import {
  appendAudit,
  archiveAuditLog,
  checkSealedBidDecryptions,
  complaintsToRemind,
  importRuiRecords,
  issueBrokerInvoices,
  prepareRemittances,
  runRetention,
  settingsAt,
  SYSTEM_CONTEXT,
  withContext,
  type DbClient,
} from "@astax/db";
import { addCalendarDays, isRemittanceDay, previousMonth } from "@astax/shared/domain";
import { romeCalendarDate } from "@astax/shared/format";
import { errorForLog, type Logger } from "@astax/shared/logging";
import { label, loadNotificationLabels } from "@astax/shared/notifications";
import { audit, staffRecipients } from "./activities/support.js";
import type { PendingEmail, WorkerNotifier } from "./notifier.js";
import { reportError } from "./telemetry.js";

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

/**
 * Spec 06 «Reclami»: the supervisors are told complaints.reminderDaysBefore
 * days before the answer is due, once per complaint.
 */
export async function remindComplaintsIfDue(
  deps: { db: DbClient; cipher: FieldCipher; notifier: WorkerNotifier; adminUrl: string },
  now: Date,
): Promise<{ reminded: number }> {
  const pending: PendingEmail[] = [];
  const reminded = await withContext(deps.db, SYSTEM_CONTEXT, async (tx) => {
    const due = await complaintsToRemind(tx, now);
    if (due.length === 0) return 0;
    const supervisors = await staffRecipients(tx, deps.cipher, ["BO_SUPERVISOR"]);
    for (const c of due) {
      await deps.notifier.notify(
        tx,
        pending,
        supervisors,
        "complaint.due_soon.bo",
        () => ({
          protocollo: c.protocol,
          giorni: String(c.daysLeft),
          scadenza: { date: c.dueAt.toISOString() },
          link: `${deps.adminUrl}/reclami/${c.id}`,
        }),
        `/reclami/${c.id}`,
        { complaintId: c.id },
      );
      await audit(tx, now, {
        action: "COMPLAINT_REMINDED",
        targetType: "Complaint",
        targetId: c.id,
        after: { daysLeft: c.daysLeft },
      });
    }
    return due.length;
  });
  await deps.notifier.flush(pending);
  return { reminded };
}

const LOGIN_EVENTS_CURSOR = "keycloak.loginEvents";
const OUR_CLIENTS: readonly string[] = Object.values(KEYCLOAK_CLIENTS);

/**
 * Phase 8: the login events of Keycloak go into the audit log (CLAUDE.md rule 4).
 * Failed logins of a known user are written (with the error code and the IP);
 * a login is written only when it did not come from our apps, which record their
 * own logins with the browser's address (POST /me/logins). Events of addresses
 * without an account are counted in the log only, so they cannot flood the chain.
 */
export async function importLoginEventsIfDue(
  db: DbClient,
  identity: { listEvents(types: string[], sinceMs: number): Promise<KeycloakEvent[]> },
  now: Date,
): Promise<{ imported: number; anonymous: number }> {
  const cursor = await withContext(db, SYSTEM_CONTEXT, (tx) =>
    tx.jobCursor.findUnique({ where: { key: LOGIN_EVENTS_CURSOR } }),
  );
  // The first run starts a day back.
  const since = cursor ? Number(cursor.value) : now.getTime() - 86_400_000;
  const events = await identity.listEvents([...KEYCLOAK_LOGIN_EVENTS.types], since);
  if (events.length === 0) return { imported: 0, anonymous: 0 };
  return withContext(db, SYSTEM_CONTEXT, async (tx) => {
    const ids = [...new Set(events.map((e) => e.userId).filter((id): id is string => !!id))];
    const users = await tx.user.findMany({
      where: { keycloakId: { in: ids } },
      select: { id: true, keycloakId: true },
    });
    const userOf = new Map(users.map((u) => [u.keycloakId, u.id]));
    let imported = 0;
    let anonymous = 0;
    for (const e of events) {
      const userId = e.userId ? userOf.get(e.userId) : undefined;
      const ours = e.clientId !== undefined && OUR_CLIENTS.includes(e.clientId);
      if (e.type === "LOGIN" && ours) continue;
      if (!userId) {
        anonymous += 1;
        continue;
      }
      await appendAudit(tx, {
        actorUserId: userId,
        actorMembershipId: null,
        actorOrganizationId: null,
        ip: e.ipAddress?.slice(0, 64) ?? null,
        userAgent: null,
        at: new Date(e.time),
        action: e.type === "LOGIN" ? "LOGIN" : "LOGIN_FAILED",
        targetType: "User",
        targetId: userId,
        before: null,
        after: {
          source: "keycloak",
          clientId: e.clientId ?? null,
          ...(e.error ? { error: e.error.slice(0, 100) } : {}),
        },
        reason: null,
      });
      imported += 1;
    }
    const last = Math.max(...events.map((e) => e.time));
    await tx.jobCursor.upsert({
      where: { key: LOGIN_EVENTS_CURSOR },
      create: { key: LOGIN_EVENTS_CURSOR, value: String(last), updatedAt: now },
      update: { value: String(last), updatedAt: now },
    });
    return { imported, anonymous };
  });
}

/**
 * Phase 8, BC-03 (docs/busta-chiusa.md): once a day the decryptions with the
 * sealed bids' key since the last check are compared with the auctions'
 * closing times; each source (the application's KmsEvent, CloudTrail in AWS)
 * has its own cursor. An anomaly goes to the audit log, to the
 * administrators and to the log as an alarm.
 */
export async function checkKeysIfDue(
  deps: { db: DbClient; cipher: FieldCipher; notifier: WorkerNotifier; adminUrl: string },
  sources: readonly { name: string; source: KeyEventsSource; principals: readonly string[] }[],
  now: Date,
): Promise<{ checked: number; anomalies: number }> {
  let checked = 0;
  let anomalies = 0;
  for (const { name, source, principals } of sources) {
    const key = `kms.check.${name}`;
    const cursor = await withContext(deps.db, SYSTEM_CONTEXT, (tx) =>
      tx.jobCursor.findUnique({ where: { key } }),
    );
    const from = cursor ? new Date(cursor.value) : new Date(now.getTime() - 86_400_000);
    const result = await checkSealedBidDecryptions(deps.db, source, { from, to: now }, principals);
    checked += result.checked;
    anomalies += result.anomalies.length;
    const pending: PendingEmail[] = [];
    await withContext(deps.db, SYSTEM_CONTEXT, async (tx) => {
      for (const a of result.anomalies) {
        await audit(tx, now, {
          action: "KMS_ANOMALY",
          targetType: "Auction",
          targetId: a.auctionId ?? "-",
          after: {
            kind: a.kind,
            at: a.at.toISOString(),
            principal: a.principal.slice(0, 200),
            source: name,
          },
        });
      }
      if (result.anomalies.length > 0) {
        await deps.notifier.notify(
          tx,
          pending,
          await staffRecipients(tx, deps.cipher, ["ADMIN"]),
          "security.kms_anomaly.admin",
          () => ({ numero: String(result.anomalies.length), link: `${deps.adminUrl}/registro` }),
          "/registro",
          { source: name },
        );
      }
      await tx.jobCursor.upsert({
        where: { key },
        create: { key, value: now.toISOString(), updatedAt: now },
        update: { value: now.toISOString(), updatedAt: now },
      });
    });
    await deps.notifier.flush(pending);
  }
  return { checked, anomalies };
}

/** Checks every few minutes; the identifiers and counts only go to the log (rule 8). */
export function startSchedules(
  deps: {
    db: DbClient;
    clock: Clock;
    cipher: FieldCipher;
    logger: Logger;
    rui: RuiRegistryPort;
    notifier: WorkerNotifier;
    adminUrl: string;
    /** LEG-06: the files of the documents to delete. */
    deleteObject: (key: string) => Promise<void>;
    /** Phase 8: Keycloak's login events; absent when the worker has no admin access. */
    identity?: { listEvents(types: string[], sinceMs: number): Promise<KeycloakEvent[]> };
    /** Phase 8, BC-03: where the decryptions of the sealed bids' key are read. */
    keySources?: readonly {
      name: string;
      source: KeyEventsSource;
      principals: readonly string[];
    }[];
    /** SIC-04: writes a copy of the audit log into the archive with Object Lock. */
    archiveAudit?: (key: string, body: Uint8Array) => Promise<void>;
  },
  intervalMs: number,
): () => void {
  if (intervalMs === 0) return () => undefined;
  const { db, clock, cipher, logger, rui, notifier, adminUrl, deleteObject, identity } = deps;
  let retentionDay = "";
  let keysDay = "";
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
      remindComplaintsIfDue({ db, cipher, notifier, adminUrl }, now).then((result) => {
        if (result.reminded > 0) logger.info(result, "complaints reminded");
      }),
      (identity ? importLoginEventsIfDue(db, identity, now) : Promise.resolve(null)).then(
        (result) => {
          if (result && result.imported + result.anonymous > 0) {
            logger.info(result, "login events imported");
          }
        },
      ),
      // SIC-04: the new audit entries copied into the archive nobody can change.
      (deps.archiveAudit
        ? archiveAuditLog(db, deps.archiveAudit, now)
        : Promise.resolve(null)
      ).then((result) => {
        if (result && result.entries > 0) logger.info(result, "audit log archived");
      }),
      // BC-03: once a day the decryptions of the sealed bids' key.
      (keysDay === romeCalendarDate(now) || !deps.keySources
        ? Promise.resolve(null)
        : checkKeysIfDue({ db, cipher, notifier, adminUrl }, deps.keySources, now)
      ).then((result) => {
        if (!result) return;
        keysDay = romeCalendarDate(now);
        if (result.anomalies > 0) {
          // The alarm (docs/sorveglianza.md): a metric filter on this line.
          logger.error({ alarm: "KMS_ANOMALY", ...result }, "sealed bids' key used out of rule");
        } else {
          logger.info(result, "sealed bids' key check passed");
        }
      }),
      // LEG-06, proposal G: once a day the requests not concluded past retention.
      (retentionDay === romeCalendarDate(now)
        ? Promise.resolve(null)
        : runRetention(db, deleteObject, now)
      ).then((result) => {
        if (!result) return;
        retentionDay = romeCalendarDate(now);
        if (result.requests > 0) logger.info(result, "retention purged");
      }),
    ])
      .catch((error: unknown) => {
        logger.error({ err: errorForLog(error) }, "scheduled job failed");
        reportError(error);
      })
      .finally(() => {
        running = false;
      });
  };
  // At once, then every interval: what fell due while the worker was stopped is not left waiting.
  tick();
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}
