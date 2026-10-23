import { defineConfig, devices } from "@playwright/test";

/**
 * UX review (docs/ux-review): the measurement of the flows, screen by screen,
 * against the local environment already running (pnpm infra:up, api, worker,
 * web, admin, pnpm db:seed). Not part of the CI suite: it is slow and writes
 * screenshots under docs/ux-review/<date>/. Run with
 * `pnpm exec playwright test --config ux-review.config.ts` from tests/e2e.
 */
export default defineConfig({
  testDir: "ux-review",
  globalSetup: "./global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: Number(process.env.UX_TIMEOUT ?? 900_000),
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: "list",
  use: {
    locale: "it-IT",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    timezoneId: "Europe/Rome",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
  },
});
