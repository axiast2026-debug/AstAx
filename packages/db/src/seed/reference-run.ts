// pnpm db:seed:reference — loads only the reference data (parameters, lists,
// holidays, municipalities, packages, exclusion rules, notification texts,
// legal placeholders): the seed of collaudo and produzione (phase 8). No
// synthetic data ever (SIC-08). Safe to run again: what the administrator
// changed later stays (new versions are kept).
import { findRepoRoot, loadEnv } from "@astax/shared/env";
import { createDbClient } from "../client.js";
import { SYSTEM_CONTEXT, withContext } from "../context.js";
import { seedReference } from "./reference.js";

loadEnv(import.meta.dirname);
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(2);
}

const db = createDbClient(url);
try {
  const reference = await withContext(
    db,
    SYSTEM_CONTEXT,
    (tx) => seedReference(tx, findRepoRoot(import.meta.dirname)),
    { timeoutMs: 120_000 },
  );
  console.log("Reference data loaded:", JSON.stringify(reference));
} finally {
  await db.$disconnect();
}
