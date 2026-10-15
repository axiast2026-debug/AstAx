import { defineConfig } from "vitest/config";

// Unit tests only; integration tests have their own config (vitest.int.config.ts).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    exclude: ["test/int/**", "**/node_modules/**"],
  },
});
