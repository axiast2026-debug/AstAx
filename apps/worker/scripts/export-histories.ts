import { mkdirSync, writeFileSync } from "node:fs";
import { Client, Connection } from "@temporalio/client";

/**
 * Development only: saves the histories of QuoteRequestWorkflow runs that
 * closed before a given instant, as fixtures for the replay test
 * (test/replay.test.ts). The histories hold identifiers, counts and instants
 * only (BC-07): synthetic requests of the local environment.
 *
 *   pnpm --filter @astax/worker exec tsx scripts/export-histories.ts <closedBefore ISO> [max]
 */
const [closedBefore, max = "6", extra = ""] = process.argv.slice(2);
if (!closedBefore) throw new Error("Usage: export-histories.ts <closedBefore ISO> [max]");
const connection = await Connection.connect({
  address: process.env.TEMPORAL_ADDRESS ?? "127.0.0.1:7233",
});
const client = new Client({ connection, namespace: process.env.TEMPORAL_NAMESPACE ?? "astax" });
const out = new URL("../test/fixtures/histories/", import.meta.url);
mkdirSync(out, { recursive: true });
let saved = 0;
for await (const wf of client.workflow.list({
  query: `WorkflowType = 'quoteRequestWorkflow' AND ${extra || `CloseTime < '${closedBefore}'`}`,
})) {
  const history = await client.workflow.getHandle(wf.workflowId, wf.runId).fetchHistory();
  const name = `${wf.status.name.toLowerCase()}-${wf.runId}.json`;
  // The worker identity is «pid@hostname»: the machine name stays out of the repository.
  // So are the sticky task queues («pid@hostname-…»).
  const text = JSON.stringify(history)
    .replace(/"identity":"[^"]*"/g, `"identity":"worker@test"`)
    .replace(/"\d+@[^"]*"/g, `"worker@test"`);
  // Nothing else that looks like an address (the SDK's build id is «@temporalio/worker@x.y.z»).
  if (/@(?!test")/.test(text.replace(/@temporalio\/worker@[\w.+-]+/g, ""))) {
    throw new Error(`${name}: an address-like value`);
  }
  writeFileSync(new URL(name, out), text);
  console.log(name, history.events?.length);
  saved += 1;
  if (saved >= Number(max)) break;
}
await connection.close();
console.log(`saved ${saved}`);
