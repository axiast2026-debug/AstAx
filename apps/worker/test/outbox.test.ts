import type { Client } from "@temporalio/client";
import { createLogger } from "@astax/shared/logging";
import { describe, expect, it } from "vitest";
import { outboxHandler } from "../src/outbox.js";

describe("outbox delivery (ADR 0008)", () => {
  it("ASTA-01 RequestApproved starts the request's workflow with the approved signal", async () => {
    const calls: unknown[] = [];
    const client = {
      workflow: {
        signalWithStart: async (_workflow: unknown, options: unknown) => {
          calls.push(options);
        },
      },
    } as unknown as Client;
    const deliver = outboxHandler(
      client,
      "astax-requests",
      createLogger({ name: "t", level: "silent" }),
    );
    await deliver({
      id: "o-1",
      type: "RequestApproved",
      attempts: 1,
      payload: { aggregateType: "QuoteRequest", aggregateId: "r-1", round: 1 },
    });
    await deliver({
      id: "o-2",
      type: "membership.updated",
      attempts: 1,
      payload: { aggregateId: "m-1" },
    });
    expect(calls).toEqual([
      {
        workflowId: "quote-request-r-1",
        taskQueue: "astax-requests",
        args: [{ requestId: "r-1" }],
        signal: expect.objectContaining({ name: "approved" }),
        signalArgs: [],
      },
    ]);
  });

  it("a RequestApproved without the request id fails, so the outbox tries again", async () => {
    const deliver = outboxHandler({} as Client, "q", createLogger({ name: "t", level: "silent" }));
    await expect(
      deliver({ id: "o", type: "RequestApproved", attempts: 1, payload: {} }),
    ).rejects.toThrow();
  });
});
