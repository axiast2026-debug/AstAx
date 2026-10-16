import { SystemClock, type Clock } from "@astax/adapters/clock";
import { LocalFieldCipher } from "@astax/adapters/crypto";
import { MailpitEmailSender, type EmailSender } from "@astax/adapters/email";
import { KeycloakAdmin } from "@astax/adapters/identity";
import { FakeDocumentReader, type DocumentReaderPort } from "@astax/adapters/document-reader";
import { MailpitSmsSender, type SmsPort } from "@astax/adapters/sms";
import {
  InMemoryObjectStorage,
  S3ObjectStorage,
  type ObjectStoragePort,
} from "@astax/adapters/storage";
import { FakePlateLookup, type PlateLookupPort } from "@astax/adapters/vehicle-data";
import { createDbClient, type DbClient } from "@astax/db";
import { createLogger, type Logger } from "@astax/shared/logging";
import {
  Global,
  Inject,
  Module,
  type DynamicModule,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { JwtTokenVerifier, type TokenVerifier } from "../auth/token-verifier.js";
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
  SMS_SENDER,
  TOKEN_VERIFIER,
} from "./tokens.js";

export interface InfraOverrides {
  clock?: Clock;
  db?: DbClient;
  logger?: Logger;
  tokenVerifier?: TokenVerifier;
  identityAdmin?: IdentityAdmin;
  emailSender?: EmailSender;
  smsSender?: SmsPort;
  objectStorage?: ObjectStoragePort;
  plateLookup?: PlateLookupPort;
  documentReader?: DocumentReaderPort;
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
    const clock = overrides.clock ?? new SystemClock();
    const emailSender =
      overrides.emailSender ??
      new MailpitEmailSender(config.MAILPIT_URL, { email: config.EMAIL_FROM, name: "AstAx" });
    // Vehicle data and document reading: only the fakes until phase 8 (rule 9).
    const plateLookup = overrides.plateLookup ?? new FakePlateLookup(clock);
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
            JwtTokenVerifier.forKeycloak(config.KEYCLOAK_URL, config.KEYCLOAK_REALM, clock),
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
        { provide: SMS_SENDER, useValue: overrides.smsSender ?? new MailpitSmsSender(emailSender) },
        { provide: OBJECT_STORAGE, useValue: overrides.objectStorage ?? objectStorageFor(config) },
        { provide: PLATE_LOOKUP, useValue: plateLookup },
        {
          provide: DOCUMENT_READER,
          useValue: overrides.documentReader ?? new FakeDocumentReader(clock, plateLookup),
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
        OBJECT_STORAGE,
        PLATE_LOOKUP,
        DOCUMENT_READER,
      ],
    };
  }
}
