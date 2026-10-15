import { defineConfig } from "vitest/config";

// Contract tests against real local servers started by Testcontainers
// (SeaweedFS for the S3 storage).
export default defineConfig({
  test: {
    include: ["test/**/*.int.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
