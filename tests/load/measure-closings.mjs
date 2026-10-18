// Phase 8: how late the auctions closed, from the database (the load criterion:
// within 5 seconds of the scheduled time). Read-only.
//   DATABASE_URL=... node tests/load/measure-closings.mjs 2026-11-20T09:00:00Z 2026-11-20T12:00:00Z
import { createRequire } from "node:module";

// pg comes with the database package (pnpm does not hoist it to the root).
const pg = createRequire(new URL("../../packages/db/package.json", import.meta.url))("pg");

const [from, to] = process.argv.slice(2);
if (!from || !to) {
  console.error("usage: measure-closings.mjs <from ISO> <to ISO>");
  process.exit(2);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  // As the system (row level security): only identifiers and times are read.
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.is_system', 'true', true)");
  const { rows } = await client.query(
    `SELECT EXTRACT(EPOCH FROM ("closedAt" - "scheduledCloseAt")) * 1000 AS delay
       FROM "Auction"
      WHERE "status" = 'CLOSED' AND "scheduledCloseAt" >= $1 AND "scheduledCloseAt" < $2`,
    [from, to],
  );
  await client.query("COMMIT");
  const delays = rows.map((r) => Number(r.delay)).sort((a, b) => a - b);
  const pct = (p) => delays[Math.min(delays.length - 1, Math.floor((p / 100) * delays.length))];
  const late = delays.filter((d) => d > 5000).length;
  console.log(
    JSON.stringify({
      closed: delays.length,
      p50Ms: pct(50),
      p95Ms: pct(95),
      maxMs: delays.at(-1),
      laterThan5s: late,
    }),
  );
  process.exitCode = late > 0 ? 1 : 0;
} finally {
  await client.end();
}
