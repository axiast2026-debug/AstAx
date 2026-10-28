import { PACKAGE_CODES } from "@astax/shared/domain";
import { loadNotificationTemplates } from "@astax/shared/notifications";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSeedSettings } from "@astax/shared/settings";
import { z } from "zod";
import type { DbTransaction } from "../client.js";
import { seedNotificationTemplates } from "../notification-templates.js";
import { parseSemicolonCsv } from "./csv.js";
import { LEGAL_PLACEHOLDERS, placeholderContent } from "./legal-placeholders.js";

/** validFrom of the first version of every parameter, list and legal text. */
export const SEED_VALID_FROM = new Date("2026-01-01T00:00:00.000Z");

const listsFileSchema = z.object({
  schemaVersion: z.literal(1),
  lists: z.record(
    z.string(),
    z.array(
      z.looseObject({
        code: z.string(),
        it: z.string(),
        phase: z.number().optional(),
        blockingInWizard: z.boolean().optional(),
      }),
    ),
  ),
});

const packagesFileSchema = z.object({
  schemaVersion: z.literal(1),
  packages: z.array(
    z.object({
      code: z.enum(PACKAGE_CODES),
      name: z.string(),
      version: z.number().int().min(1),
      requirements: z.record(z.string(), z.unknown()),
      customerText: z.object({ it: z.string() }),
    }),
  ),
});

const holidaysFileSchema = z.object({
  schemaVersion: z.literal(1),
  fixed: z.array(z.object({ monthDay: z.string().regex(/^\d{2}-\d{2}$/), name: z.string() })),
  movable: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), name: z.string() })),
  seedYears: z.array(z.number().int()),
});

function readSeedFile(repoRoot: string, name: string): unknown {
  return JSON.parse(readFileSync(join(repoRoot, "seed", name), "utf8"));
}

/** seed/cap.csv, written by `pnpm reference:postal-codes` from GeoNames (seed/FONTI.md). */
export function readPostalCodes(repoRoot: string): { istatCode: string; caps: string }[] {
  const [header, ...rows] = parseSemicolonCsv(
    readFileSync(join(repoRoot, "seed", "cap.csv"), "utf8"),
  );
  if (header?.join(";") !== "istat;cap") throw new Error("Unexpected seed/cap.csv header");
  return rows
    .filter(([istat, caps]) => /^\d{6}$/.test(istat ?? "") && /^\d{5}(\|\d{5})*$/.test(caps ?? ""))
    .map(([istatCode = "", caps = ""]) => ({ istatCode, caps }));
}

/** seed/comuni.csv, written by `pnpm reference:municipalities` from the ISTAT list. */
export function readMunicipalities(
  repoRoot: string,
): { istatCode: string; cadastralCode: string; province: string; name: string }[] {
  const [header, ...rows] = parseSemicolonCsv(
    readFileSync(join(repoRoot, "seed", "comuni.csv"), "utf8"),
  );
  if (header?.join(";") !== "istat;cadastral;province;name")
    throw new Error("Unexpected seed/comuni.csv header");
  return rows.map(([istatCode = "", cadastralCode = "", province = "", name = ""]) => ({
    istatCode,
    cadastralCode,
    province,
    name,
  }));
}

export interface ReferenceCounts {
  settings: number;
  notificationTemplates: number;
  listValues: number;
  holidays: number;
  legalDocuments: number;
  municipalities: number;
  exclusionRules: number;
  coveragePackages: number;
}

/**
 * Loads seed/parametri.json, elenchi.json, festivita.json and the legal
 * placeholders. Safe to run again: existing rows are kept, missing ones added.
 */
export async function seedReference(tx: DbTransaction, repoRoot: string): Promise<ReferenceCounts> {
  const settings = parseSeedSettings(readSeedFile(repoRoot, "parametri.json"));
  for (const setting of settings) {
    const exists = await tx.setting.findFirst({
      where: { key: setting.key },
      select: { id: true },
    });
    if (exists) continue;
    await tx.setting.create({
      data: {
        key: setting.key,
        value: setting.value as never,
        version: 1,
        validFrom: SEED_VALID_FROM,
        reason: "Valore iniziale da seed/parametri.json",
      },
    });
  }

  const lists = listsFileSchema.parse(readSeedFile(repoRoot, "elenchi.json")).lists;
  let listValues = 0;
  for (const [listKey, entries] of Object.entries(lists)) {
    for (const [sortOrder, entry] of entries.entries()) {
      // Entries marked phase 2 stay inactive in the MVP.
      const active = entry.phase === undefined || entry.phase <= 1;
      await tx.listValue.upsert({
        where: { listKey_code: { listKey, code: entry.code } },
        create: {
          listKey,
          code: entry.code,
          labelIt: entry.it,
          active,
          sortOrder,
        },
        update: {},
      });
      listValues += 1;
    }
  }

  // Excluded cases (ASTA-10): the list entries also carry blockingInWizard.
  const exclusionCases = lists.exclusionCase ?? [];
  for (const entry of exclusionCases) {
    if (entry.blockingInWizard === undefined)
      throw new Error(`exclusionCase ${entry.code}: blockingInWizard missing`);
    await tx.exclusionRule.upsert({
      where: { code: entry.code },
      create: {
        code: entry.code,
        blockingInWizard: entry.blockingInWizard,
        messageIt: entry.it,
        active: entry.phase === undefined || entry.phase <= 1,
      },
      update: {},
    });
    await tx.exclusionRuleVersion.upsert({
      where: { code_version: { code: entry.code, version: 1 } },
      create: {
        code: entry.code,
        version: 1,
        blockingInWizard: entry.blockingInWizard,
        messageIt: entry.it,
        active: entry.phase === undefined || entry.phase <= 1,
      },
      update: {},
    });
  }

  const packages = packagesFileSchema.parse(readSeedFile(repoRoot, "pacchetti.json")).packages;
  for (const pkg of packages) {
    await tx.coveragePackage.upsert({
      where: { code: pkg.code },
      create: { code: pkg.code, name: pkg.name },
      update: {},
    });
    await tx.coveragePackageVersion.upsert({
      where: { packageCode_version: { packageCode: pkg.code, version: pkg.version } },
      create: {
        packageCode: pkg.code,
        version: pkg.version,
        requirements: pkg.requirements as never,
        customerTextIt: pkg.customerText.it,
        validFrom: SEED_VALID_FROM,
      },
      update: {},
    });
  }

  const municipalities = readMunicipalities(repoRoot);
  await tx.municipality.createMany({ data: municipalities, skipDuplicates: true });
  // The CAPs also on a database seeded before them: one statement for all.
  const postalCodes = readPostalCodes(repoRoot);
  await tx.$executeRaw`
    UPDATE "Municipality" AS m SET "postalCodes" = string_to_array(v.caps, '|')
    FROM unnest(${postalCodes.map((p) => p.istatCode)}::text[], ${postalCodes.map((p) => p.caps)}::text[]) AS v(code, caps)
    WHERE m."istatCode" = v.code AND m."postalCodes" IS DISTINCT FROM string_to_array(v.caps, '|')`;

  const holidaysFile = holidaysFileSchema.parse(readSeedFile(repoRoot, "festivita.json"));
  const holidays = [
    ...holidaysFile.seedYears.flatMap((year) =>
      holidaysFile.fixed.map((h) => ({ date: `${year}-${h.monthDay}`, name: h.name })),
    ),
    ...holidaysFile.movable,
  ];
  for (const holiday of holidays) {
    const date = new Date(`${holiday.date}T00:00:00.000Z`);
    await tx.holiday.upsert({ where: { date }, create: { date, name: holiday.name }, update: {} });
  }

  for (const doc of LEGAL_PLACEHOLDERS) {
    const document = await tx.legalDocument.upsert({
      where: { key: doc.key },
      create: {
        key: doc.key,
        title: doc.title,
        audiences: doc.audiences,
        moment: doc.moment,
        channel: doc.channel,
      },
      // Who signs a document is decided here (ADR 0015 widened the declaration to agencies).
      update: { audiences: doc.audiences },
    });
    await tx.legalDocumentVersion.upsert({
      where: { documentId_number: { documentId: document.id, number: 1 } },
      create: {
        documentId: document.id,
        number: 1,
        contentMd: placeholderContent(doc.title),
        status: "DRAFT",
        publishedAt: SEED_VALID_FROM,
      },
      update: {},
    });
  }

  // Phase 7: the texts of the notifications, editable from then on by the administrator.
  const notificationTemplates = await seedNotificationTemplates(
    tx,
    loadNotificationTemplates(repoRoot),
  );

  return {
    settings: settings.length,
    notificationTemplates,
    listValues,
    holidays: holidays.length,
    legalDocuments: LEGAL_PLACEHOLDERS.length,
    municipalities: municipalities.length,
    exclusionRules: exclusionCases.length,
    coveragePackages: packages.length,
  };
}
