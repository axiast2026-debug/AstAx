import type { Clock } from "@astax/adapters/clock";
import { errorForLog, type Logger } from "@astax/shared/logging";
import { createClient } from "redis";

/**
 * Counters of fixed time windows. `hit` adds one to the counter of `key` and
 * returns the new value; the counter disappears when its window ends.
 */
export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<number>;
  peek(key: string): Promise<number>;
  close?(): Promise<void>;
}

/** One API process (tests, development without Redis). */
export class MemoryRateLimitStore implements RateLimitStore {
  readonly #counters = new Map<string, { count: number; expiresAt: number }>();

  constructor(private readonly clock: Clock) {}

  async hit(key: string, windowMs: number): Promise<number> {
    const now = this.clock.now().getTime();
    if (this.#counters.size > 10_000) {
      for (const [k, c] of this.#counters) if (c.expiresAt <= now) this.#counters.delete(k);
    }
    const current = this.#counters.get(key);
    const next =
      current && current.expiresAt > now
        ? { count: current.count + 1, expiresAt: current.expiresAt }
        : { count: 1, expiresAt: now + windowMs };
    this.#counters.set(key, next);
    return next.count;
  }

  async peek(key: string): Promise<number> {
    const current = this.#counters.get(key);
    return current && current.expiresAt > this.clock.now().getTime() ? current.count : 0;
  }
}

/**
 * Shared by every API instance (phase 8, more than one container). If Redis
 * does not answer the request goes through: a limit must not stop the service.
 */
export class RedisRateLimitStore implements RateLimitStore {
  readonly #client;
  #ready: Promise<unknown> | null = null;

  constructor(
    url: string,
    private readonly logger: Logger,
  ) {
    this.#client = createClient({ url });
    this.#client.on("error", (error: unknown) =>
      this.logger.warn({ err: errorForLog(error) }, "rate limit redis error"),
    );
  }

  private connected(): Promise<unknown> {
    this.#ready ??= this.#client.connect().catch((error: unknown) => {
      this.#ready = null;
      throw error;
    });
    return this.#ready;
  }

  async hit(key: string, windowMs: number): Promise<number> {
    try {
      await this.connected();
      const count = await this.#client.incr(key);
      if (count === 1) await this.#client.pExpire(key, windowMs);
      return count;
    } catch (error) {
      this.logger.warn({ err: errorForLog(error) }, "rate limit not counted");
      return 0;
    }
  }

  async peek(key: string): Promise<number> {
    try {
      await this.connected();
      return Number((await this.#client.get(key)) ?? 0);
    } catch {
      return 0;
    }
  }

  async close(): Promise<void> {
    if (this.#client.isOpen) await this.#client.quit();
  }
}
