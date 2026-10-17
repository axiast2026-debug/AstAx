// pnpm db:seed — loads reference data and synthetic data (fase 1, passo 4).
// Development and test only: refuses to run with NODE_ENV=production (SIC-08).
import { LocalFieldCipher } from "@astax/adapters/crypto";
import { findRepoRoot, loadEnv } from "@astax/shared/env";
import { createDbClient } from "../client.js";
import { SYSTEM_CONTEXT, withContext } from "../context.js";
import { seedReference } from "./reference.js";
import { DEFAULT_SYNTHETIC_SEED, seedSynthetic } from "./synthetic.js";

loadEnv(import.meta.dirname);
if (process.env.NODE_ENV === "production") {
  console.error("The synthetic seed never runs in production.");
  process.exit(2);
}

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set: run pnpm env:init`);
    process.exit(2);
  }
  return value;
};

const db = createDbClient(required("DATABASE_URL"));
const cipher = new LocalFieldCipher(required("FIELD_ENCRYPTION_KEY"), required("BLIND_INDEX_KEY"));
const seed = process.env.SYNTHETIC_SEED ?? DEFAULT_SYNTHETIC_SEED;

try {
  const result = await withContext(
    db,
    SYSTEM_CONTEXT,
    async (tx) => ({
      reference: await seedReference(tx, findRepoRoot(import.meta.dirname)),
      synthetic: await seedSynthetic(tx, cipher, seed),
    }),
    { timeoutMs: 120_000 },
  );
  console.log("Seed loaded:", JSON.stringify(result));
} finally {
  await db.$disconnect();
}
