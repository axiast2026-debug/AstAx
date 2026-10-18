import { OffsetClock, SystemClock, type Clock } from "@astax/adapters/clock";
import { LocalFieldCipher } from "@astax/adapters/crypto";
import { MailpitEmailSender, SesEmailSender, type EmailSender } from "@astax/adapters/email";
import { KeycloakAdmin } from "@astax/adapters/identity";
import {
  BedrockDocumentReader,
  FakeDocumentReader,
  type DocumentReaderPort,
} from "@astax/adapters/document-reader";
import { AwsSmsSender, MailpitSmsSender, type SmsPort } from "@astax/adapters/sms";
import {
  MailpitWebPush,
  revokingGone,
  VapidWebPush,
  type WebPushPort,
} from "@astax/adapters/web-push";
import { loadNotificationTemplates } from "@astax/shared/notifications";
import {
  InMemoryObjectStorage,
  S3ObjectStorage,
  type ObjectStoragePort,
} from "@astax/adapters/storage";
import {
  FakePlateLookup,
  OpenapiPlateLookup,
  type PlateLookupPort,
} from "@astax/adapters/vehicle-data";
import { AwsKms, KMS_KEYS, LocalKms } from "@astax/adapters/kms";
import {
  BedrockAiExplainer,
  FakeAiExplainer,
  type AiExplainerPort,
} from "@astax/adapters/ai-explainer";
import {
  FakeEInvoicing,
  OpenapiEInvoicing,
  type EInvoicingPort,
} from "@astax/adapters/e-invoicing";
import { FakePaymentsProvider, type PaymentsPort } from "@astax/adapters/payments";
import { FakeSignatureProvider, type SignaturePort } from "@astax/adapters/signature";
import { createHmac } from "node:crypto";
import {
  createDbClient,
  kmsEventRecorder,
  revokePushSubscription,
  TemplateStore,
  type DbClient,
} from "@astax/db";
import { createLogger, errorForLog, type Logger } from "@astax/shared/logging";
import {
  Global,
  Inject,
  Module,
  type DynamicModule,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { JwtTokenVerifier, type TokenVerifier } from "../auth/token-verifier.js";
import { TemporalWorkflowSignals, type WorkflowSignals } from "../auctions/workflow-signals.js";
import type { ApiConfig } from "../config/config.js";
import type { IdentityAdmin } from "../identity/identity-admin.js";
import {
  CLOCK,
  CONFIG,
  DB,
  EMAIL_SENDER,
  FIELD_CIPHER,
  DOCUMENT_READER,
  IDENTITY_ADMIN,
  LOGGER,
  OBJECT_STORAGE,
  PLATE_LOOKUP,
  KMS,
  SMS_SENDER,
  WEB_PUSH,
  NOTIFICATION_TEMPLATES,
  TOKEN_VERIFIER,
  WORKFLOW_SIGNALS,
  SIGNATURE,
  PAYMENTS,
  AI_EXPLAINER,
  E_INVOICING,
  RATE_LIMIT_STORE,
} from "./tokens.js";
import {
  MemoryRateLimitStore,
  RedisRateLimitStore,
  type RateLimitStore,
} from "../security/rate-limit-store.js";

export interface InfraOverrides {
  clock?: Clock;
  db?: DbClient;
  logger?: Logger;
  tokenVerifier?: TokenVerifier;
  identityAdmin?: IdentityAdmin;
  emailSender?: EmailSender;
  smsSender?: SmsPort;
  webPush?: WebPushPort;
  objectStorage?: ObjectStoragePort;
  plateLookup?: PlateLookupPort;
  documentReader?: DocumentReaderPort;
  workflowSignals?: WorkflowSignals;
  signature?: SignaturePort;
  payments?: PaymentsPort;
  aiExplainer?: AiExplainerPort;
  eInvoicing?: EInvoicingPort;
  rateLimitStore?: RateLimitStore;
}

/**
 * The key that signs the fake providers' webhooks (rule 9: fakes only until
 * phase 8). Derived from a secret already in the environment, so that no new
 * variable is needed in development.
 */
function fakeWebhookSecret(config: ApiConfig): string {
  return createHmac("sha256", config.FIELD_ENCRYPTION_KEY)
    .update("fake-provider-webhooks")
    .digest("hex");
}

/**
 * SeaweedFS in development (ADR 0003). Without credentials (tests, CI without
 * storage) the documents stay in memory.
 */
function objectStorageFor(config: ApiConfig): ObjectStoragePort {
  if (!config.S3_ACCESS_KEY || !config.S3_SECRET_KEY) {
    // In production the documents must never live in memory: refuse to start.
    if (config.NODE_ENV === "production") {
      throw new Error("S3_ACCESS_KEY and S3_SECRET_KEY are required in production");
    }
    return new InMemoryObjectStorage();
  }
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

class DbLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.$disconnect();
  }
}

/**
 * Configuration, clock, database, logger, field cipher, token verifier, Keycloak
 * administration and email for the whole API. Tests pass overrides.
 */
@Global()
@Module({})
export class InfraModule {
  static forRoot(config: ApiConfig, overrides: InfraOverrides = {}): DynamicModule {
    // rule 13: in development the application clock can be moved forward (DevToolsService).
    const clock =
      overrides.clock ??
      (config.DEV_TOOLS ? new OffsetClock(new SystemClock()) : new SystemClock());
    // Phase 8: the provider of each port comes from the configuration (docs/adattatori.md).
    const from = { email: config.EMAIL_FROM, name: "AstAx" };
    const emailSender =
      overrides.emailSender ??
      (config.EMAIL_PROVIDER === "ses"
        ? new SesEmailSender({
            region: config.AWS_REGION,
            from,
            ...(config.SES_CONFIGURATION_SET
              ? { configurationSet: config.SES_CONFIGURATION_SET }
              : {}),
          })
        : new MailpitEmailSender(config.MAILPIT_URL, from));
    const smsSender =
      overrides.smsSender ??
      (config.SMS_PROVIDER === "aws"
        ? new AwsSmsSender({
            region: config.AWS_REGION,
            originator: config.SMS_ORIGINATOR,
            ...(config.SMS_CONFIGURATION_SET
              ? { configurationSet: config.SMS_CONFIGURATION_SET }
              : {}),
          })
        : new MailpitSmsSender(emailSender));
    // Vehicle data: the fake until the Openapi sandbox (part B of phase 8).
    const plateLookup =
      overrides.plateLookup ??
      (config.PLATE_PROVIDER === "openapi"
        ? new OpenapiPlateLookup({
            baseUrl: config.OPENAPI_AUTOMOTIVE_URL,
            token: config.OPENAPI_AUTOMOTIVE_TOKEN ?? "",
          })
        : new FakePlateLookup(clock));
    // One store for the documents and for the fake providers' envelopes and checkouts.
    const objectStorage = overrides.objectStorage ?? objectStorageFor(config);
    const bedrock = { region: config.AWS_REGION, modelId: config.BEDROCK_MODEL_ID ?? "" };
    return {
      module: InfraModule,
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: CLOCK, useValue: clock },
        { provide: DB, useValue: overrides.db ?? createDbClient(config.DATABASE_URL) },
        {
          provide: LOGGER,
          useValue: overrides.logger ?? createLogger({ name: "api", level: config.LOG_LEVEL }),
        },
        {
          provide: FIELD_CIPHER,
          useValue: new LocalFieldCipher(config.FIELD_ENCRYPTION_KEY, config.BLIND_INDEX_KEY),
        },
        {
          provide: TOKEN_VERIFIER,
          useValue:
            overrides.tokenVerifier ??
            // Keycloak signs the tokens with the real time: the development clock,
            // moved forward to reach a guarantee's end (rule 13), must not expire them.
            JwtTokenVerifier.forKeycloak(
              config.KEYCLOAK_URL,
              config.KEYCLOAK_REALM,
              clock instanceof OffsetClock ? new SystemClock() : clock,
            ),
        },
        {
          provide: IDENTITY_ADMIN,
          useValue:
            overrides.identityAdmin ??
            new KeycloakAdmin({
              baseUrl: config.KEYCLOAK_URL,
              realm: config.KEYCLOAK_REALM,
              clientId: "astax-api-admin",
              clientSecret: config.KEYCLOAK_API_ADMIN_SECRET,
              now: () => clock.now().getTime(),
            }),
        },
        { provide: EMAIL_SENDER, useValue: emailSender },
        { provide: SMS_SENDER, useValue: smsSender },
        // Proposal B of phase 7: the fake push until phase 8, delivered to Mailpit.
        {
          // Phase 8: real Web Push with PUSH_PROVIDER=vapid; a subscription gone is revoked.
          provide: WEB_PUSH,
          inject: [DB],
          useFactory: (db: DbClient) =>
            overrides.webPush ??
            revokingGone(
              config.PUSH_PROVIDER === "vapid"
                ? new VapidWebPush({
                    publicKey: config.VAPID_PUBLIC_KEY ?? "",
                    privateKey: config.VAPID_PRIVATE_KEY ?? "",
                    subject: config.VAPID_SUBJECT,
                  })
                : new MailpitWebPush(emailSender),
              (endpoint) => revokePushSubscription(db, endpoint, clock.now()),
            ),
        },
        {
          // The texts in force (NotificationTemplate), read again every 30 seconds.
          provide: NOTIFICATION_TEMPLATES,
          inject: [DB],
          useFactory: (db: DbClient) =>
            new TemplateStore(
              db,
              () => clock.now().getTime(),
              () => loadNotificationTemplates(),
            ),
        },
        { provide: OBJECT_STORAGE, useValue: objectStorage },
        { provide: PLATE_LOOKUP, useValue: plateLookup },
        {
          provide: DOCUMENT_READER,
          useValue:
            overrides.documentReader ??
            (config.AI_PROVIDER === "bedrock"
              ? new BedrockDocumentReader(bedrock, (key) => objectStorage.get(key))
              : new FakeDocumentReader(clock, plateLookup)),
        },
        {
          // BC-03, ADR 0005: the API holds only the key of the agencies' own copies.
          provide: KMS,
          inject: [DB, LOGGER],
          useFactory: (db: DbClient, logger: Logger) => {
            const record = kmsEventRecorder(db, "api", () => clock.now(), {
              wait: false,
              // The row is the proof of BC-04: a failed write is an error in the log.
              onError: (error) =>
                logger.error({ err: errorForLog(error) }, "KMS event not recorded"),
            });
            // Phase 8: AWS KMS with the API role's own key; CloudTrail logs every use too.
            return config.KMS_PROVIDER === "aws"
              ? new AwsKms({
                  region: config.AWS_REGION,
                  keys: { [KMS_KEYS.offerOwner]: config.KMS_OFFER_OWNER_KEY_ID },
                  onOperation: record,
                })
              : new LocalKms({ [KMS_KEYS.offerOwner]: config.OFFER_OWNER_MASTER_KEY }, record);
          },
        },
        {
          provide: SIGNATURE,
          useValue:
            overrides.signature ??
            new FakeSignatureProvider(
              objectStorage,
              clock,
              fakeWebhookSecret(config),
              (ref) => `${config.WEB_URL}/firma-di-prova/${ref}`,
            ),
        },
        {
          provide: PAYMENTS,
          useValue:
            overrides.payments ??
            new FakePaymentsProvider(
              objectStorage,
              clock,
              fakeWebhookSecret(config),
              (ref) => `${config.WEB_URL}/pagamento-di-prova/${ref}`,
            ),
        },
        {
          provide: AI_EXPLAINER,
          useValue:
            overrides.aiExplainer ??
            (config.AI_PROVIDER === "bedrock"
              ? new BedrockAiExplainer(bedrock)
              : new FakeAiExplainer()),
        },
        // CONT-03: the fake SDI until phase 8 (rule 9).
        {
          provide: E_INVOICING,
          useValue:
            overrides.eInvoicing ??
            (config.SDI_PROVIDER === "openapi"
              ? new OpenapiEInvoicing({
                  baseUrl: config.OPENAPI_SDI_URL,
                  token: config.OPENAPI_SDI_TOKEN ?? "",
                  webhookSecret: config.OPENAPI_SDI_WEBHOOK_SECRET ?? "",
                })
              : new FakeEInvoicing(clock)),
        },
        {
          provide: WORKFLOW_SIGNALS,
          useValue:
            overrides.workflowSignals ??
            new TemporalWorkflowSignals(
              config.TEMPORAL_ADDRESS ?? `127.0.0.1:${config.TEMPORAL_PORT}`,
              config.TEMPORAL_NAMESPACE,
            ),
        },
        {
          // Phase 8: the counters of the limits, shared in Redis by every instance.
          provide: RATE_LIMIT_STORE,
          inject: [LOGGER],
          useFactory: (logger: Logger) =>
            overrides.rateLimitStore ??
            (config.REDIS_URL
              ? new RedisRateLimitStore(config.REDIS_URL, logger)
              : new MemoryRateLimitStore(clock)),
        },
        DbLifecycle,
      ],
      exports: [
        CONFIG,
        CLOCK,
        DB,
        LOGGER,
        FIELD_CIPHER,
        TOKEN_VERIFIER,
        IDENTITY_ADMIN,
        EMAIL_SENDER,
        SMS_SENDER,
        WEB_PUSH,
        NOTIFICATION_TEMPLATES,
        OBJECT_STORAGE,
        PLATE_LOOKUP,
        DOCUMENT_READER,
        KMS,
        WORKFLOW_SIGNALS,
        SIGNATURE,
        PAYMENTS,
        AI_EXPLAINER,
        E_INVOICING,
        RATE_LIMIT_STORE,
      ],
    };
  }
}
