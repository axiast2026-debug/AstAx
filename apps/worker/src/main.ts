import "./instrument.js";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { DEV_CLOCK_OFFSET_KEY, OffsetClock, SystemClock } from "@astax/adapters/clock";
import { LocalFieldCipher } from "@astax/adapters/crypto";
import { BedrockDocumentReader, FakeDocumentReader } from "@astax/adapters/document-reader";
import {
  MailpitEmailSender,
  ResendEmailSender,
  SesEmailSender,
  TestAddressRouter,
} from "@astax/adapters/email";
import { MailpitWebPush, revokingGone, VapidWebPush } from "@astax/adapters/web-push";
import { AwsKms, CloudTrailKmsEvents, KMS_KEYS, LocalKms } from "@astax/adapters/kms";
import {
  InMemoryObjectStorage,
  S3ObjectStorage,
  ObjectNotFoundError,
  type ObjectStoragePort,
} from "@astax/adapters/storage";
import {
  createDbClient,
  dispatchMessages,
  dispatchOutbox,
  kmsEventRecorder,
  kmsEventSource,
  revokePushSubscription,
} from "@astax/db";
import { AwsSmsSender, MailpitSmsSender } from "@astax/adapters/sms";
import { demoCompanyName } from "@astax/shared/domain";
import { loadEnv } from "@astax/shared/env";
import { createLogger, errorForLog } from "@astax/shared/logging";
import { Client, Connection } from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";
import { createClient } from "redis";
import { createActivities, type RealtimeEvent } from "./activities/index.js";
import { loadWorkerConfig, type WorkerConfig } from "./config.js";
import { WorkerNotifier } from "./notifier.js";
import { outboxHandler } from "./outbox.js";
import { startSchedules } from "./schedules.js";
import { reportError } from "./telemetry.js";
import { FakeRuiRegistry } from "@astax/adapters/rui-registry";
import { KeycloakAdmin } from "@astax/adapters/identity";

/** The channel the API listens to for the changes it forwards to the browsers (ADR 0008). */
export const REALTIME_CHANNEL = "astax:realtime";

function storageFor(config: WorkerConfig): ObjectStoragePort {
  // Phase 8: in AWS the bucket of Terraform, reached with the task's own role.
  if (config.STORAGE_PROVIDER === "aws") {
    return new S3ObjectStorage({ region: config.S3_REGION, bucket: config.S3_BUCKET });
  }
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

// Phase 8: the provider of each port comes from the configuration (docs/adattatori.md).
const from = { email: config.EMAIL_FROM, name: "AstAx" };
const email =
  config.EMAIL_PROVIDER === "ses"
    ? new SesEmailSender({
        region: config.AWS_REGION,
        from,
        ...(config.SES_CONFIGURATION_SET ? { configurationSet: config.SES_CONFIGURATION_SET } : {}),
      })
    : config.EMAIL_PROVIDER === "resend"
      ? // ADR 0020: invented users (.test addresses) stay on Mailpit.
        new TestAddressRouter(
          new ResendEmailSender({ apiKey: config.RESEND_API_KEY ?? "", from }),
          new MailpitEmailSender(config.MAILPIT_URL, from),
        )
      : new MailpitEmailSender(config.MAILPIT_URL, from);
// The fake SMS and push land in Mailpit as emails: with a real email provider
// (the online demo, ADR 0020) they still go to Mailpit, never out.
const fakeChannel =
  config.EMAIL_PROVIDER === "fake" ? email : new MailpitEmailSender(config.MAILPIT_URL, from);
const sms =
  config.SMS_PROVIDER === "aws"
    ? new AwsSmsSender({
        region: config.AWS_REGION,
        originator: config.SMS_ORIGINATOR,
        ...(config.SMS_CONFIGURATION_SET ? { configurationSet: config.SMS_CONFIGURATION_SET } : {}),
      })
    : new MailpitSmsSender(fakeChannel);
const storage = storageFor(config);
// SIC-04: the archive of the audit log copies, a bucket of its own.
const auditArchive = storageFor({ ...config, S3_BUCKET: config.AUDIT_ARCHIVE_BUCKET });
const fieldCipher = new LocalFieldCipher(config.FIELD_ENCRYPTION_KEY, config.BLIND_INDEX_KEY);
// Phase 8: real Web Push with PUSH_PROVIDER=vapid; a subscription gone is revoked.
const push = revokingGone(
  config.PUSH_PROVIDER === "vapid" && config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY
    ? new VapidWebPush({
        publicKey: config.VAPID_PUBLIC_KEY,
        privateKey: config.VAPID_PRIVATE_KEY,
        subject: config.VAPID_SUBJECT,
      })
    : new MailpitWebPush(fakeChannel),
  (endpoint) => revokePushSubscription(db, endpoint, clock.now()),
);
const notifier = new WorkerNotifier(email, logger, { db, clock, cipher: fieldCipher, push });
/** Phase 8: the senders of MessageOutbox (the fakes until the real providers, rule 9). */
const senders = { email, sms, push };
const recordKms = kmsEventRecorder(db, "worker", () => clock.now());
const activities = createActivities({
  db,
  // ADR 0005: the worker holds only the key of the sealed bids.
  kms:
    config.KMS_PROVIDER === "aws"
      ? new AwsKms({
          region: config.AWS_REGION,
          keys: { [KMS_KEYS.sealedBids]: config.KMS_SEALED_BIDS_KEY_ID },
          onOperation: recordKms,
        })
      : new LocalKms({ [KMS_KEYS.sealedBids]: config.SEALED_BIDS_MASTER_KEY }, recordKms),
  clock,
  cipher: fieldCipher,
  storage,
  // The reader of the quotes (OFF-09): Claude on Bedrock, or the fake that reads the text.
  reader:
    config.AI_PROVIDER === "bedrock"
      ? new BedrockDocumentReader(
          { region: config.AWS_REGION, modelId: config.BEDROCK_MODEL_ID ?? "" },
          (key) => storage.get(key),
        )
      : new FakeDocumentReader(
          clock,
          undefined,
          undefined,
          (key) => storage.get(key),
          (name) => demoCompanyName(name, config.DEMO_COMPANIES),
        ),
  notifier,
  logger,
  urls: { web: config.WEB_URL, admin: config.ADMIN_URL },
  publish,
  allowEarlyClose: config.DEV_TOOLS && config.NODE_ENV !== "production",
});

// ADR 0012: Temporal Cloud (EU) with an API key and TLS; the local server without.
const cloud = config.TEMPORAL_API_KEY ? { apiKey: config.TEMPORAL_API_KEY, tls: true } : {};
const connection = await NativeConnection.connect({ address, ...cloud });
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
  connection: await Connection.connect({ address, ...cloud }),
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
        Promise.all([
          dispatchOutbox(db, deliver, { now: clock.now() }).then((result) => {
            if (result.failed > 0) logger.error({ ...result }, "outbox events failed for good");
          }),
          // Phase 8: emails, SMS and pushes left behind by a stopped process or a provider down.
          dispatchMessages(db, fieldCipher, senders, { now: clock.now() }).then((result) => {
            if (result.sent + result.retried > 0) logger.info({ ...result }, "messages sent again");
            if (result.failed > 0) logger.error({ ...result }, "messages failed for good");
          }),
        ])
          .catch((error: unknown) => {
            logger.error({ err: errorForLog(error) }, "outbox dispatch failed");
            reportError(error);
          })
          .finally(() => {
            dispatching = false;
          });
      }, config.OUTBOX_DISPATCH_INTERVAL_MS);

const stopSchedules = startSchedules(
  {
    db,
    clock,
    cipher: fieldCipher,
    logger,
    rui: new FakeRuiRegistry(undefined, (name) => demoCompanyName(name, config.DEMO_COMPANIES)),
    notifier,
    adminUrl: config.ADMIN_URL,
    archiveAudit: (key, body) =>
      auditArchive.put({ key, body, contentType: "application/x-ndjson" }),
    // BC-03: the nightly check of the sealed bids' key, from the app's record and from CloudTrail.
    keySources: [
      { name: "app", source: kmsEventSource(db), principals: ["worker"] },
      ...(config.KMS_PROVIDER === "aws" &&
      config.KMS_SEALED_BIDS_KEY_ID &&
      config.KMS_WORKER_ROLE_ARN
        ? [
            {
              name: "cloudtrail",
              source: new CloudTrailKmsEvents(config.AWS_REGION, config.KMS_SEALED_BIDS_KEY_ID),
              principals: [config.KMS_WORKER_ROLE_ARN],
              // CloudTrail delivers events up to about 15 minutes late.
              lagMs: 30 * 60_000,
            },
          ]
        : []),
    ],
    ...(config.KEYCLOAK_URL && config.KEYCLOAK_API_ADMIN_SECRET
      ? {
          identity: new KeycloakAdmin({
            baseUrl: config.KEYCLOAK_ADMIN_URL ?? config.KEYCLOAK_URL,
            realm: config.KEYCLOAK_REALM,
            clientId: "astax-api-admin",
            clientSecret: config.KEYCLOAK_API_ADMIN_SECRET,
            now: () => clock.now().getTime(),
          }),
        }
      : {}),
    deleteObject: async (key) => {
      try {
        await storage.delete(key);
      } catch (error) {
        // Already gone: nothing to delete.
        if (!(error instanceof ObjectNotFoundError)) throw error;
      }
    },
  },
  config.SCHEDULES_INTERVAL_MS,
);

const stop = () => {
  stopSchedules();
  clearInterval(outboxTimer);
  clearInterval(devClockTimer);
  health?.close();
  worker.shutdown();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

const health =
  config.WORKER_HEALTH_PORT === 0
    ? undefined
    : createServer((_request, response) => {
        response.writeHead(worker.getState() === "RUNNING" ? 200 : 503).end();
      }).listen(config.WORKER_HEALTH_PORT, config.WORKER_HEALTH_HOST);

logger.info(
  { taskQueue: config.TEMPORAL_TASK_QUEUE, namespace: config.TEMPORAL_NAMESPACE },
  "worker started",
);
await worker.run();
await Promise.all([db.$disconnect(), redis.quit(), connection.close()]);
