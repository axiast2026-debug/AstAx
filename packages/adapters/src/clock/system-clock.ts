import type { Clock } from "./clock.js";

/** The only place allowed to read the system clock. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
