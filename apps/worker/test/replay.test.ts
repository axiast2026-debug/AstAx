import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { temporal } from "@temporalio/proto";
import { DefaultLogger, makeTelemetryFilterString, Runtime, Worker } from "@temporalio/worker";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * ADR 0008: a change to QuoteRequestWorkflow must replay the histories already
 * recorded, or the running requests would fail. The fixtures are histories of
 * the local environment recorded with the phase 3 code (exported by
 * scripts/export-histories.ts: identifiers, counts and instants only, the
 * machine name replaced): deserted auctions that ended, and requests that were
 * still in their guarantees when the phase 4 changes arrived.
 */
const dir = fileURLToPath(new URL("./fixtures/histories/", import.meta.url));
const workflowsPath = fileURLToPath(new URL("../src/workflows/index.ts", import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

beforeAll(() => {
  Runtime.install({
    logger: new DefaultLogger("ERROR"),
    telemetryOptions: { logging: { filter: makeTelemetryFilterString({ core: "ERROR" }) } },
  });
});

describe("ADR 0008 the current workflow replays the histories recorded before it", () => {
  it("there are histories of both kinds to replay", () => {
    expect(files.some((f) => f.startsWith("completed-"))).toBe(true);
    expect(files.some((f) => f.startsWith("running-"))).toBe(true);
  });

  for (const file of files) {
    it(`replays ${file} without a nondeterminism error`, async () => {
      // The fixtures are the SDK's own objects as JSON (int64 as strings, bytes in base64).
      const history = temporal.api.history.v1.History.fromObject(
        JSON.parse(readFileSync(`${dir}${file}`, "utf8")) as Record<string, unknown>,
      );
      await Worker.runReplayHistory({ workflowsPath }, history, file);
    }, 120_000);
  }
});
