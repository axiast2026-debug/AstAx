import { SIGNALS, workflowIdOf } from "@astax/shared/workflows";
import { Client, Connection } from "@temporalio/client";

/**
 * Signals from the API to the request's workflow (ADR 0008): the back office
 * actions on an open auction and the development tool. The API checks the
 * rules first (409 when refused); the worker applies the change.
 */
/** What the workflow receives: identifiers only; the reason stays in the audit log. */
export interface BackOfficeSignal {
  auctionId: string;
  actionId: string;
  byUserId: string;
}

export interface WorkflowSignals {
  extend(requestId: string, input: BackOfficeSignal & { workingHours: number }): Promise<void>;
  invite(requestId: string, input: BackOfficeSignal & { organizationIds: string[] }): Promise<void>;
  cancel(requestId: string, input: BackOfficeSignal): Promise<void>;
  fireNextTimer(requestId: string): Promise<void>;
}

export class TemporalWorkflowSignals implements WorkflowSignals {
  #client: Promise<Client> | null = null;

  constructor(
    private readonly address: string,
    private readonly namespace: string,
  ) {}

  /** Connects at the first signal: the API starts also when Temporal is down. */
  private client(): Promise<Client> {
    this.#client ??= Connection.connect({ address: this.address }).then(
      (connection) => new Client({ connection, namespace: this.namespace }),
    );
    this.#client.catch(() => {
      this.#client = null;
    });
    return this.#client;
  }

  private async signal(requestId: string, name: string, ...args: unknown[]): Promise<void> {
    const client = await this.client();
    await client.workflow.getHandle(workflowIdOf(requestId)).signal(name, ...args);
  }

  extend(requestId: string, input: BackOfficeSignal & { workingHours: number }) {
    return this.signal(requestId, SIGNALS.auctionExtended, input);
  }

  invite(requestId: string, input: BackOfficeSignal & { organizationIds: string[] }) {
    return this.signal(requestId, SIGNALS.invitationsAdded, input);
  }

  cancel(requestId: string, input: BackOfficeSignal) {
    return this.signal(requestId, SIGNALS.auctionCancelled, input);
  }

  fireNextTimer(requestId: string) {
    return this.signal(requestId, SIGNALS.fireNextTimer);
  }
}

/** Tests: records the signals instead of sending them. */
export class RecordingWorkflowSignals implements WorkflowSignals {
  readonly sent: { requestId: string; name: string; input: unknown }[] = [];

  async extend(requestId: string, input: unknown) {
    this.sent.push({ requestId, name: SIGNALS.auctionExtended, input });
  }

  async invite(requestId: string, input: unknown) {
    this.sent.push({ requestId, name: SIGNALS.invitationsAdded, input });
  }

  async cancel(requestId: string, input: unknown) {
    this.sent.push({ requestId, name: SIGNALS.auctionCancelled, input });
  }

  async fireNextTimer(requestId: string) {
    this.sent.push({ requestId, name: SIGNALS.fireNextTimer, input: null });
  }
}
