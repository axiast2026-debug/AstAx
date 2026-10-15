import type { Clock } from "./clock.js";

/**
 * Clock moved by hand, for tests and for the development tools
 * (enabled only with DEV_TOOLS=true, CLAUDE.md rule 13).
 */
export class ManualClock implements Clock {
  #current: number;

  constructor(start: Date | string) {
    this.#current = new Date(start).getTime();
    if (Number.isNaN(this.#current)) throw new Error("ManualClock: invalid start time");
  }

  now(): Date {
    return new Date(this.#current);
  }

  set(at: Date | string): void {
    const next = new Date(at).getTime();
    if (Number.isNaN(next)) throw new Error("ManualClock: invalid time");
    this.#current = next;
  }

  advanceMs(ms: number): void {
    this.#current += ms;
  }

  advanceMinutes(minutes: number): void {
    this.advanceMs(minutes * 60_000);
  }
}
