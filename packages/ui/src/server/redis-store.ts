import { createClient, type RedisClientType } from "redis";
import type { SessionStore } from "./web-auth.js";

/** Session store on the local Redis (docker compose) or the managed one in the cloud. */
export class RedisSessionStore implements SessionStore {
  #client: Promise<RedisClientType> | undefined;

  constructor(
    private readonly url: string,
    private readonly prefix: string,
  ) {}

  private client(): Promise<RedisClientType> {
    if (!this.#client) {
      const client = createClient({ url: this.url }) as RedisClientType;
      this.#client = client.connect().then(() => client);
      this.#client.catch(() => {
        this.#client = undefined;
      });
    }
    return this.#client;
  }

  async get(key: string): Promise<string | null> {
    return (await this.client()).get(`${this.prefix}${key}`);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await (
      await this.client()
    ).set(`${this.prefix}${key}`, value, { expiration: { type: "EX", value: ttlSeconds } });
  }

  async delete(key: string): Promise<void> {
    await (await this.client()).del(`${this.prefix}${key}`);
  }
}

/** Tests: same contract, in memory, expiry from an injected clock. */
export class MemorySessionStore implements SessionStore {
  readonly #values = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly now: () => number) {}

  async get(key: string): Promise<string | null> {
    const entry = this.#values.get(key);
    if (!entry || entry.expiresAt <= this.now()) return null;
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.#values.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
  }

  async delete(key: string): Promise<void> {
    this.#values.delete(key);
  }
}
