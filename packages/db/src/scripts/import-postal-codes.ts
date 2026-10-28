/**
 * Rebuilds `seed/cap.csv`, the postal codes (CAP) of each ISTAT municipality,
 * from the GeoNames postal code list of Italy (CC BY 4.0, «GeoNames»,
 * https://download.geonames.org/export/zip/, file IT.zip → IT.txt).
 *
 *   pnpm reference:postal-codes <IT.txt>
 *
 * Dan, 2026-10-28: a municipality with one CAP fills it by itself, one with
 * several lets the customer choose. GeoNames lists places (towns and their
 * hamlets) with province and CAP: a municipality takes the CAPs of the place
 * with its own name in its own province. The ~2.5% left without (recent
 * mergers) keep a CAP typed by the customer. Not the official list of Poste
 * Italiane (a paid service): question 34 of docs/domande-aperte.md.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findRepoRoot } from "@astax/shared/env";
import { readMunicipalities } from "../seed/reference.js";

/** Names compared without accents, case, apostrophes or hyphens. */
export function placeKey(province: string, name: string): string {
  const plain = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return `${province.toUpperCase()}|${plain}`;
}

export function postalCodesFromGeoNames(
  geoNames: string,
  municipalities: readonly { istatCode: string; province: string; name: string }[],
): Map<string, string[]> {
  const byPlace = new Map<string, Set<string>>();
  for (const line of geoNames.split("\n")) {
    const columns = line.split("\t");
    // country, postal code, place, region, region code, province, province code…
    const [country, cap, place, , , , province] = columns;
    if (country !== "IT" || !cap || !/^\d{5}$/.test(cap) || !place || !province) continue;
    // A bilingual name («Bolzano/Bozen») counts for each of its parts.
    for (const part of [place, ...place.split("/")]) {
      const key = placeKey(province, part);
      if (!byPlace.has(key)) byPlace.set(key, new Set());
      byPlace.get(key)?.add(cap);
    }
  }
  const result = new Map<string, string[]>();
  for (const m of municipalities) {
    const caps =
      byPlace.get(placeKey(m.province, m.name)) ??
      byPlace.get(placeKey(m.province, m.name.split("/")[0] ?? m.name));
    if (caps) result.set(m.istatCode, [...caps].sort());
  }
  return result;
}

export function postalCodesCsv(codes: Map<string, string[]>): string {
  const lines = [...codes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([istat, caps]) => `${istat};${caps.join("|")}`);
  return `istat;cap\n${lines.join("\n")}\n`;
}

function main(): void {
  const source = process.argv[2];
  if (!source) throw new Error("Usage: pnpm reference:postal-codes <IT.txt from GeoNames IT.zip>");
  const root = findRepoRoot(process.cwd());
  const municipalities = readMunicipalities(root);
  const codes = postalCodesFromGeoNames(readFileSync(source, "utf8"), municipalities);
  writeFileSync(join(root, "seed", "cap.csv"), postalCodesCsv(codes), "utf8");
  const several = [...codes.values()].filter((c) => c.length > 1).length;
  console.log(
    `seed/cap.csv: ${codes.size} di ${municipalities.length} comuni (${several} con più CAP)`,
  );
}

if (process.argv[1]?.endsWith("import-postal-codes.ts")) {
  main();
}
