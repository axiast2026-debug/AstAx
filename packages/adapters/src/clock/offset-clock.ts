import type { Clock } from "./clock.js";

/**
 * Development tool (CLAUDE.md rule 13, DEV_TOOLS only): the application time
 * moved forward by an offset, shared by API and worker through Redis. It never
 * runs in production: both configurations refuse DEV_TOOLS there.
 */
export class OffsetClock implements Clock {
  #offsetMs = 0;

  constructor(private readonly base: Clock) {}

  now(): Date {
    return new Date(this.base.now().getTime() + this.#offsetMs);
  }

  get offsetMs(): number {
    return this.#offsetMs;
  }

  setOffset(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0)
      throw new Error("OffsetClock: the offset only moves forward");
    this.#offsetMs = ms;
  }
}

/** The Redis key holding the offset in milliseconds. */
export const DEV_CLOCK_OFFSET_KEY = "dev:clock-offset-ms";
