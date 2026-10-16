import { defineConfig } from "vitest/config";

// Unit and workflow tests (Temporal time-skipping environment, fake activities);
// activities against PostgreSQL have their own config (vitest.int.config.ts).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    exclude: ["test/int/**", "**/node_modules/**"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
