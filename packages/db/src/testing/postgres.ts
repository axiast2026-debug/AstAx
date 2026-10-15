import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

const POSTGRES_IMAGE = "postgres:18.6";
const initScript = fileURLToPath(
  new URL("../../../../infra/postgres/init/01-roles-and-databases.sh", import.meta.url),
);
const packageDir = fileURLToPath(new URL("../..", import.meta.url));

export interface TestDatabase {
  appUrl: string;
  ownerUrl: string;
  superUrl: string;
  stop(): Promise<void>;
}

/**
 * A real PostgreSQL for integration tests (Testcontainers), created with the
 * same init script and migrations as the local environment. Test code only.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const secret = () => randomBytes(16).toString("hex");
  const superPassword = secret();
  const ownerPassword = secret();
  const appPassword = secret();

  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(POSTGRES_IMAGE)
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

  const url = (user: string, password: string) =>
    `postgresql://${user}:${password}@${container.getHost()}:${container.getPort()}/astax`;
  const ownerUrl = url("astax_owner", ownerPassword);

  const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: packageDir,
    env: { ...process.env, DATABASE_OWNER_URL: ownerUrl },
    stdio: "pipe",
  });

  return {
    appUrl: url("astax_app", appPassword),
    ownerUrl,
    superUrl: url("postgres", superPassword),
    stop: async () => {
      await container.stop();
    },
  };
}
