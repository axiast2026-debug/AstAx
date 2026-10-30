import { describe, expect, it } from "vitest";
import { brokerTask, taskHref, TODO_STATUSES } from "./broker-work";

describe("broker work table (docs/piano-broker.md, G)", () => {
  it("a draft is completed from its first screen", () => {
    const task = brokerTask("DRAFT");
    expect(task).toEqual({ kind: "ACTION", key: "complete", step: "tipo" });
    expect(taskHref("r1", task)).toBe("/richieste/r1/tipo");
  });

  it("ADR 0027 offers ready: the intermediary chooses and buys from the request", () => {
    const task = brokerTask("OFFERS_AVAILABLE");
    expect(task.kind).toBe("ACTION");
    expect(taskHref("r1", task)).toBe("/richieste/r1");
  });

  it("while others work the table says who it waits for; closed requests have no task", () => {
    expect(brokerTask("IN_VERIFICATION")).toEqual({ kind: "WAIT", key: "verification" });
    expect(brokerTask("ISSUED")).toEqual({ kind: "NONE" });
    expect(brokerTask("CANCELLED")).toEqual({ kind: "NONE" });
  });

  it("ADR 0027 bought: the purchase is completed until the customer signs", () => {
    expect(brokerTask("ACCEPTED")).toEqual({ kind: "ACTION", key: "completePurchase" });
    expect(taskHref("r1", brokerTask("ACCEPTED"))).toBe("/richieste/r1");
  });

  it("«Da fare» lists only the states with an action", () => {
    expect(TODO_STATUSES).toEqual([
      "DRAFT",
      "INTEGRATION_REQUESTED",
      "OFFERS_AVAILABLE",
      "ACCEPTED",
      "EXPIRED",
    ]);
  });
});
