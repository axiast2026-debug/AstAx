import type { TestProject } from "vitest/node";
import { startTestDatabase, type TestDatabase } from "../src/testing/postgres.js";

declare module "vitest" {
  export interface ProvidedContext {
    dbAppUrl: string;
    dbOwnerUrl: string;
    dbSuperUrl: string;
  }
}

let database: TestDatabase | undefined;

/** One real PostgreSQL for the integration run of this package. */
export async function setup(project: TestProject): Promise<void> {
  database = await startTestDatabase();
  project.provide("dbAppUrl", database.appUrl);
  project.provide("dbOwnerUrl", database.ownerUrl);
  project.provide("dbSuperUrl", database.superUrl);
}

export async function teardown(): Promise<void> {
  await database?.stop();
}
