import { defineConfig } from "vitest/config";

// API integration tests: real PostgreSQL (Testcontainers), locally signed tokens,
// Keycloak administration and email replaced by in-memory doubles.
export default defineConfig({
  test: {
    include: ["test/int/**/*.int.test.ts"],
    globalSetup: ["test/int/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 240_000,
  },
});
