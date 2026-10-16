import { defineConfig } from "vitest/config";

// Activities against a real PostgreSQL (Testcontainers), with the fake KMS.
export default defineConfig({
  test: {
    include: ["test/int/**/*.int.test.ts"],
    globalSetup: ["test/int/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 240_000,
  },
});
