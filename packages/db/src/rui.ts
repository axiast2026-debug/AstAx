import type { DbTransaction } from "./client.js";

export interface RuiImportRecord {
  number: string;
  section: "A" | "B" | "E";
  name: string;
  linkedNumber?: string;
  companies: string[];
}

/**
 * The local copy of the RUI (docs/adattatori.md): one import per Rome day;
 * running it again on the same day adds nothing. Records missing from the new
 * list are removed: a cancelled intermediary no longer passes the check.
 */
export async function importRuiRecords(
  tx: DbTransaction,
  runDate: string,
  records: AsyncIterable<RuiImportRecord>,
  now: Date,
): Promise<{ imported: number; skipped: boolean }> {
  const done = await tx.ruiImport.findUnique({ where: { runDate } });
  if (done?.finishedAt) return { imported: 0, skipped: true };
  const run = done ?? (await tx.ruiImport.create({ data: { runDate, startedAt: now } }));
  const seen: string[] = [];
  for await (const r of records) {
    const data = {
      section: r.section,
      name: r.name,
      linkedNumber: r.linkedNumber ?? null,
      companies: r.companies,
      importedAt: now,
    };
    await tx.ruiRecord.upsert({
      where: { number: r.number },
      create: { number: r.number, ...data },
      update: data,
    });
    seen.push(r.number);
  }
  // An empty download is a failure of the source, never a registry with nobody in it.
  if (seen.length > 0) await tx.ruiRecord.deleteMany({ where: { number: { notIn: seen } } });
  await tx.ruiImport.update({
    where: { id: run.id },
    data: { records: seen.length, finishedAt: now },
  });
  return { imported: seen.length, skipped: false };
}

export interface RuiCheck {
  found: boolean;
  /** The section expected: A for an agency, B for a broker, E for an intermediary of section E. */
  sectionMatches: boolean;
  /**
   * Section E: the registry links the intermediary to the declared agency or
   * broker. Null for agencies and brokers.
   */
  principalMatches: boolean | null;
  nameMatches: boolean;
  registeredName: string | null;
  /** Agencies: the declared companies that are in the registry, and the others. */
  confirmedCompanies: string[];
  unconfirmedCompanies: string[];
  importedAt: string | null;
}

const normalized = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The automatic check of spec 06 «Coda di ingresso», on the local copy. */
export async function checkOnRui(
  tx: DbTransaction,
  input: {
    type: "AGENCY" | "BROKER";
    ruiNumber: string;
    principalRuiNumber?: string | null;
    legalName: string;
    companyNames: readonly string[];
  },
): Promise<RuiCheck> {
  const expected = input.type === "AGENCY" ? "A" : input.principalRuiNumber ? "E" : "B";
  const record = await tx.ruiRecord.findUnique({ where: { number: input.ruiNumber } });
  const listed = new Set((record?.companies ?? []).map(normalized));
  const confirmed = input.companyNames.filter((c) => listed.has(normalized(c)));
  return {
    found: record !== null,
    sectionMatches: record?.section === expected,
    principalMatches: input.principalRuiNumber
      ? record !== null && record.linkedNumber === input.principalRuiNumber
      : null,
    nameMatches: record !== null && normalized(record.name) === normalized(input.legalName),
    registeredName: record?.name ?? null,
    confirmedCompanies: confirmed,
    unconfirmedCompanies: input.companyNames.filter((c) => !confirmed.includes(c)),
    importedAt: record?.importedAt.toISOString() ?? null,
  };
}
