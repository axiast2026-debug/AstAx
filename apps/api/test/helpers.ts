import { Writable } from "node:stream";
import { ManualClock } from "@astax/adapters/clock";
import type { DbClient } from "@astax/db";
import { createLogger } from "@astax/shared/logging";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createApp } from "../src/app.js";
import { loadConfig, type ApiConfig } from "../src/config/config.js";

export const TEST_ENV = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://astax_app:test@127.0.0.1:1/astax",
  FIELD_ENCRYPTION_KEY: "1".repeat(64),
  BLIND_INDEX_KEY: "2".repeat(64),
  KEYCLOAK_URL: "http://keycloak.test",
  KEYCLOAK_API_ADMIN_SECRET: "test-secret-not-used-0000",
  OUTBOX_DISPATCH_INTERVAL_MS: "0",
  IDENTITY_SYNC_ON_START: "false",
};

export interface TestApi {
  app: NestExpressApplication;
  baseUrl: string;
  clock: ManualClock;
  logs: string[];
  close(): Promise<void>;
}

/** Starts the real application on a random port, with test doubles where asked. */
export async function startTestApi(
  options: { db?: DbClient; env?: Record<string, string>; config?: ApiConfig } = {},
): Promise<TestApi> {
  const logs: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      logs.push(chunk.toString());
      callback();
    },
  });
  const clock = new ManualClock("2026-11-16T09:00:00.000Z");
  const config = options.config ?? loadConfig({ ...TEST_ENV, ...options.env });
  const app = await createApp(config, {
    clock,
    logger: createLogger({ name: "api-test", level: "debug", destination }),
    ...(options.db ? { db: options.db } : {}),
  });
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as { port: number };
  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    clock,
    logs,
    close: () => app.close(),
  };
}

/** Minimal stand-in for the database where only connectivity matters. */
export function fakeDb(healthy: boolean): DbClient {
  return {
    $queryRaw: async () => {
      if (!healthy) throw new Error("connect ECONNREFUSED 127.0.0.1:5433");
      return [{ "?column?": 1 }];
    },
    $disconnect: async () => undefined,
  } as unknown as DbClient;
}
