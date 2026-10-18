import type { DbClient, DbTransaction } from "./client.js";
import { SYSTEM_CONTEXT, withContext } from "./context.js";
import { settingsAt } from "./auction-data.js";
import { appendAudit } from "./audit.js";

/** Requests that never became a policy: they are deleted after retention (LEG-06). */
export const INCOMPLETE_STATUSES = [
  "DRAFT",
  "EXCLUDED",
  "EXPIRED",
  "CANCELLED",
  "DESERTED",
] as const;

/** Never more than this in one run: the next run goes on (a technical cap). */
const BATCH = 200;

function monthsBefore(now: Date, months: number): Date {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

/**
 * Proposal G of phase 7: the requests not concluded, untouched for
 * retention.incompleteRequestsMonths, and the stored files of their
 * documents. The files are deleted first by the caller (it holds the
 * storage); then `purgeRequests` empties the rows.
 */
export async function retentionCandidates(tx: DbTransaction, now: Date) {
  const { "retention.incompleteRequestsMonths": months } = await settingsAt(
    tx,
    ["retention.incompleteRequestsMonths"],
    now,
  );
  const limit = monthsBefore(now, months);
  const found = await tx.quoteRequest.findMany({
    where: {
      status: { in: [...INCOMPLETE_STATUSES] },
      purgedAt: null,
      updatedAt: { lt: limit },
    },
    select: { id: true, code: true, status: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
    take: BATCH,
  });
  // A policy is a contract: never deleted with the incomplete requests.
  const withPolicy = new Set(
    (
      await tx.policy.findMany({
        where: { quoteRequestId: { in: found.map((r) => r.id) } },
        select: { quoteRequestId: true },
      })
    ).map((p) => p.quoteRequestId),
  );
  const requests = found.filter((r) => !withPolicy.has(r.id));
  const documents = await tx.document.findMany({
    where: { quoteRequestId: { in: requests.map((r) => r.id) }, deletedAt: null },
    select: { id: true, storageKey: true },
  });
  return { limit, months, requests, storageKeys: documents.map((d) => d.storageKey) };
}

/**
 * Empties the requests (the system's transaction): documents marked deleted
 * and without the read fields, every quoteData version and the draft
 * emptied, the plate removed; the broker's customer, when nothing else of
 * theirs is left, without name, codes and contacts. Code, status, dates,
 * offers and the audit log stay. Each request is recorded in the log.
 */
export async function purgeRequests(
  tx: DbTransaction,
  requests: readonly { id: string; code: string; status: string }[],
  now: Date,
): Promise<{ requests: number; documents: number; customers: number }> {
  if (requests.length === 0) return { requests: 0, documents: 0, customers: 0 };
  const ids = requests.map((r) => r.id);
  const documents = await tx.document.updateMany({
    where: { quoteRequestId: { in: ids }, deletedAt: null },
    data: { deletedAt: now, extractionEnc: null, extractedAt: null },
  });
  await tx.quoteDataVersion.updateMany({
    where: { quoteRequestId: { in: ids } },
    data: { dataEnc: "" },
  });
  const rows = await tx.quoteRequest.findMany({
    where: { id: { in: ids } },
    select: { id: true, customerId: true },
  });
  await tx.quoteRequest.updateMany({
    where: { id: { in: ids } },
    data: { draftEnc: null, plate: null, purgedAt: now },
  });

  // A broker's customer with nothing else alive: the personal data go too.
  // A private user's own customer stays with the account.
  let customers = 0;
  for (const customerId of [
    ...new Set(rows.flatMap((r) => (r.customerId ? [r.customerId] : []))),
  ]) {
    const customer = await tx.customer.findUnique({ where: { id: customerId } });
    if (!customer?.ownerOrganizationId) continue;
    const alive = await tx.quoteRequest.count({ where: { customerId, purgedAt: null } });
    if (alive > 0) continue;
    await tx.vehicle.deleteMany({ where: { customerId } });
    await tx.customer.update({
      where: { id: customerId },
      data: { emailEnc: null, emailHash: null, phoneEnc: null, phoneHash: null },
    });
    await tx.person.update({
      where: { id: customer.personId },
      data: {
        surname: null,
        givenName: null,
        companyName: null,
        fiscalCodeEnc: null,
        fiscalCodeHash: null,
        vatNumberEnc: null,
        vatNumberHash: null,
        birthDate: null,
        birthPlace: null,
        sex: null,
        profession: null,
        maritalStatus: null,
        children: null,
      },
    });
    await tx.$executeRaw`UPDATE "Person" SET "residence" = NULL WHERE "id" = ${customer.personId}::uuid`;
    customers += 1;
  }

  for (const r of requests) {
    await appendAudit(tx, {
      actorUserId: null,
      actorMembershipId: null,
      actorOrganizationId: null,
      ip: null,
      userAgent: null,
      at: now,
      action: "RETENTION_PURGED",
      targetType: "QuoteRequest",
      targetId: r.id,
      before: { code: r.code, status: r.status },
      after: { purgedAt: now.toISOString() },
      reason: "LEG-06",
    });
  }
  return { requests: requests.length, documents: documents.count, customers };
}

/**
 * One run, for the worker's daily timer and the administrator's button: the
 * files first (a file not found is already gone), then the rows, in the
 * system's context. A run that stops halfway is completed by the next one.
 */
export async function runRetention(
  db: DbClient,
  deleteObject: (key: string) => Promise<void>,
  now: Date,
): Promise<{ requests: number; documents: number; customers: number }> {
  const found = await withContext(db, SYSTEM_CONTEXT, (tx) => retentionCandidates(tx, now));
  if (found.requests.length === 0) return { requests: 0, documents: 0, customers: 0 };
  for (const key of found.storageKeys) await deleteObject(key);
  return withContext(db, SYSTEM_CONTEXT, (tx) => purgeRequests(tx, found.requests, now), {
    timeoutMs: 120_000,
  });
}
