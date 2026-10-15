import { SystemClock, type Clock } from "@astax/adapters/clock";
import { LocalFieldCipher } from "@astax/adapters/crypto";
import { MailpitEmailSender, type EmailSender } from "@astax/adapters/email";
import { KeycloakAdmin } from "@astax/adapters/identity";
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
  IDENTITY_ADMIN,
  LOGGER,
  TOKEN_VERIFIER,
} from "./tokens.js";

export interface InfraOverrides {
  clock?: Clock;
  db?: DbClient;
  logger?: Logger;
  tokenVerifier?: TokenVerifier;
  identityAdmin?: IdentityAdmin;
  emailSender?: EmailSender;
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
        {
          provide: EMAIL_SENDER,
          useValue:
            overrides.emailSender ??
            new MailpitEmailSender(config.MAILPIT_URL, { email: config.EMAIL_FROM, name: "AstAx" }),
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
      ],
    };
  }
}
