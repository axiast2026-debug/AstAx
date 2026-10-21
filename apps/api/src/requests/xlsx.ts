import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { BatchCell } from "@astax/shared/domain";

/**
 * ADR 0014: the minimal `.xlsx` reader and writer of the broker's lots. An
 * `.xlsx` is a ZIP of XML files; only the first sheet is read, with shared
 * and inline strings, numbers and booleans. Formulas are never computed (the
 * value Excel saved is read), XML entities are never expanded, and the size
 * is capped before and after unzipping.
 */
export const XLSX_MAX_BYTES = 5 * 1024 * 1024;
const MAX_UNZIPPED_BYTES = 50 * 1024 * 1024;
const MAX_COLUMNS = 30;

export class XlsxError extends Error {
  constructor(readonly issue: "NOT_XLSX" | "TOO_LARGE") {
    super(issue);
  }
}

const unescapeXml = (text: string) =>
  text.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_m, entity: string) => {
    if (entity === "amp") return "&";
    if (entity === "lt") return "<";
    if (entity === "gt") return ">";
    if (entity === "quot") return '"';
    if (entity === "apos") return "'";
    const code =
      entity[1] === "x"
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });

const escapeXml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Characters XML 1.0 does not allow (control characters but tab and new lines).
    .replace(/[^\t\n\r\u{20}-\u{10FFFF}]/gu, "");

/** The text of every <t> inside a fragment (a shared string may be split in runs). */
const textOf = (fragment: string) =>
  [...fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((m) => unescapeXml(m[1] ?? ""))
    .join("");

const attribute = (attributes: string, name: string) =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1];

/** «C12» → column index 2 (0-based). */
function columnOf(reference: string): number {
  const letters = /^[A-Z]+/.exec(reference)?.[0] ?? "";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function columnName(index: number): string {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const rest = (n - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/** The first sheet of an `.xlsx` as rows of cells (empty cells are null). */
export function readXlsx(body: Uint8Array): BatchCell[][] {
  if (body.length > XLSX_MAX_BYTES) throw new XlsxError("TOO_LARGE");
  const isZip = body.length > 4 && body[0] === 0x50 && body[1] === 0x4b;
  if (!isZip) throw new XlsxError("NOT_XLSX");
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(body, {
      filter: (file) => {
        total += file.originalSize;
        return total <= MAX_UNZIPPED_BYTES && /^(xl\/|\[Content_Types\])/.test(file.name);
      },
    });
  } catch {
    throw new XlsxError("NOT_XLSX");
  }
  if (total > MAX_UNZIPPED_BYTES) throw new XlsxError("TOO_LARGE");
  const read = (name: string) => (files[name] ? strFromU8(files[name]) : null);

  // The first sheet in the workbook's order, through its relationship.
  const workbook = read("xl/workbook.xml");
  const rels = read("xl/_rels/workbook.xml.rels");
  if (!workbook || !rels) throw new XlsxError("NOT_XLSX");
  const firstSheet = /<sheet\b([^>]*)\/?>/.exec(workbook)?.[1] ?? "";
  const relId = attribute(firstSheet, "r:id");
  const relation = [...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)]
    .map((m) => m[1] ?? "")
    .find((r) => attribute(r, "Id") === relId);
  const target = relation ? attribute(relation, "Target") : undefined;
  if (!target) throw new XlsxError("NOT_XLSX");
  const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  const sheet = read(path);
  if (!sheet) throw new XlsxError("NOT_XLSX");

  const shared = [...(read("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map(
    (m) => textOf(m[1] ?? ""),
  );

  const rows: BatchCell[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
    const rowNumber = Number(attribute(rowMatch[1] ?? rowMatch[3] ?? "", "r") ?? rows.length + 1);
    const cells: BatchCell[] = [];
    for (const cell of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cell[1] ?? "";
      const inner = cell[2] ?? "";
      const index = columnOf(attribute(attributes, "r") ?? columnName(cells.length));
      if (index < 0 || index >= MAX_COLUMNS) continue;
      const type = attribute(attributes, "t");
      const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value: BatchCell = null;
      if (type === "s") value = shared[Number(raw)] ?? null;
      else if (type === "inlineStr") value = textOf(inner);
      else if (type === "str" || type === "e") value = raw === undefined ? null : unescapeXml(raw);
      else if (type === "b") value = raw === "1" ? "VERO" : "FALSO";
      else if (raw !== undefined) {
        const n = Number(raw);
        value = Number.isFinite(n) ? n : unescapeXml(raw);
      }
      while (cells.length < index) cells.push(null);
      cells[index] = value === "" ? null : value;
    }
    while (rows.length < rowNumber - 1) rows.push([]);
    rows[rowNumber - 1] = cells;
  }
  return rows;
}

/** A workbook with text cells only, one sheet per entry (the template of the lots). */
export function writeXlsx(sheets: { name: string; rows: string[][] }[]): Uint8Array {
  const sheetXml = (rows: string[][]) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
    rows
      .map(
        (row, r) =>
          `<row r="${r + 1}">` +
          row
            .map(
              (value, c) =>
                `<c r="${columnName(c)}${r + 1}" t="inlineStr"${r === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`,
            )
            .join("") +
          `</row>`,
      )
      .join("") +
    `</sheetData></worksheet>`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        sheets
          .map(
            (_s, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join("") +
        `</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
        sheets
          .map(
            (s, i) =>
              `<sheet name="${escapeXml(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
          )
          .join("") +
        `</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        sheets
          .map(
            (_s, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join("") +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    ),
    // Two styles: normal, and bold for the header row.
    "xl/styles.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
        `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
        `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
        `</styleSheet>`,
    ),
  };
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s.rows));
  });
  return zipSync(files);
}
