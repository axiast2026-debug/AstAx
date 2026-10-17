import type { Client } from "@temporalio/client";
import type { OutboxMessage } from "@astax/db";
import type { Logger } from "@astax/shared/logging";
import {
  approvedSignal,
  quoteRequestWorkflow,
  issuanceChangedSignal,
  paymentConfirmedSignal,
  reconfirmationRequestedSignal,
  workflowIdOf,
} from "./workflows/quote-request.js";
import { policyChangedSignal, policyWorkflow } from "./workflows/policy.js";
import { policyWorkflowIdOf } from "@astax/shared/workflows";

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
    if (message.type === "PaymentConfirmed") {
      const requestId = message.payload.aggregateId;
      if (typeof requestId !== "string") throw new Error("PaymentConfirmed without aggregateId");
      await client.workflow.signalWithStart(quoteRequestWorkflow, {
        workflowId: workflowIdOf(requestId),
        taskQueue,
        args: [{ requestId }],
        signal: paymentConfirmedSignal,
        signalArgs: [],
      });
    }
    // EMI-02, EMI-04: the issuance changed; the workflow reads it again.
    if (["PolicyIssued", "IssuanceChanged"].includes(message.type)) {
      const requestId = message.payload.aggregateId;
      if (typeof requestId !== "string") throw new Error(`${message.type} without aggregateId`);
      await client.workflow.signalWithStart(quoteRequestWorkflow, {
        workflowId: workflowIdOf(requestId),
        taskQueue,
        args: [{ requestId }],
        signal: issuanceChangedSignal,
        signalArgs: [],
      });
    }
    // Decision 39: the policy issued starts its workflow; a change makes it read again.
    if (["PolicyIssued", "PolicyChanged"].includes(message.type)) {
      const requestId = message.payload.aggregateId;
      if (typeof requestId !== "string") throw new Error(`${message.type} without aggregateId`);
      await client.workflow.signalWithStart(policyWorkflow, {
        workflowId: policyWorkflowIdOf(requestId),
        taskQueue,
        args: [{ requestId }],
        signal: policyChangedSignal,
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
