import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { noSystemTime } from "./rules/no-system-time.js";
import { noUiLiterals } from "./rules/no-ui-literals.js";

export const astaxPlugin = {
  meta: { name: "eslint-plugin-astax" },
  rules: {
    "no-system-time": noSystemTime,
    "no-ui-literals": noUiLiterals,
  },
};

/** Files allowed to read the system clock: only the system Clock adapter. */
export const SYSTEM_CLOCK_FILES = ["**/src/clock/system-clock.ts"];

/**
 * Shared flat config for every workspace package.
 * @returns {import("eslint").Linter.Config[]}
 */
export function astaxConfig() {
  return [
    {
      ignores: [
        "**/dist/**",
        "**/.next/**",
        "**/.turbo/**",
        "**/coverage/**",
        "**/node_modules/**",
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.strict,
    {
      plugins: { astax: astaxPlugin },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: {
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/consistent-type-imports": "error",
        // NestJS modules are decorated classes without members.
        "@typescript-eslint/no-extraneous-class": ["error", { allowWithDecorator: true }],
        "astax/no-system-time": "error",
      },
    },
    {
      files: ["**/*.jsx", "**/*.tsx"],
      rules: { "astax/no-ui-literals": "error" },
    },
    {
      files: SYSTEM_CLOCK_FILES,
      rules: { "astax/no-system-time": "off" },
    },
  ];
}
