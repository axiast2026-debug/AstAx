import { SystemClock, type Clock } from "@astax/adapters/clock";
import { LocalFieldCipher } from "@astax/adapters/crypto";
import { createDbClient, type DbClient } from "@astax/db";
import { createLogger, type Logger } from "@astax/shared/logging";
import {
  Global,
  Inject,
  Module,
  type DynamicModule,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { ApiConfig } from "../config/config.js";
import { CLOCK, CONFIG, DB, FIELD_CIPHER, LOGGER } from "./tokens.js";

export interface InfraOverrides {
  clock?: Clock;
  db?: DbClient;
  logger?: Logger;
}

class DbLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.$disconnect();
  }
}

/**
 * Configuration, clock, database, logger and field cipher for the whole API.
 * Tests pass overrides (a ManualClock, a test database, an in-memory logger).
 */
@Global()
@Module({})
export class InfraModule {
  static forRoot(config: ApiConfig, overrides: InfraOverrides = {}): DynamicModule {
    return {
      module: InfraModule,
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: CLOCK, useValue: overrides.clock ?? new SystemClock() },
        { provide: DB, useValue: overrides.db ?? createDbClient(config.DATABASE_URL) },
        {
          provide: LOGGER,
          useValue: overrides.logger ?? createLogger({ name: "api", level: config.LOG_LEVEL }),
        },
        {
          provide: FIELD_CIPHER,
          useValue: new LocalFieldCipher(config.FIELD_ENCRYPTION_KEY, config.BLIND_INDEX_KEY),
        },
        DbLifecycle,
      ],
      exports: [CONFIG, CLOCK, DB, LOGGER, FIELD_CIPHER],
    };
  }
}
