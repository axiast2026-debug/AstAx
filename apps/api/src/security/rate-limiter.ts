import { createHmac } from "node:crypto";
import type { Clock } from "@astax/adapters/clock";
import { settingsAt, SYSTEM_CONTEXT, withContext, type DbClient } from "@astax/db";
import type { Logger } from "@astax/shared/logging";
import type { SettingKey } from "@astax/shared/settings";
import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { ProblemError } from "../http/problem.js";
import type { ApiConfig } from "../config/config.js";
import { CLOCK, CONFIG, DB, LOGGER, RATE_LIMIT_STORE } from "../infra/tokens.js";
import type { RateLimitStore } from "./rate-limit-store.js";

const MINUTE = 60_000;
const HOUR = 3_600_000;

/**
 * Phase 8, proposal F: each limit is a parameter of «Sicurezza e dati».
 *  - public: requests of one IP address to the pages without an account;
 *  - application: entries of agencies and brokers from one IP address;
 *  - code: OTP codes sent to one phone number or address;
 *  - failedAuth: calls with an invalid access token from one IP address.
 */
const BUCKETS = {
  public: { key: "security.publicRequestsPerMinute", windowMs: MINUTE },
  application: { key: "security.publicApplicationsPerHour", windowMs: HOUR },
  code: { key: "security.codesPerDestinationPerHour", windowMs: HOUR },
  failedAuth: { key: "security.failedAuthPerMinute", windowMs: MINUTE },
} as const satisfies Record<string, { key: SettingKey; windowMs: number }>;

export type RateBucket = keyof typeof BUCKETS;

const SETTING_KEYS = Object.values(BUCKETS).map((b) => b.key);
/** A changed limit applies within this time on every instance. */
const SETTINGS_TTL_MS = 30_000;

@Injectable()
export class RateLimiter implements OnApplicationShutdown {
  #limits: { values: Record<string, number>; until: number } | null = null;

  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStore,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  private async limitOf(bucket: RateBucket): Promise<number> {
    const now = this.clock.now();
    if (!this.#limits || this.#limits.until <= now.getTime()) {
      const values = await withContext(this.db, SYSTEM_CONTEXT, (tx) =>
        settingsAt(tx, SETTING_KEYS, now),
      );
      this.#limits = { values, until: now.getTime() + SETTINGS_TTL_MS };
    }
    return this.#limits.values[BUCKETS[bucket].key] ?? Number.POSITIVE_INFINITY;
  }

  /**
   * The counter's key: an HMAC with the blind index key, so an address or a
   * number in Redis cannot be recovered by trying them all (SIC-06).
   */
  private keyOf(bucket: RateBucket, subject: string): string {
    const { windowMs } = BUCKETS[bucket];
    const window = Math.floor(this.clock.now().getTime() / windowMs);
    const hash = createHmac("sha256", this.config.BLIND_INDEX_KEY)
      .update(`${bucket}:${subject}`)
      .digest("base64url");
    return `astax:rl:${bucket}:${hash}:${window}`;
  }

  private refuse(bucket: RateBucket): never {
    const { windowMs } = BUCKETS[bucket];
    const retryAfterSeconds = Math.ceil(
      (windowMs - (this.clock.now().getTime() % windowMs)) / 1000,
    );
    this.logger.warn({ bucket }, "rate limited");
    throw new ProblemError("RATE_LIMITED", undefined, undefined, retryAfterSeconds);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.store.close?.();
  }

  /** Counts one more for `subject`; 429 RATE_LIMITED past the limit. */
  async consume(bucket: RateBucket, subject: string): Promise<void> {
    const limit = await this.limitOf(bucket);
    const count = await this.store.hit(this.keyOf(bucket, subject), BUCKETS[bucket].windowMs);
    if (count > limit) this.refuse(bucket);
  }
}
