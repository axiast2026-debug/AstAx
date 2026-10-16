import { fileURLToPath } from "node:url";
import { DEV_CLOCK_OFFSET_KEY, OffsetClock, SystemClock } from "@astax/adapters/clock";
import { LocalFieldCipher } from "@astax/adapters/crypto";
import { MailpitEmailSender } from "@astax/adapters/email";
import { KMS_KEYS, LocalKms } from "@astax/adapters/kms";
import {
  InMemoryObjectStorage,
  S3ObjectStorage,
  type ObjectStoragePort,
} from "@astax/adapters/storage";
import { createDbClient, dispatchOutbox, kmsEventRecorder } from "@astax/db";
import { loadEnv } from "@astax/shared/env";
import { createLogger, errorForLog } from "@astax/shared/logging";
import { Client, Connection } from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";
import { createClient } from "redis";
import { createActivities, type RealtimeEvent } from "./activities/index.js";
import { loadWorkerConfig, type WorkerConfig } from "./config.js";
import { WorkerNotifier } from "./notifier.js";
import { outboxHandler } from "./outbox.js";

/** The channel the API listens to for the changes it forwards to the browsers (ADR 0008). */
export const REALTIME_CHANNEL = "astax:realtime";

function storageFor(config: WorkerConfig): ObjectStoragePort {
  if (!config.S3_ACCESS_KEY || !config.S3_SECRET_KEY) return new InMemoryObjectStorage();
  return new S3ObjectStorage({
    endpoint: config.S3_ENDPOINT ?? `http://127.0.0.1:${config.S3_PORT}`,
    region: config.S3_REGION,
    bucket: config.S3_BUCKET,
    accessKeyId: config.S3_ACCESS_KEY,
    secretAccessKey: config.S3_SECRET_KEY,
    forcePathStyle: true,
    createBucketIfMissing: config.NODE_ENV !== "production",
  });
}

loadEnv(import.meta.dirname);
const config = loadWorkerConfig(process.env);
const logger = createLogger({ name: "worker", level: config.LOG_LEVEL });
// rule 13: in development the application clock can be moved forward, shared with the API.
const clock = config.DEV_TOOLS ? new OffsetClock(new SystemClock()) : new SystemClock();
const db = createDbClient(config.DATABASE_URL);
const address = config.TEMPORAL_ADDRESS ?? `127.0.0.1:${config.TEMPORAL_PORT}`;

const redis = createClient({ url: config.REDIS_URL ?? `redis://127.0.0.1:${config.REDIS_PORT}` });
redis.on("error", (error: unknown) => logger.warn({ err: errorForLog(error) }, "redis error"));
await redis.connect();
const devClockTimer =
  clock instanceof OffsetClock
    ? setInterval(() => {
        redis
          .get(DEV_CLOCK_OFFSET_KEY)
          .then((value) => clock.setOffset(Number(value ?? 0) || 0))
          .catch(() => undefined);
      }, 2000)
    : undefined;
const publish = async (event: RealtimeEvent) => {
  await redis.publish(REALTIME_CHANNEL, JSON.stringify(event));
};

const email = new MailpitEmailSender(config.MAILPIT_URL, {
  email: config.EMAIL_FROM,
  name: "AstAx",
});
const activities = createActivities({
  db,
  // ADR 0005: the worker holds only the key of the sealed bids.
  kms: new LocalKms(
    { [KMS_KEYS.sealedBids]: config.SEALED_BIDS_MASTER_KEY },
    kmsEventRecorder(db, "worker", () => clock.now()),
  ),
  clock,
  cipher: new LocalFieldCipher(config.FIELD_ENCRYPTION_KEY, config.BLIND_INDEX_KEY),
  storage: storageFor(config),
  notifier: new WorkerNotifier(email, logger),
  logger,
  urls: { web: config.WEB_URL, admin: config.ADMIN_URL },
  publish,
});

const connection = await NativeConnection.connect({ address });
const worker = await Worker.create({
  connection,
  namespace: config.TEMPORAL_NAMESPACE,
  taskQueue: config.TEMPORAL_TASK_QUEUE,
  // In development tsx runs the sources; the build runs the compiled files.
  workflowsPath: fileURLToPath(
    new URL(`./workflows/index.${import.meta.url.endsWith(".ts") ? "ts" : "js"}`, import.meta.url),
  ),
  activities,
});

const client = new Client({
  connection: await Connection.connect({ address }),
  namespace: config.TEMPORAL_NAMESPACE,
});
const deliver = outboxHandler(client, config.TEMPORAL_TASK_QUEUE, logger);
let dispatching = false;
const outboxTimer =
  config.OUTBOX_DISPATCH_INTERVAL_MS === 0
    ? undefined
    : setInterval(() => {
        if (dispatching) return;
        dispatching = true;
        dispatchOutbox(db, deliver, { now: clock.now() })
          .then((result) => {
            if (result.failed > 0) logger.error({ ...result }, "outbox events failed for good");
          })
          .catch((error: unknown) =>
            logger.error({ err: errorForLog(error) }, "outbox dispatch failed"),
          )
          .finally(() => {
            dispatching = false;
          });
      }, config.OUTBOX_DISPATCH_INTERVAL_MS);

const stop = () => {
  clearInterval(outboxTimer);
  clearInterval(devClockTimer);
  worker.shutdown();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

logger.info(
  { taskQueue: config.TEMPORAL_TASK_QUEUE, namespace: config.TEMPORAL_NAMESPACE },
  "worker started",
);
await worker.run();
await Promise.all([db.$disconnect(), redis.quit(), connection.close()]);
