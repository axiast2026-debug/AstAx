import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (fase 1, passo 13): real browser, real Keycloak, API, web and
 * admin against the local environment (pnpm infra:up, pnpm db:seed). Running
 * servers are reused; missing ones are started.
 */
export default defineConfig({
  testDir: "specs",
  globalSetup: "./global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "pnpm --filter @astax/api dev",
      url: "http://127.0.0.1:4000/health",
      reuseExistingServer: true,
      timeout: 120_000,
      cwd: "../..",
    },
    {
      // The auction worker (ADR 0008): opens and closes the auctions.
      command: "pnpm --filter @astax/worker dev",
      url: "http://127.0.0.1:4100/",
      reuseExistingServer: true,
      timeout: 120_000,
      cwd: "../..",
    },
    {
      command: "pnpm --filter @astax/web dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 180_000,
      cwd: "../..",
    },
    {
      command: "pnpm --filter @astax/admin dev",
      url: "http://localhost:3001",
      reuseExistingServer: true,
      timeout: 180_000,
      cwd: "../..",
    },
  ],
});
