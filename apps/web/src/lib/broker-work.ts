/**
 * The broker's work table (docs/piano-broker.md, G, Dan 2026-10-21): for
 * every state of a request, what the broker has to do now and where. A state
 * without a task says who the request is waiting for.
 */
export type BrokerTask =
  | {
      kind: "ACTION";
      key: "complete" | "integrate" | "sendToCustomer" | "reconfirm";
      step?: string;
    }
  | { kind: "WAIT"; key: "verification" | "auction" | "customer" | "issuance" | "reconfirmation" }
  | { kind: "NONE" };

const TASKS: Record<string, BrokerTask> = {
  DRAFT: { kind: "ACTION", key: "complete", step: "tipo" },
  INTEGRATION_REQUESTED: { kind: "ACTION", key: "integrate" },
  OFFERS_AVAILABLE: { kind: "ACTION", key: "sendToCustomer" },
  EXPIRED: { kind: "ACTION", key: "reconfirm" },
  IN_VERIFICATION: { kind: "WAIT", key: "verification" },
  AUCTION_OPEN: { kind: "WAIT", key: "auction" },
  ACCEPTED: { kind: "WAIT", key: "customer" },
  IN_ISSUANCE: { kind: "WAIT", key: "issuance" },
  IN_RECONFIRMATION: { kind: "WAIT", key: "reconfirmation" },
};

export function brokerTask(status: string): BrokerTask {
  return TASKS[status] ?? { kind: "NONE" };
}

/** The states with something for the broker to do: the «Da fare» filter. */
export const TODO_STATUSES = Object.entries(TASKS)
  .filter(([, task]) => task.kind === "ACTION")
  .map(([status]) => status);

/** Where the task's button leads. */
export function taskHref(id: string, task: BrokerTask): string {
  return task.kind === "ACTION" && task.step ? `/richieste/${id}/${task.step}` : `/richieste/${id}`;
}

/** Days ahead for the «Scadenza» filter: the start of the new policy. */
export const START_WITHIN_DAYS = [7, 15, 30, 60] as const;
