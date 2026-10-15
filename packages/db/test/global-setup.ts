import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    dbAppUrl: string;
    dbOwnerUrl: string;
    dbSuperUrl: string;
  }
}

const POSTGRES_IMAGE = "postgres:18.6";
const initScript = fileURLToPath(
  new URL("../../../infra/postgres/init/01-roles-and-databases.sh", import.meta.url),
);
const packageDir = fileURLToPath(new URL("..", import.meta.url));

let container: StartedPostgreSqlContainer | undefined;

/**
 * One real PostgreSQL for the integration run, created with the same init
 * script and migrations as the local environment.
 */
export async function setup(project: TestProject): Promise<void> {
  const secret = () => randomBytes(16).toString("hex");
  const superPassword = secret();
  const ownerPassword = secret();
  const appPassword = secret();

  container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withUsername("postgres")
    .withPassword(superPassword)
    .withDatabase("postgres")
    .withEnvironment({
      ASTAX_DB_OWNER_PASSWORD: ownerPassword,
      ASTAX_DB_APP_PASSWORD: appPassword,
      KEYCLOAK_DB_PASSWORD: secret(),
    })
    .withCopyFilesToContainer([
      { source: initScript, target: "/docker-entrypoint-initdb.d/01-roles-and-databases.sh" },
    ])
    .start();

  const host = container.getHost();
  const port = container.getPort();
  const url = (user: string, password: string) =>
    `postgresql://${user}:${password}@${host}:${port}/astax`;
  const ownerUrl = url("astax_owner", ownerPassword);

  const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: packageDir,
    env: { ...process.env, DATABASE_OWNER_URL: ownerUrl },
    stdio: "pipe",
  });

  project.provide("dbAppUrl", url("astax_app", appPassword));
  project.provide("dbOwnerUrl", ownerUrl);
  project.provide("dbSuperUrl", url("postgres", superPassword));
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
