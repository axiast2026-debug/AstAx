import { astaxConfig } from "@astax/config/eslint";

export default [
  ...astaxConfig(),
  {
    // Inside a Temporal workflow `Date.now()` is the workflow's deterministic
    // time, replayed from the history: it is the clock of the workflow (rule 6).
    files: ["src/workflows/**/*.ts"],
    rules: { "astax/no-system-time": "off" },
  },
];
