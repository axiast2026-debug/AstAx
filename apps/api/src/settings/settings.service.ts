import type { Clock } from "@astax/adapters/clock";
import { recordDomainEvent, withContext, type DbClient } from "@astax/db";
import type { Logger } from "@astax/shared/logging";
import {
  isSettingKey,
  planSettingChange,
  requireSettingAt,
  SETTING_KEYS,
  type SettingKey,
  type SettingVersion,
} from "@astax/shared/settings";
import { Inject, Injectable } from "@nestjs/common";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import {
  applyIdentitySettings,
  IDENTITY_SETTING_KEYS,
  isIdentitySetting,
  type IdentitySettingValues,
} from "../identity/apply-identity-settings.js";
import type { IdentityAdmin } from "../identity/identity-admin.js";
import { CLOCK, DB, IDENTITY_ADMIN, LOGGER } from "../infra/tokens.js";

type Row = {
  key: string;
  value: unknown;
  version: number;
  validFrom: Date;
  changedByUserId: string | null;
  reason: string | null;
};

const toVersion = (row: Row): SettingVersion =>
  ({
    key: row.key as SettingKey,
    value: row.value,
    version: row.version,
    validFrom: row.validFrom,
    changedBy: row.changedByUserId,
    reason: row.reason,
  }) as SettingVersion;

/** Parameters with full history, read by date (fase 1, passo 10; ASTA-09). */
@Injectable()
export class SettingsService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(IDENTITY_ADMIN) private readonly identity: IdentityAdmin,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  private async versions(auth: AuthContext, keys?: readonly string[]): Promise<SettingVersion[]> {
    const rows = await withContext(this.db, auth.db, (tx) =>
      tx.setting.findMany({
        where: keys ? { key: { in: [...keys] } } : {},
        orderBy: [{ key: "asc" }, { version: "asc" }],
      }),
    );
    return rows.map(toVersion);
  }

  /** Values in force at `at` (now by default). */
  async valuesAt(auth: AuthContext, at: Date = this.clock.now()) {
    const versions = await this.versions(auth);
    return SETTING_KEYS.map((key) => {
      const current = versions.filter((v) => v.key === key && v.validFrom <= at).at(-1);
      return current
        ? {
            key,
            value: current.value,
            version: current.version,
            validFrom: current.validFrom.toISOString(),
          }
        : { key, value: null, version: 0, validFrom: null };
    });
  }

  async history(auth: AuthContext, key: string) {
    if (!isSettingKey(key)) throw new ProblemError("NOT_FOUND");
    return (await this.versions(auth, [key])).map((v) => ({
      version: v.version,
      value: v.value,
      validFrom: v.validFrom.toISOString(),
      changedBy: v.changedBy,
      reason: v.reason,
    }));
  }

  /**
   * New version with author and reason; the previous one stays in the history.
   * Session and OTP parameters are pushed to Keycloak right away (SIC-05).
   */
  async change(
    auth: AuthContext,
    key: string,
    input: { value: unknown; reason: string; validFrom?: Date },
  ) {
    if (!isSettingKey(key)) throw new ProblemError("NOT_FOUND");
    const validFrom = input.validFrom ?? this.clock.now();
    const next = await withContext(this.db, auth.db, async (tx) => {
      const rows = await tx.setting.findMany({ where: { key }, orderBy: { version: "asc" } });
      const current = rows.length > 0 ? toVersion(rows[rows.length - 1] as Row) : undefined;
      let planned;
      try {
        planned = planSettingChange(current as SettingVersion<typeof key> | undefined, {
          key,
          value: input.value,
          validFrom,
          changedBy: auth.userId,
          reason: input.reason,
        });
      } catch {
        throw new ProblemError(
          "VALIDATION_FAILED",
          "Invalid value, reason or validity date for this parameter",
        );
      }
      const row = await tx.setting.create({
        data: {
          key,
          value: planned.value as never,
          version: planned.version,
          validFrom: planned.validFrom,
          changedByUserId: auth.userId,
          reason: planned.reason,
        },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "SETTING_CHANGED",
        targetType: "Setting",
        targetId: key,
        before: current ? { version: current.version, value: current.value } : null,
        after: {
          version: planned.version,
          value: planned.value,
          validFrom: planned.validFrom.toISOString(),
        },
        reason: planned.reason,
      });
      await recordDomainEvent(tx, {
        aggregateType: "Setting",
        aggregateId: row.id,
        type: "setting.changed",
        at: this.clock.now(),
        actorUserId: auth.userId,
        data: { key, version: planned.version },
      });
      return planned;
    });

    if (isIdentitySetting(key) && validFrom <= this.clock.now())
      await this.pushIdentitySettings(auth);
    return {
      key,
      version: next.version,
      value: next.value,
      validFrom: next.validFrom.toISOString(),
    };
  }

  private async pushIdentitySettings(auth: AuthContext): Promise<void> {
    const versions = await this.versions(auth, IDENTITY_SETTING_KEYS);
    const now = this.clock.now();
    const values = Object.fromEntries(
      IDENTITY_SETTING_KEYS.map((key) => [key, requireSettingAt(versions, key, now)]),
    ) as unknown as IdentitySettingValues;
    try {
      await applyIdentitySettings(this.identity, values);
    } catch (error) {
      // The version is saved; the sync script or the next change re-applies it.
      this.logger.error({ err: error }, "identity settings not applied to Keycloak");
      throw new ProblemError("INTERNAL", "Saved, but not yet applied to the login service");
    }
  }
}
