import type { Client } from "@temporalio/client";
import type { OutboxMessage } from "@astax/db";
import type { Logger } from "@astax/shared/logging";
import { approvedSignal, quoteRequestWorkflow, workflowIdOf } from "./workflows/quote-request.js";

/**
 * Delivery of the outbox events (ADR 0008). `RequestApproved` starts the
 * request's workflow with the `approved` signal; starting it twice is harmless
 * (same workflow id). Other events are only logged, with identifiers.
 */
export function outboxHandler(client: Client, taskQueue: string, logger: Logger) {
  return async (message: OutboxMessage): Promise<void> => {
    if (message.type === "RequestApproved") {
      const requestId = message.payload.aggregateId;
      if (typeof requestId !== "string") throw new Error("RequestApproved without aggregateId");
      await client.workflow.signalWithStart(quoteRequestWorkflow, {
        workflowId: workflowIdOf(requestId),
        taskQueue,
        args: [{ requestId }],
        signal: approvedSignal,
        signalArgs: [],
      });
    }
    logger.info(
      { outboxId: message.id, type: message.type, attempts: message.attempts },
      "outbox event delivered",
    );
  };
}
