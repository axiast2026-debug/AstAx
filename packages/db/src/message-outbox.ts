import type { FieldCipher } from "@astax/adapters/crypto";
import type { EmailMessage } from "@astax/adapters/email";
import type { SmsMessage } from "@astax/adapters/sms";
import type { PushMessage, PushSubscriptionData } from "@astax/adapters/web-push";
import type { DbClient, DbTransaction } from "./client.js";
import { asSystem, SYSTEM_CONTEXT, withContext } from "./context.js";
import { retryDelayMs } from "./events.js";

/** What leaves AstAx towards a person: an email, an SMS or a push. */
export type QueuedMessage =
  | { channel: "EMAIL"; email: EmailMessage }
  | { channel: "SMS"; sms: SmsMessage }
  | { channel: "PUSH"; subscription: PushSubscriptionData; push: PushMessage };

export interface MessageSenders {
  email: { send(message: EmailMessage): Promise<void> };
  sms: { send(message: SmsMessage): Promise<void> };
  push?: { send(subscription: PushSubscriptionData, message: PushMessage): Promise<void> };
}

/**
 * Phase 8: written in the transaction of the change that causes the message,
 * so a commit always leaves it to send. The content is encrypted (rule 8);
 * `ids` holds identifiers only, for the logs.
 */
export async function queueMessage(
  tx: DbTransaction,
  cipher: FieldCipher,
  message: QueuedMessage,
  meta: { eventKey: string; ids: Record<string, string> },
  now: Date,
): Promise<string> {
  const row = await asSystem(tx, () =>
    tx.messageOutbox.create({
      data: {
        channel: message.channel,
        eventKey: meta.eventKey,
        ids: meta.ids,
        contentEnc: cipher.encrypt(JSON.stringify(message)),
        nextAttemptAt: now,
        createdAt: now,
      },
      select: { id: true },
    }),
  );
  return row.id;
}

export async function sendQueued(senders: MessageSenders, message: QueuedMessage): Promise<void> {
  if (message.channel === "EMAIL") await senders.email.send(message.email);
  else if (message.channel === "SMS") await senders.sms.send(message.sms);
  else await senders.push?.send(message.subscription, message.push);
}

/** Sent: the content is emptied, only identifiers and dates stay. */
export async function markMessageSent(db: DbClient, id: string, now: Date): Promise<void> {
  await withContext(db, SYSTEM_CONTEXT, (tx) =>
    tx.messageOutbox.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "SENT", sentAt: now, contentEnc: "" },
    }),
  );
}

export interface MessageDispatchResult {
  sent: number;
  retried: number;
  failed: number;
}

/**
 * The worker's safety net: messages still waiting `graceMs` after they were
 * queued (the sender after the commit did not confirm them) are sent again,
 * with growing waits; after `maxAttempts` they are given up and emptied.
 * SKIP LOCKED: several workers never send the same message at the same time.
 * A message may arrive twice if a process stops between sending and marking.
 */
export async function dispatchMessages(
  db: DbClient,
  cipher: FieldCipher,
  senders: MessageSenders,
  options: { now: Date; graceMs?: number; batchSize?: number; maxAttempts?: number },
): Promise<MessageDispatchResult> {
  const graceMs = options.graceMs ?? 60_000;
  const maxAttempts = options.maxAttempts ?? 8;
  const result: MessageDispatchResult = { sent: 0, retried: 0, failed: 0 };
  const before = new Date(options.now.getTime() - graceMs);
  await withContext(
    db,
    SYSTEM_CONTEXT,
    async (tx) => {
      const due = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "MessageOutbox"
        WHERE "status" = 'PENDING' AND "nextAttemptAt" <= ${options.now} AND "createdAt" <= ${before}
        ORDER BY "nextAttemptAt", "createdAt"
        LIMIT ${options.batchSize ?? 50}
        FOR UPDATE SKIP LOCKED`;
      for (const { id } of due) {
        const row = await tx.messageOutbox.findUniqueOrThrow({ where: { id } });
        const attempts = row.attempts + 1;
        try {
          await sendQueued(senders, JSON.parse(cipher.decrypt(row.contentEnc)) as QueuedMessage);
          await tx.messageOutbox.update({
            where: { id },
            data: { status: "SENT", sentAt: options.now, attempts, contentEnc: "" },
          });
          result.sent += 1;
        } catch (error) {
          const failed = attempts >= maxAttempts;
          await tx.messageOutbox.update({
            where: { id },
            data: {
              status: failed ? "FAILED" : "PENDING",
              attempts,
              lastErrorCode: (error instanceof Error ? error.name : "UnknownError").slice(0, 100),
              nextAttemptAt: new Date(options.now.getTime() + retryDelayMs(attempts)),
              ...(failed ? { contentEnc: "" } : {}),
            },
          });
          if (failed) result.failed += 1;
          else result.retried += 1;
        }
      }
    },
    { timeoutMs: 120_000 },
  );
  return result;
}
