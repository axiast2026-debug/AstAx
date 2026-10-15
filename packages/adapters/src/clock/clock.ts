/** Source of the current time. Domain code never reads the system clock (CLAUDE.md rule 6). */
export interface Clock {
  now(): Date;
}
