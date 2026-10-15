import type { Clock } from "@astax/adapters/clock";
import { dispatchOutbox, type DbClient, type OutboxMessage } from "@astax/db";
import { errorForLog, type Logger } from "@astax/shared/logging";
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { ApiConfig } from "../config/config.js";
import { CLOCK, CONFIG, DB, LOGGER } from "../infra/tokens.js";

/**
 * Delivers outbox events (fase 1, passo 9). In phase 1 nothing consumes them
 * yet: delivery is logged with identifiers only. Notifications (phase 7) and
 * Temporal signals (phase 3) will plug in here; the dispatcher then moves to
 * the worker.
 */
@Injectable()
export class OutboxRunner implements OnApplicationBootstrap, OnApplicationShutdown {
  #timer: NodeJS.Timeout | undefined;
  #running = false;

  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.OUTBOX_DISPATCH_INTERVAL_MS === 0) return;
    this.#timer = setInterval(() => void this.tick(), this.config.OUTBOX_DISPATCH_INTERVAL_MS);
  }

  onApplicationShutdown(): void {
    clearInterval(this.#timer);
  }

  private async deliver(message: OutboxMessage): Promise<void> {
    this.logger.info(
      { outboxId: message.id, type: message.type, attempts: message.attempts },
      "outbox event delivered",
    );
  }

  async tick(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    try {
      const result = await dispatchOutbox(this.db, (m) => this.deliver(m), {
        now: this.clock.now(),
      });
      if (result.failed > 0) this.logger.error({ ...result }, "outbox events failed for good");
    } catch (error) {
      this.logger.error({ err: errorForLog(error) }, "outbox dispatch failed");
    } finally {
      this.#running = false;
    }
  }
}
