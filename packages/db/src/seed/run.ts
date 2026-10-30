// pnpm db:seed — loads reference data and synthetic data (fase 1, passo 4).
// Development and test only: refuses to run with NODE_ENV=production (SIC-08).
import { LocalFieldCipher } from "@astax/adapters/crypto";
import { S3ObjectStorage, type ObjectStoragePort } from "@astax/adapters/storage";
import { demoCompaniesEnabled } from "@astax/shared/domain";
import { findRepoRoot, loadEnv } from "@astax/shared/env";
import { createDbClient } from "../client.js";
import { SYSTEM_CONTEXT, withContext } from "../context.js";
import { readDemoCompanies } from "./demo-companies.js";
import { seedReference } from "./reference.js";
import { DEFAULT_SYNTHETIC_SEED, seedSynthetic, type DemoCompaniesInput } from "./synthetic.js";

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

/** The store of the logos: the documents' bucket, as the API and the worker reach it. */
function logoStorage(): ObjectStoragePort {
  const region = process.env.S3_REGION ?? "eu-south-1";
  const bucket = process.env.S3_BUCKET ?? "astax-documents";
  if (process.env.STORAGE_PROVIDER === "aws") return new S3ObjectStorage({ region, bucket });
  return new S3ObjectStorage({
    endpoint: process.env.S3_ENDPOINT ?? `http://127.0.0.1:${process.env.S3_PORT ?? "8333"}`,
    region,
    bucket,
    accessKeyId: required("S3_ACCESS_KEY"),
    secretAccessKey: required("S3_SECRET_KEY"),
    forcePathStyle: true,
    createBucketIfMissing: true,
  });
}

const db = createDbClient(required("DATABASE_URL"));
const cipher = new LocalFieldCipher(required("FIELD_ENCRYPTION_KEY"), required("BLIND_INDEX_KEY"));
const seed = process.env.SYNTHETIC_SEED ?? DEFAULT_SYNTHETIC_SEED;
const repoRoot = findRepoRoot(import.meta.dirname);
// ADR 0028: the real companies instead of the invented ones, only in the demo.
const demo: DemoCompaniesInput | undefined = demoCompaniesEnabled(process.env.DEMO_COMPANIES)
  ? { companies: readDemoCompanies(repoRoot), repoRoot, storage: logoStorage() }
  : undefined;

try {
  const result = await withContext(
    db,
    SYSTEM_CONTEXT,
    async (tx) => ({
      reference: await seedReference(tx, repoRoot),
      synthetic: await seedSynthetic(tx, cipher, seed, demo),
    }),
    { timeoutMs: 120_000 },
  );
  console.log("Seed loaded:", JSON.stringify({ ...result, demoCompanies: demo !== undefined }));
} finally {
  await db.$disconnect();
}
