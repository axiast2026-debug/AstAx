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
 * transaction, so that a refused or failed use is recorded too.
 */
export function kmsEventRecorder(
  db: DbClient,
  processName: "api" | "worker",
  now: () => Date,
): (op: KmsEventInput) => Promise<void> {
  return async (op) => {
    await withContext(db, SYSTEM_CONTEXT, (tx) =>
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
  };
}
