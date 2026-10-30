import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ObjectStoragePort } from "@astax/adapters/storage";
import { DEMO_REPLACEMENT } from "@astax/shared/domain";
import type { DbTransaction } from "../client.js";

/**
 * The real companies of the demo (ADR 0028), loaded only with
 * DEMO_COMPANIES=true instead of the invented ones (rule 11).
 */
export interface DemoCompany {
  slug: string;
  name: string;
  group: string | null;
  website: string;
  ivassCode: string | null;
}

/** seed/compagnie-demo.json, the list Dan gave. */
export function readDemoCompanies(repoRoot: string): DemoCompany[] {
  const file = JSON.parse(readFileSync(join(repoRoot, "seed", "compagnie-demo.json"), "utf8")) as {
    companies: DemoCompany[];
  };
  return file.companies.map(({ slug, name, group, website, ivassCode }) => ({
    slug,
    name,
    group: group ?? null,
    website,
    ivassCode: ivassCode ?? null,
  }));
}

/**
 * Mandates of the synthetic agencies in the demo: the replacements of the
 * invented ones first (so the scenarios keep their shape), then more real
 * companies, 2 to 5 each, the large ones more often. Every company has at
 * least one agency.
 */
export const DEMO_AGENCY_MANDATES: Record<string, readonly string[]> = {
  uno: ["unipol", "generali", "cattolica", "reale-mutua"],
  due: ["unipol", "zurich"],
  tre: ["generali", "allianz", "vittoria", "sara", "bene"],
  quattro: ["allianz", "helvetia", "itas"],
  cinque: ["generali", "axa", "groupama"],
  sei: ["unipol", "italiana", "hdi"],
  sette: ["generali", "tua", "verti"],
  otto: ["allianz", "nobis", "assimoco", "prima"],
  nove: ["axa", "euroherc"],
  dieci: ["unipol", "axa", "allianz", "adriatic"],
};

/** The logo of seed/loghi: the SVG when there is one, else the 240 px PNG. */
function logoFile(
  repoRoot: string,
  slug: string,
): { path: string; ext: string; contentType: string } | null {
  for (const [ext, contentType] of [
    ["svg", "image/svg+xml"],
    ["png", "image/png"],
  ] as const) {
    const path = join(repoRoot, "seed", "loghi", `${slug}.${ext}`);
    if (existsSync(path)) return { path, ext, contentType };
  }
  return null;
}

/** The S3 key of a company's logo: public, not personal data (ADR 0028). */
export const companyLogoKey = (slug: string, ext: string) => `public/companies/${slug}.${ext}`;

/**
 * Loads the real companies and their logos. An invented company already in
 * the database becomes its real replacement (same row: mandates, products,
 * offers and policies follow it); an invented company left over is removed.
 * Returns the id of each company by slug.
 */
export async function seedDemoCompanies(
  tx: DbTransaction,
  input: {
    companies: DemoCompany[];
    repoRoot: string;
    storage: ObjectStoragePort;
    idOf: (slug: string) => string;
  },
): Promise<Map<string, string>> {
  for (const [invented, real] of Object.entries(DEMO_REPLACEMENT)) {
    const old = await tx.insuranceCompany.findUnique({ where: { name: invented } });
    if (!old) continue;
    const taken = await tx.insuranceCompany.findUnique({ where: { name: real } });
    if (!taken) {
      await tx.insuranceCompany.update({ where: { id: old.id }, data: { name: real } });
      await tx.insuranceProduct.updateMany({
        where: { companyId: old.id, name: `RC Auto ${invented.replace("Compagnia ", "")}` },
        data: { name: `RC Auto ${real}` },
      });
    } else {
      // Both exist: the invented one may go only if nothing points to it.
      await tx.insuranceCompany.delete({ where: { id: old.id } });
    }
  }

  const ids = new Map<string, string>();
  for (const company of input.companies) {
    const logo = logoFile(input.repoRoot, company.slug);
    let logoKey: string | null = null;
    if (logo) {
      logoKey = companyLogoKey(company.slug, logo.ext);
      await input.storage.put({
        key: logoKey,
        body: readFileSync(logo.path),
        contentType: logo.contentType,
      });
    }
    const data = {
      group: company.group,
      website: company.website,
      ivassCode: company.ivassCode,
      logoKey,
    };
    const row = await tx.insuranceCompany.upsert({
      where: { name: company.name },
      create: { id: input.idOf(company.slug), name: company.name, ...data },
      // A logo replaced from the back office is kept.
      update: { group: data.group, website: data.website, ivassCode: data.ivassCode },
    });
    if (!row.logoKey && logoKey) {
      await tx.insuranceCompany.update({ where: { id: row.id }, data: { logoKey } });
    }
    ids.set(company.slug, row.id);
  }
  return ids;
}
