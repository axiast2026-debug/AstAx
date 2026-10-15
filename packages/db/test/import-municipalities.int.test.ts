import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findRepoRoot } from "@astax/shared/env";
import { describe, expect, it } from "vitest";
import {
  municipalitiesCsv,
  municipalitiesFromIstat,
} from "../src/scripts/import-municipalities.js";
import { parseSemicolonCsv } from "../src/seed/csv.js";

// Shape of the ISTAT file: quoted headers with line breaks, Windows line ends.
const ISTAT_SAMPLE = [
  'Codice Regione;"Codice dell\'Unità territoriale\nsovracomunale";Codice Comune formato alfanumerico;Denominazione in italiano;Sigla automobilistica;Codice Catastale del comune',
  "03;215;015146;Milano;MI;F205",
  "01;201;001001;Agliè;TO;A074",
  '12;258;058091;"Roma";RM;H501',
].join("\r\n");

describe("ISTAT municipalities import", () => {
  it("reads quoted fields with line breaks", () => {
    expect(parseSemicolonCsv('a;"b\nc";"d""e"\r\n1;2;3\n')).toEqual([
      ["a", "b\nc", 'd"e'],
      ["1", "2", "3"],
    ]);
  });

  it("keeps ISTAT code, cadastral code, province and name, sorted", () => {
    const rows = municipalitiesFromIstat(ISTAT_SAMPLE);
    expect(rows).toEqual([
      { istat: "001001", cadastral: "A074", province: "TO", name: "Agliè" },
      { istat: "015146", cadastral: "F205", province: "MI", name: "Milano" },
      { istat: "058091", cadastral: "H501", province: "RM", name: "Roma" },
    ]);
    expect(municipalitiesCsv(rows)).toBe(
      "istat;cadastral;province;name\n001001;A074;TO;Agliè\n015146;F205;MI;Milano\n058091;H501;RM;Roma\n",
    );
  });

  it("refuses rows that do not look like municipalities", () => {
    expect(() => municipalitiesFromIstat(ISTAT_SAMPLE.replace("F205", "F20"))).toThrow(
      /Unexpected ISTAT row/,
    );
  });

  it("seed/comuni.csv is complete and every cadastral code is unique", () => {
    const [header, ...rows] = parseSemicolonCsv(
      readFileSync(join(findRepoRoot(import.meta.dirname), "seed", "comuni.csv"), "utf8"),
    );
    expect(header).toEqual(["istat", "cadastral", "province", "name"]);
    expect(rows.length).toBeGreaterThan(7800);
    expect(new Set(rows.map((r) => r[1])).size).toBe(rows.length);
  });
});
