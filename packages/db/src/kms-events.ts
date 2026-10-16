import type { DbClient } from "./client.js";
import { SYSTEM_CONTEXT, withContext } from "./context.js";

export interface KmsEventInput {
  keyId: string;
  operation: "ENCRYPT" | "DECRYPT";
  context: Readonly<Record<string, string>>;
  ok: boolean;
}

/**
 * ADR 0005: writes each use of a KMS key to `KmsEvent`, in its own system
 * transaction, so that a refused or failed use is recorded too. The worker
 * waits for the row (the proof of BC-03); the API does not.
 */
export function kmsEventRecorder(
  db: DbClient,
  processName: "api" | "worker",
  now: () => Date,
  options: { wait: boolean; onError?: (error: unknown) => void } = { wait: true },
): (op: KmsEventInput) => Promise<void> {
  return async (op) => {
    const write = withContext(db, SYSTEM_CONTEXT, (tx) =>
      tx.kmsEvent.create({
        data: {
          at: now(),
          keyId: op.keyId,
          operation: op.operation,
          context: op.context,
          ok: op.ok,
          process: processName,
        },
      }),
    );
    // The API does not wait: a submission holding a connection and the lock of
    // the auction must not wait for a second connection of the pool.
    if (options.wait) await write;
    else void write.catch((error: unknown) => options.onError?.(error));
  };
}
