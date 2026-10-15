/**
 * Rebuilds `seed/comuni.csv` from the ISTAT list of Italian municipalities
 * («Elenco dei codici e delle denominazioni delle unità territoriali»,
 * CC BY 4.0, https://www.istat.it/classificazione/codici-dei-comuni-delle-province-e-delle-regioni/).
 *
 *   pnpm reference:municipalities              # downloads the current list
 *   pnpm reference:municipalities <file.csv>   # uses a file already downloaded
 *
 * The output keeps only what AstAx needs (ISTAT code, cadastral code for the
 * fiscal code, province plate code, Italian name), sorted, in UTF-8, so a
 * rerun with the same ISTAT file gives the same bytes. The seed loads it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findRepoRoot } from "@astax/shared/env";
import { parseSemicolonCsv } from "../seed/csv.js";

const ISTAT_URL =
  "https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.csv";

const COLUMNS = {
  istat: "Codice Comune formato alfanumerico",
  name: "Denominazione in italiano",
  province: "Sigla automobilistica",
  cadastral: "Codice Catastale del comune",
} as const;

export interface MunicipalityRow {
  istat: string;
  cadastral: string;
  province: string;
  name: string;
}

export function municipalitiesFromIstat(text: string): MunicipalityRow[] {
  const [header, ...rows] = parseSemicolonCsv(text);
  if (!header) throw new Error("Empty ISTAT file");
  const clean = header.map((h) => h.replace(/\s+/g, " ").trim());
  const index = (name: string) => {
    const at = clean.indexOf(name);
    if (at < 0) throw new Error(`ISTAT column not found: ${name}`);
    return at;
  };
  const at = {
    istat: index(COLUMNS.istat),
    name: index(COLUMNS.name),
    province: index(COLUMNS.province),
    cadastral: index(COLUMNS.cadastral),
  };
  const result = rows.map((row) => ({
    istat: (row[at.istat] ?? "").trim(),
    cadastral: (row[at.cadastral] ?? "").trim().toUpperCase(),
    province: (row[at.province] ?? "").trim().toUpperCase(),
    name: (row[at.name] ?? "").trim(),
  }));
  for (const m of result) {
    if (
      !/^\d{6}$/.test(m.istat) ||
      !/^[A-Z]\d{3}$/.test(m.cadastral) ||
      !/^[A-Z]{2}$/.test(m.province) ||
      !m.name
    ) {
      throw new Error(`Unexpected ISTAT row: ${JSON.stringify(m)}`);
    }
  }
  return result.sort((a, b) => a.istat.localeCompare(b.istat));
}

export function municipalitiesCsv(rows: readonly MunicipalityRow[]): string {
  const escape = (value: string) =>
    /[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const lines = rows.map((m) => [m.istat, m.cadastral, m.province, escape(m.name)].join(";"));
  return `istat;cadastral;province;name\n${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const source = process.argv[2];
  const bytes = source
    ? readFileSync(source)
    : new Uint8Array(await (await fetch(ISTAT_URL)).arrayBuffer());
  // ISTAT publishes the file in Windows-1252.
  const text = new TextDecoder("windows-1252").decode(bytes);
  const rows = municipalitiesFromIstat(text);
  const target = join(findRepoRoot(process.cwd()), "seed", "comuni.csv");
  writeFileSync(target, municipalitiesCsv(rows), "utf8");
  console.log(`seed/comuni.csv: ${rows.length} comuni`);
}

if (process.argv[1]?.endsWith("import-municipalities.ts")) {
  await main();
}
