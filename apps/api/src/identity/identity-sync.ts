import type { Clock } from "@astax/adapters/clock";
import { SYSTEM_CONTEXT, withContext, type DbClient } from "@astax/db";
import type { Logger } from "@astax/shared/logging";
import { requireSettingAt, type SettingVersion } from "@astax/shared/settings";
import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import type { ApiConfig } from "../config/config.js";
import { CLOCK, CONFIG, DB, IDENTITY_ADMIN, LOGGER } from "../infra/tokens.js";
import {
  applyIdentitySettings,
  IDENTITY_SETTING_KEYS,
  type IdentitySettingValues,
} from "./apply-identity-settings.js";
import type { IdentityAdmin } from "./identity-admin.js";

/**
 * At start-up the API writes the session and OTP parameters in force to Keycloak,
 * so the values in the realm file are only a starting point (CLAUDE.md rule 7,
 * SIC-05). Changes made later are applied by SettingsService when saved.
 */
@Injectable()
export class IdentitySync implements OnApplicationBootstrap {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(IDENTITY_ADMIN) private readonly identity: IdentityAdmin,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.IDENTITY_SYNC_ON_START) return;
    try {
      await this.apply();
    } catch (error) {
      // The API keeps running; the next parameter change or restart applies them.
      this.logger.error({ err: error }, "identity parameters not applied to Keycloak at start-up");
    }
  }

  async apply(): Promise<void> {
    const versions = await withContext(this.db, SYSTEM_CONTEXT, (tx) =>
      tx.setting.findMany({ where: { key: { in: [...IDENTITY_SETTING_KEYS] } } }),
    );
    const now = this.clock.now();
    const values = Object.fromEntries(
      IDENTITY_SETTING_KEYS.map((key) => [
        key,
        requireSettingAt(versions as unknown as SettingVersion[], key, now),
      ]),
    ) as unknown as IdentitySettingValues;
    await applyIdentitySettings(this.identity, values);
    this.logger.info("identity parameters applied to Keycloak");
  }
}
