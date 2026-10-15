import type { DbClient, DbTransaction } from "./client.js";
import { SYSTEM_CONTEXT, withContext } from "./context.js";

/** Payloads carry identifiers only: never personal data, prices or documents (SIC-06). */
export type IdentifierPayload = Record<string, string | number | boolean | null>;

export interface DomainEventInput {
  aggregateType: string;
  aggregateId: string;
  type: string;
  at: Date;
  actorUserId: string | null;
  /** Shown in the history of the aggregate; identifiers and codes only. */
  data?: IdentifierPayload;
}

/**
 * Writes the domain event (history) and the outbox event (delivery to
 * notifications and workflows) in the caller's transaction: either the state
 * change and both events are saved, or nothing is.
 */
export async function recordDomainEvent(tx: DbTransaction, event: DomainEventInput): Promise<void> {
  const data = event.data ?? {};
  // createMany: no RETURNING, so callers who may not read events can still write them.
  await tx.domainEvent.createMany({
    data: [
      {
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        type: event.type,
        at: event.at,
        actorUserId: event.actorUserId,
        data,
      },
    ],
  });
  await tx.outboxEvent.createMany({
    data: [
      {
        type: event.type,
        payload: { aggregateType: event.aggregateType, aggregateId: event.aggregateId, ...data },
        nextAttemptAt: event.at,
      },
    ],
  });
}

export interface OutboxMessage {
  id: string;
  type: string;
  payload: IdentifierPayload;
  attempts: number;
}

export type OutboxHandler = (message: OutboxMessage) => Promise<void>;

export interface DispatchOptions {
  now: Date;
  batchSize?: number;
  /** After this many failed attempts the event is FAILED and needs a person. */
  maxAttempts?: number;
}

export interface DispatchResult {
  delivered: number;
  retried: number;
  failed: number;
}

/** Wait before the next attempt: 1 minute, then doubling, at most 1 hour. */
export function retryDelayMs(attempts: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 3_600_000);
}

/**
 * Delivers due outbox events once each. Rows are locked with SKIP LOCKED, so
 * several dispatchers never deliver the same event at the same time. A failure
 * schedules a new attempt; the error code (not the message) is kept.
 */
export async function dispatchOutbox(
  db: DbClient,
  handler: OutboxHandler,
  options: DispatchOptions,
): Promise<DispatchResult> {
  const batchSize = options.batchSize ?? 50;
  const maxAttempts = options.maxAttempts ?? 10;
  const result: DispatchResult = { delivered: 0, retried: 0, failed: 0 };

  await withContext(
    db,
    SYSTEM_CONTEXT,
    async (tx) => {
      const due = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "OutboxEvent"
        WHERE "status" = 'PENDING' AND "nextAttemptAt" <= ${options.now}
        ORDER BY "nextAttemptAt", "createdAt"
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED`;
      for (const { id } of due) {
        const event = await tx.outboxEvent.findUniqueOrThrow({ where: { id } });
        const attempts = event.attempts + 1;
        try {
          await handler({
            id,
            type: event.type,
            payload: event.payload as IdentifierPayload,
            attempts,
          });
          await tx.outboxEvent.update({
            where: { id },
            data: { status: "DELIVERED", attempts, deliveredAt: options.now, lastErrorCode: null },
          });
          result.delivered += 1;
        } catch (error) {
          const code = error instanceof Error ? error.name : "UnknownError";
          const failed = attempts >= maxAttempts;
          await tx.outboxEvent.update({
            where: { id },
            data: {
              status: failed ? "FAILED" : "PENDING",
              attempts,
              lastErrorCode: code.slice(0, 100),
              nextAttemptAt: new Date(options.now.getTime() + retryDelayMs(attempts)),
            },
          });
          if (failed) result.failed += 1;
          else result.retried += 1;
        }
      }
    },
    { timeoutMs: 60_000 },
  );
  return result;
}
