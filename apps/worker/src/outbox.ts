import type { Client } from "@temporalio/client";
import type { OutboxMessage } from "@astax/db";
import type { Logger } from "@astax/shared/logging";
import {
  approvedSignal,
  quoteRequestWorkflow,
  reconfirmationRequestedSignal,
  workflowIdOf,
} from "./workflows/quote-request.js";

/**
 * Delivery of the outbox events (ADR 0008). `RequestApproved` starts the
 * request's workflow with the `approved` signal; starting it twice is harmless
 * (same workflow id). `ReconfirmationRequested` (GAR-06) signals it, or starts a
 * new run when the workflow had ended at «Scaduta»; the opening activity checks
 * that the request is still waiting for it. Other events are only logged.
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
    if (message.type === "ReconfirmationRequested") {
      const requestId = message.payload.aggregateId;
      if (typeof requestId !== "string") {
        throw new Error("ReconfirmationRequested without aggregateId");
      }
      await client.workflow.signalWithStart(quoteRequestWorkflow, {
        workflowId: workflowIdOf(requestId),
        taskQueue,
        args: [{ requestId }],
        signal: reconfirmationRequestedSignal,
        signalArgs: [],
      });
    }
    logger.info(
      { outboxId: message.id, type: message.type, attempts: message.attempts },
      "outbox event delivered",
    );
  };
}
