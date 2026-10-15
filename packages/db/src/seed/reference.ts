import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSeedSettings } from "@astax/shared/settings";
import { z } from "zod";
import type { DbTransaction } from "../client.js";
import { LEGAL_PLACEHOLDERS, placeholderContent } from "./legal-placeholders.js";

/** validFrom of the first version of every parameter, list and legal text. */
export const SEED_VALID_FROM = new Date("2026-01-01T00:00:00.000Z");

const listsFileSchema = z.object({
  schemaVersion: z.literal(1),
  lists: z.record(
    z.string(),
    z.array(
      z.looseObject({ code: z.string(), it: z.string(), sq: z.string(), phase: z.number().optional() }),
    ),
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

export interface ReferenceCounts {
  settings: number;
  listValues: number;
  holidays: number;
  legalDocuments: number;
}

/**
 * Loads seed/parametri.json, elenchi.json, festivita.json and the legal
 * placeholders. Safe to run again: existing rows are kept, missing ones added.
 */
export async function seedReference(tx: DbTransaction, repoRoot: string): Promise<ReferenceCounts> {
  const settings = parseSeedSettings(readSeedFile(repoRoot, "parametri.json"));
  for (const setting of settings) {
    const exists = await tx.setting.findFirst({ where: { key: setting.key }, select: { id: true } });
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
        create: { listKey, code: entry.code, labelIt: entry.it, labelSq: entry.sq, active, sortOrder },
        update: {},
      });
      listValues += 1;
    }
  }

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
      create: { key: doc.key, title: doc.title, audiences: doc.audiences, moment: doc.moment, channel: doc.channel },
      update: {},
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

  return {
    settings: settings.length,
    listValues,
    holidays: holidays.length,
    legalDocuments: LEGAL_PLACEHOLDERS.length,
  };
}
