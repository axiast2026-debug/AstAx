import { defineConfig } from "vitest/config";

// Integration tests against a real PostgreSQL started by Testcontainers.
// Files run one after the other: they share the database.
export default defineConfig({
  test: {
    include: ["test/**/*.int.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
