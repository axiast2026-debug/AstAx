// pnpm audit:verify — checks the hash chain of the whole audit log (SIC-04).
// Exit code 0 when intact, 1 when a row was altered, removed or reordered.
import { loadEnv } from "@astax/shared/env";
import { verifyAuditLog } from "../audit.js";
import { createDbClient } from "../client.js";

loadEnv(import.meta.dirname);
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set: run pnpm env:init");
  process.exit(2);
}

const db = createDbClient(url);
try {
  const result = await verifyAuditLog(db);
  if (result.ok) {
    console.log(`Audit log intact: ${result.checked} entries verified.`);
  } else {
    console.error(
      `Audit log BROKEN at entry #${result.index + 1} (${result.problem}); ${result.checked} entries verified before it.`,
    );
    process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
}
