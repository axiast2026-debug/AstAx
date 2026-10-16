import { fileURLToPath } from "node:url";
import { Context } from "@temporalio/activity";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { DefaultLogger, makeTelemetryFilterString, Runtime, Worker } from "@temporalio/worker";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  AuctionActivities,
  CloseResult,
  GuaranteeSchedule,
  OpenResult,
  RoundTimes,
} from "../src/activities/types.js";
import {
  approvedSignal,
  auctionCancelledSignal,
  auctionExtendedSignal,
  fireNextTimerSignal,
  invitationsAddedSignal,
  quoteRequestWorkflow,
  workflowIdOf,
} from "../src/workflows/quote-request.js";

// QuoteRequestWorkflow with Temporal's time-skipping test server and fake
// activities: the times and the order of the steps (ADR 0008). The activities
// themselves are tested against PostgreSQL in test/int.
const HOUR = 3_600_000;
const workflowsPath = fileURLToPath(new URL("../src/workflows/index.ts", import.meta.url));
let env: TestWorkflowEnvironment;
let counter = 0;

beforeAll(async () => {
  // Errors only: the SDK and the bundler are verbose at INFO.
  Runtime.install({
    logger: new DefaultLogger("ERROR"),
    telemetryOptions: { logging: { filter: makeTelemetryFilterString({ core: "ERROR" }) } },
  });
  env = await TestWorkflowEnvironment.createTimeSkipping();
});

afterAll(async () => {
  await env?.teardown();
});

interface Script {
  /** Valid offers at each closing, in order. */
  closings: number[];
  /** False: no agency can be invited for the main round. */
  agencies?: boolean;
  reopen?: { enabled: boolean; maxAttempts: number };
  guarantees?: GuaranteeSchedule[];
  /** Top-up and reminder at the closing time: the closing is the first timer. */
  closeFirst?: boolean;
}

/** Fake activities that record the calls, with the time of the workflow environment. */
function fakes(script: Script) {
  const calls: { name: string; at: number; input: unknown }[] = [];
  const closings = [...script.closings];
  const guarantees = [...(script.guarantees ?? [])];
  let close = 0;
  let round = 0;
  // The time of the test server (skipped forward), not of this process.
  const now = () => Context.current().info.scheduledTimestampMs;
  const record = (name: string, input: unknown) => calls.push({ name, at: now(), input });
  const times = (auctionId: string, base: number): RoundTimes => ({
    auctionId,
    status: "OPEN",
    topUpAt: new Date(script.closeFirst ? close : base + 1 * HOUR).toISOString(),
    reminderAt: new Date(script.closeFirst ? close : base + 1 * HOUR).toISOString(),
    scheduledCloseAt: new Date(close).toISOString(),
  });
  const activities: AuctionActivities = {
    async openRound(input): Promise<OpenResult> {
      record("openRound", input);
      if (input.kind === "MAIN" && script.agencies === false) {
        return { opened: false, reason: "NO_AGENCIES" };
      }
      round += 1;
      const base = now();
      close = base + 2 * HOUR;
      return { opened: true, invited: 3, ...times(`auction-${round}`, base) };
    },
    async roundTimes(input) {
      record("roundTimes", input);
      return times(input.auctionId, close - 2 * HOUR);
    },
    async reopenPolicy(input) {
      record("reopenPolicy", input);
      return script.reopen ?? { enabled: true, maxAttempts: 1 };
    },
    async topUp(input) {
      record("topUp", input);
      return { invited: 0 };
    },
    async remindAgencies(input) {
      record("remindAgencies", input);
      return { reminded: 3 };
    },
    async closeRound(input): Promise<CloseResult> {
      record("closeRound", input);
      return { validOffers: closings.shift() ?? 0, excludedOffers: 0, cancelled: false };
    },
    async markDeserted(input) {
      record("markDeserted", input);
    },
    async extendRound(input) {
      record("extendRound", input);
      close += input.workingHours * HOUR;
    },
    async addInvitations(input) {
      record("addInvitations", input);
      return { invited: input.organizationIds.length };
    },
    async cancelRound(input) {
      record("cancelRound", input);
    },
    async guaranteeSchedule(input) {
      record("guaranteeSchedule", input);
      return (
        guarantees.shift() ?? {
          active: false,
          reminderAt: null,
          reminderOfferId: null,
          bestExpiresAt: null,
          allExpiredAt: null,
        }
      );
    },
    async sendGuaranteeReminder(input) {
      record("sendGuaranteeReminder", input);
    },
    async expireRequest(input) {
      record("expireRequest", input);
      return { expired: true };
    },
  };
  return { activities, calls, names: () => calls.map((c) => c.name) };
}

async function run(
  script: Script,
  drive?: (
    handle: { signal: (...a: never[]) => Promise<void> } & Awaited<ReturnType<typeof start>>,
  ) => Promise<void>,
) {
  const fake = fakes(script);
  const taskQueue = `test-${(counter += 1)}`;
  const worker = await Worker.create({
    connection: env.nativeConnection,
    taskQueue,
    workflowsPath,
    activities: fake.activities,
  });
  const requestId = `00000000-0000-7000-8000-${String(counter).padStart(12, "0")}`;
  const result = await worker.runUntil(async () => {
    const handle = await start(taskQueue, requestId);
    await handle.signal(approvedSignal);
    if (drive) await drive(handle as never);
    return handle.result();
  });
  return { ...fake, result, requestId, taskQueue };
}

function start(taskQueue: string, requestId: string) {
  return env.client.workflow.start(quoteRequestWorkflow, {
    workflowId: workflowIdOf(requestId),
    taskQueue,
    args: [{ requestId }],
  });
}

describe("QuoteRequestWorkflow (ADR 0008)", () => {
  it("ASTA-01 the approval opens the auction; top-up, reminder and closing follow at their instants", async () => {
    const r = await run({ closings: [2] });
    expect(r.names().slice(0, 4)).toEqual(["openRound", "topUp", "remindAgencies", "closeRound"]);
    const opened = r.calls[0]?.at ?? 0;
    const closed = r.calls.find((c) => c.name === "closeRound")?.at ?? 0;
    expect(closed - opened).toBeGreaterThanOrEqual(2 * HOUR - 1000);
    expect(r.result).toBe("OFFERS_CLOSED");
  });

  it("BC-07 SIC-06 the history of the workflow holds identifiers and instants only", async () => {
    const r = await run({ closings: [1] });
    const history = await env.client.workflow.getHandle(workflowIdOf(r.requestId)).fetchHistory();
    const text = JSON.stringify(history);
    for (const forbidden of ["50500", "505,00", "Compagnia", "NREGLI", "Giulia", "@example.test"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("ASTA-08 S04 no valid offer: one reopening; still none: the request is deserted", async () => {
    const r = await run({ closings: [0, 0] });
    expect(
      r.names().filter((n) => ["openRound", "closeRound", "markDeserted"].includes(n)),
    ).toEqual(["openRound", "closeRound", "openRound", "closeRound", "markDeserted"]);
    expect(r.calls.filter((c) => c.name === "openRound").map((c) => c.input)).toEqual([
      { requestId: r.requestId, kind: "MAIN", round: 1 },
      { requestId: r.requestId, kind: "REOPEN", round: 2 },
    ]);
    expect(r.result).toBe("DESERTED");
  });

  it("ASTA-08 the reopening that receives offers goes on to the guarantees", async () => {
    const r = await run({ closings: [0, 3] });
    expect(r.names()).not.toContain("markDeserted");
    expect(r.result).toBe("OFFERS_CLOSED");
  });

  it("ASTA-08 variant: no compatible agency at all: deserted at once", async () => {
    const r = await run({ closings: [], agencies: false });
    expect(r.names()).toEqual(["openRound", "markDeserted"]);
  });

  it("ASTA-06 an extension moves the closing; invitations are added; the minimum guarantee is the activity's business", async () => {
    const r = await run({ closings: [1] }, async (handle) => {
      await handle.signal(auctionExtendedSignal, {
        workingHours: 1,
        byUserId: "u",
        reason: "Guasto",
      });
      await handle.signal(invitationsAddedSignal, {
        organizationIds: ["o"],
        byUserId: "u",
        reason: "Più agenzie",
      });
    });
    expect(r.names()).toContain("extendRound");
    expect(r.names()).toContain("addInvitations");
    const opened = r.calls[0]?.at ?? 0;
    const closed = r.calls.find((c) => c.name === "closeRound")?.at ?? 0;
    expect(closed - opened).toBeGreaterThanOrEqual(3 * HOUR - 1000);
  });

  it("ASTA-06 a cancellation ends the auction without closing it", async () => {
    const r = await run({ closings: [1] }, async (handle) => {
      await handle.signal(auctionCancelledSignal, { byUserId: "u", reason: "Sospetta frode" });
    });
    expect(r.names()).toContain("cancelRound");
    expect(r.names()).not.toContain("closeRound");
    expect(r.result).toBe("CANCELLED");
  });

  it("GAR-05 GAR-06 the reminder about the best offer, then «Scaduta» when every guarantee has ended", async () => {
    const day = 24 * HOUR;
    const now = await env.currentTimeMs();
    const r = await run({
      closings: [2],
      guarantees: [
        {
          active: true,
          reminderAt: new Date(now + 1 * day).toISOString(),
          reminderOfferId: "offer-1",
          bestExpiresAt: new Date(now + 3 * day).toISOString(),
          allExpiredAt: new Date(now + 5 * day).toISOString(),
        },
        {
          active: true,
          reminderAt: null,
          reminderOfferId: "offer-1",
          bestExpiresAt: new Date(now + 3 * day).toISOString(),
          allExpiredAt: new Date(now + 5 * day).toISOString(),
        },
        {
          active: true,
          reminderAt: null,
          reminderOfferId: null,
          bestExpiresAt: null,
          allExpiredAt: new Date(now + 5 * day).toISOString(),
        },
      ],
    });
    expect(r.names().slice(-5)).toEqual([
      "guaranteeSchedule",
      "sendGuaranteeReminder",
      "guaranteeSchedule",
      "guaranteeSchedule",
      "expireRequest",
    ]);
    expect(r.result).toBe("EXPIRED");
  });

  it("rule 13 the development tool fires the next timer at once", async () => {
    const r = await run({ closings: [1] }, async (handle) => {
      for (let i = 0; i < 3; i += 1) await handle.signal(fireNextTimerSignal);
    });
    expect(r.names()).toContain("closeRound");
  });

  it("the auction closes also when the worker is down at the closing time and starts again later", async () => {
    const fake = fakes({ closings: [1], closeFirst: true });
    const requestId = "00000000-0000-7000-8000-999999999999";
    const taskQueue = "test-restart";
    const first = await Worker.create({
      connection: env.nativeConnection,
      taskQueue,
      workflowsPath,
      activities: fake.activities,
      // No sticky cache: the next task goes to whichever worker is up.
      maxCachedWorkflows: 0,
    });
    const handle = await first.runUntil(async () => {
      const h = await start(taskQueue, requestId);
      await h.signal(approvedSignal);
      // Until the auction is open and the workflow waits on its first timer.
      for (let i = 0; i < 100; i += 1) {
        const history = await h.fetchHistory();
        if (history.events?.some((e) => e.timerStartedEventAttributes)) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return h;
    });
    expect(fake.names()).toEqual(["openRound"]);
    // The worker is down when the closing time comes (two hours later). The
    // test server stops skipping time once a task waits with no worker to run it.
    await env.sleep(2 * HOUR + 1000);
    expect(fake.names()).not.toContain("closeRound");
    const second = await Worker.create({
      connection: env.nativeConnection,
      taskQueue,
      workflowsPath,
      activities: fake.activities,
      // No sticky cache: the next task goes to whichever worker is up.
      maxCachedWorkflows: 0,
    });
    const result = await second.runUntil(handle.result());
    expect(fake.names().filter((n) => n === "closeRound")).toHaveLength(1);
    expect(result).toBe("OFFERS_CLOSED");
  });
});
