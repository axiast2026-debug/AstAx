import { isValidFiscalCode, normalizeFiscalCodeInput } from "./fiscal-code.js";
import { isValidVatNumber } from "./italian-ids.js";
import { isItalianPlate, normalizePlate } from "./plates.js";

/**
 * The broker's bulk upload (phase 7): a CSV with one customer per row and,
 * optionally, a ZIP with the documents named in the row. Each valid row
 * becomes a customer of the broker (or the existing one) and a draft request
 * with its documents; the broker completes and sends each draft.
 */
export const BULK_CSV_HEADER =
  "tipo;cognome;nome;ragione_sociale;codice_fiscale;partita_iva;email;telefono;targa;libretto;patente;attestato";

export interface BulkRow {
  line: number;
  kind: "PERSON" | "COMPANY";
  surname: string | null;
  givenName: string | null;
  companyName: string | null;
  fiscalCode: string | null;
  vatNumber: string | null;
  email: string | null;
  phone: string | null;
  plate: string | null;
  /** File names inside the ZIP. */
  files: { REGISTRATION_CERTIFICATE?: string; DRIVING_LICENCE?: string; RISK_CERTIFICATE?: string };
}

export interface BulkProblem {
  line: number;
  field: string;
  issue: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?\d{8,15}$/;
const FILE = /^[\w .()-]{1,120}\.(pdf|jpe?g|png)$/i;

function cells(row: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < row.length; i += 1) {
    const ch = row[i];
    if (quoted) {
      if (ch === '"' && row[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else current += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ";") {
      out.push(current.trim());
      current = "";
    } else current += ch;
  }
  out.push(current.trim());
  return out;
}

/**
 * Checks the whole file before anything is written: the header, the row
 * limit, every field of every row, plates and fiscal codes repeated inside
 * the file. `today` is the Rome date from Clock (the fiscal code check).
 */
export function parseBulkCsv(
  text: string,
  options: { maxRows: number; today: string },
): { rows: BulkRow[]; problems: BulkProblem[] } {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l, i) => ({ text: l, line: i + 1 }))
    .filter((l) => l.text.trim() !== "");
  const [header, ...data] = lines;
  if ((header?.text ?? "").trim().toLowerCase() !== BULK_CSV_HEADER) {
    return { rows: [], problems: [{ line: 1, field: "header", issue: "HEADER" }] };
  }
  if (data.length === 0)
    return { rows: [], problems: [{ line: 1, field: "file", issue: "EMPTY" }] };
  if (data.length > options.maxRows) {
    return { rows: [], problems: [{ line: 1, field: "file", issue: "TOO_MANY_ROWS" }] };
  }
  const rows: BulkRow[] = [];
  const problems: BulkProblem[] = [];
  const seen = new Map<string, number>();
  for (const { text: rowText, line } of data) {
    const [
      kindCell = "",
      surname = "",
      givenName = "",
      companyName = "",
      fiscalRaw = "",
      vatRaw = "",
      email = "",
      phoneRaw = "",
      plateRaw = "",
      libretto = "",
      patente = "",
      attestato = "",
    ] = cells(rowText);
    const problem = (field: string, issue: string) => problems.push({ line, field, issue });
    const kindUpper = kindCell.toUpperCase();
    const kind =
      kindUpper === "SOCIETA" || kindUpper === "SOCIETÀ"
        ? "COMPANY"
        : kindUpper === "PERSONA"
          ? "PERSON"
          : null;
    if (!kind) problem("tipo", "INVALID_KIND");
    const fiscalCode = fiscalRaw ? normalizeFiscalCodeInput(fiscalRaw) : null;
    const vatNumber = vatRaw ? vatRaw.replace(/\s/g, "") : null;
    if (kind === "PERSON") {
      if (!surname) problem("cognome", "REQUIRED");
      if (!givenName) problem("nome", "REQUIRED");
      if (!fiscalCode || !isValidFiscalCode(fiscalCode, options.today)) {
        problem("codice_fiscale", "INVALID_FISCAL_CODE");
      }
    }
    if (kind === "COMPANY") {
      if (!companyName) problem("ragione_sociale", "REQUIRED");
      if (!vatNumber || !isValidVatNumber(vatNumber)) problem("partita_iva", "INVALID_VAT_NUMBER");
    }
    if (email && !EMAIL.test(email)) problem("email", "INVALID_EMAIL");
    const phone = phoneRaw ? phoneRaw.replace(/[\s.-]/g, "") : null;
    if (phone && !PHONE.test(phone)) problem("telefono", "INVALID_PHONE");
    const plate = plateRaw ? normalizePlate(plateRaw) : null;
    if (plate && !isItalianPlate(plate)) problem("targa", "INVALID_PLATE");
    for (const [field, name] of [
      ["libretto", libretto],
      ["patente", patente],
      ["attestato", attestato],
    ] as const) {
      if (name && !FILE.test(name)) problem(field, "INVALID_FILE_NAME");
    }
    const key = kind === "COMPANY" ? `V:${vatNumber}` : `F:${fiscalCode}`;
    const identity = `${key}|${plate ?? ""}`;
    const previous = seen.get(identity);
    if (previous !== undefined) problem("riga", `DUPLICATE_OF_${previous}`);
    else seen.set(identity, line);
    rows.push({
      line,
      kind: kind ?? "PERSON",
      surname: surname || null,
      givenName: givenName || null,
      companyName: companyName || null,
      fiscalCode,
      vatNumber,
      email: email || null,
      phone,
      plate,
      files: {
        ...(libretto ? { REGISTRATION_CERTIFICATE: libretto } : {}),
        ...(patente ? { DRIVING_LICENCE: patente } : {}),
        ...(attestato ? { RISK_CERTIFICATE: attestato } : {}),
      },
    });
  }
  return { rows, problems };
}
