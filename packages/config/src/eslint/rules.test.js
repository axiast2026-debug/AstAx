import { RuleTester, ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { afterAll, describe, expect, it } from "vitest";
import { astaxConfig } from "./index.js";
import { noSystemTime } from "./rules/no-system-time.js";
import { noUiLiterals } from "./rules/no-ui-literals.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.afterAll = afterAll;

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

tester.run("no-system-time", noSystemTime, {
  valid: [
    "const d = new Date('2026-11-16T09:00:00Z');",
    "const d = new Date(clock.now().getTime());",
    "const now = clock.now();",
    "const t = Date.UTC(2026, 10, 16);",
  ],
  invalid: [
    { code: "const t = Date.now();", errors: [{ messageId: "systemTime" }] },
    { code: "const d = new Date();", errors: [{ messageId: "systemTime" }] },
    { code: "const s = Date();", errors: [{ messageId: "systemTime" }] },
  ],
});

tester.run("no-ui-literals", noUiLiterals, {
  valid: [
    "const a = <p>{t('home.title')}</p>;",
    "const a = <p> · </p>;",
    "const a = <p>{1234}</p>;",
    "const a = <p>{ok ? t('yes') : t('no')}</p>;",
    "const a = <p>{value ?? ''}</p>;",
    "const a = <input type='text' className='w-full' placeholder={t('form.plate')} />;",
  ],
  invalid: [
    { code: "const a = <p>Benvenuto</p>;", errors: [{ messageId: "literal" }] },
    { code: "const a = <p>{'Asta aperta'}</p>;", errors: [{ messageId: "literal" }] },
    { code: "const a = <p>{`Offerte: ${n}`}</p>;", errors: [{ messageId: "literal" }] },
    { code: "const a = <input placeholder='Targa' />;", errors: [{ messageId: "literal" }] },
    { code: "const a = <img alt={'Logo AstAx'} />;", errors: [{ messageId: "literal" }] },
    { code: "const a = <p>{ok ? 'Sì' : t('no')}</p>;", errors: [{ messageId: "literal" }] },
    { code: "const a = <p>{error && 'Errore'}</p>;", errors: [{ messageId: "literal" }] },
    { code: "const a = <p>{name ?? 'Anonimo'}</p>;", errors: [{ messageId: "literal" }] },
  ],
});

describe("shared config", () => {
  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: astaxConfig() });
  const ruleIds = async (code, filePath) => {
    const [result] = await eslint.lintText(code, { filePath });
    return result.messages.map((m) => m.ruleId);
  };

  it("blocks the system clock in domain code", async () => {
    const ids = await ruleIds("export const t = Date.now();\n", "packages/shared/src/domain/x.ts");
    expect(ids).toContain("astax/no-system-time");
  });

  it("allows the system clock only in the system Clock adapter", async () => {
    const ids = await ruleIds(
      "export const t = (): Date => new Date();\n",
      "packages/adapters/src/clock/system-clock.ts",
    );
    expect(ids).not.toContain("astax/no-system-time");
  });

  it("blocks hard-coded text in components", async () => {
    const ids = await ruleIds(
      "export const A = () => <h1>Le mie richieste</h1>;\n",
      "apps/web/src/components/a.tsx",
    );
    expect(ids).toContain("astax/no-ui-literals");
  });

  it("blocks explicit any", async () => {
    const ids = await ruleIds("export const x: any = 1;\n", "packages/shared/src/x.ts");
    expect(ids).toContain("@typescript-eslint/no-explicit-any");
  });
});
