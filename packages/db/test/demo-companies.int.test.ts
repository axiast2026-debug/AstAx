import { LocalFieldCipher } from "@astax/adapters/crypto";
import { InMemoryObjectStorage } from "@astax/adapters/storage";
import { DEMO_COMPANY_NAMES, INVENTED_COMPANY_NAMES } from "@astax/shared/domain";
import { findRepoRoot } from "@astax/shared/env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SYSTEM_CONTEXT, withContext, type DbClient, type DbTransaction } from "../src/index.js";
import { DEMO_AGENCY_MANDATES, readDemoCompanies } from "../src/seed/demo-companies.js";
import { seedSynthetic, syntheticId } from "../src/seed/synthetic.js";
import { appDb } from "./fixtures.js";

// The seed of seed.int.test.ts: the organizations are the same rows, whichever file runs first.
const SEED = "seed-test";
const cipher = new LocalFieldCipher("1".repeat(64), "2".repeat(64));
const repoRoot = findRepoRoot(import.meta.dirname);
const companies = readDemoCompanies(repoRoot);
let db: DbClient;

/** The files share the database: the demo seed runs in a transaction that is rolled back. */
class Rollback extends Error {}
async function inRolledBack(check: (tx: DbTransaction) => Promise<void>): Promise<void> {
  await withContext(
    db,
    SYSTEM_CONTEXT,
    async (tx) => {
      await check(tx);
      throw new Rollback();
    },
    { timeoutMs: 120_000 },
  ).catch((error: unknown) => {
    if (!(error instanceof Rollback)) throw error;
  });
}

beforeAll(() => {
  db = appDb();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("ADR 0028: real companies in the demo, invented ones elsewhere (rule 11)", () => {
  it("the list of the fakes is the one of seed/compagnie-demo.json", () => {
    expect(companies.map((c) => c.name)).toEqual([...DEMO_COMPANY_NAMES]);
    expect(companies).toHaveLength(22);
  });

  it("without DEMO_COMPANIES the seed loads only the invented companies", async () => {
    await inRolledBack(async (tx) => {
      await seedSynthetic(tx, cipher, SEED);
      const names = (await tx.insuranceCompany.findMany()).map((c) => c.name);
      expect(names).toEqual(expect.arrayContaining([...INVENTED_COMPANY_NAMES]));
      expect(names.filter((n) => (DEMO_COMPANY_NAMES as readonly string[]).includes(n))).toEqual(
        [],
      );
    });
  });

  it("with DEMO_COMPANIES the seed loads the 22 real companies, with their logos, and no invented one", async () => {
    const storage = new InMemoryObjectStorage();
    await inRolledBack(async (tx) => {
      // A database that already has the invented companies, as the online demo.
      await seedSynthetic(tx, cipher, SEED);
      await seedSynthetic(tx, cipher, SEED, { companies, repoRoot, storage });

      const rows = await tx.insuranceCompany.findMany();
      const names = rows.map((c) => c.name);
      expect(names).toEqual(expect.arrayContaining([...DEMO_COMPANY_NAMES]));
      expect(
        names.filter((n) => (INVENTED_COMPANY_NAMES as readonly string[]).includes(n)),
      ).toEqual([]);
      const products = await tx.insuranceProduct.findMany({ select: { name: true } });
      expect(products.filter((p) => /Alfa|Beta|Gamma|Delta/.test(p.name))).toEqual([]);

      const real = rows.filter((c) => (DEMO_COMPANY_NAMES as readonly string[]).includes(c.name));
      expect(real.every((c) => c.website?.startsWith("https://"))).toBe(true);
      const withoutLogo = real.filter((c) => c.logoKey === null).map((c) => c.name);
      expect(withoutLogo.sort()).toEqual(["Assimoco", "ITAS Mutua", "Tua Assicurazioni"]);
      for (const c of real.filter((r) => r.logoKey)) {
        expect(c.logoKey).toMatch(/^public\/companies\/[a-z-]+\.(svg|png)$/);
        expect((await storage.get(c.logoKey ?? "")).length).toBeGreaterThan(100);
      }

      // Every agency of the demo has 2 to 5 mandates, all from real companies.
      const realIds = new Set(real.map((c) => c.id));
      for (const agency of Object.keys(DEMO_AGENCY_MANDATES)) {
        const mandates = await tx.agencyMandate.findMany({
          where: { organizationId: syntheticId(SEED, "org", `agenzia-${agency}`) },
        });
        const fromReal = mandates.filter((m) => realIds.has(m.companyId));
        expect(fromReal.length).toBeGreaterThanOrEqual(2);
        expect(fromReal.length).toBeLessThanOrEqual(5);
        expect(fromReal.length).toBe(mandates.length);
      }
    });
  });
});
