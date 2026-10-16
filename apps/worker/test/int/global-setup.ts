import { LocalFieldCipher } from "@astax/adapters/crypto";
import { createDbClient, SYSTEM_CONTEXT, withContext } from "@astax/db";
import { seedReference, seedSynthetic } from "@astax/db/seed";
import { startTestDatabase, type TestDatabase } from "@astax/db/testing";
import { findRepoRoot } from "@astax/shared/env";
import type { TestProject } from "vitest/node";
import { TEST_CIPHER_KEYS, TEST_SEED } from "./fixtures.js";

declare module "vitest" {
  export interface ProvidedContext {
    workerDbUrl: string;
  }
}

let database: TestDatabase | undefined;

/** Real PostgreSQL with migrations, reference data and the synthetic agencies. */
export async function setup(project: TestProject): Promise<void> {
  database = await startTestDatabase();
  const db = createDbClient(database.appUrl);
  const cipher = new LocalFieldCipher(TEST_CIPHER_KEYS.encryption, TEST_CIPHER_KEYS.blindIndex);
  try {
    await withContext(
      db,
      SYSTEM_CONTEXT,
      async (tx) => {
        await seedReference(tx, findRepoRoot(import.meta.dirname));
        await seedSynthetic(tx, cipher, TEST_SEED);
      },
      { timeoutMs: 120_000 },
    );
  } finally {
    await db.$disconnect();
  }
  project.provide("workerDbUrl", database.appUrl);
}

export async function teardown(): Promise<void> {
  await database?.stop();
}
