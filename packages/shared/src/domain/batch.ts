import { addCalendarDays, isCalendarDate } from "./calendar-date.js";
import { decodeFiscalCode, normalizeFiscalCodeInput } from "./fiscal-code.js";
import { isValidVatNumber } from "./italian-ids.js";
import { isItalianPlate, normalizePlate } from "./plates.js";
import type { StartMode } from "./quote-data.js";

/**
 * The broker's lots (ADR 0014, Dan 2026-10-21, docs/piano-broker.md C-E): an
 * Excel file in AstAx's format, one vehicle to renew per row. These are the
 * columns of the template, in this order, on its first sheet.
 */
export const BATCH_COLUMNS = [
  "Targa",
  "Scadenza polizza",
  "Cognome o ragione sociale",
  "Nome",
  "Codice fiscale o partita IVA",
  "Email",
  "Cellulare",
  "Indirizzo",
  "CAP",
  "Comune",
  "Provincia",
  "Tipo di guida",
  "Garanzie",
  "Decorrenza",
] as const;

export type BatchCell = string | number | null;

export interface BatchRow {
  line: number;
  /** Dan, 2026-10-22 (question 25): persons and companies. */
  kind: "PERSON" | "COMPANY";
  plate: string;
  policyExpiryDate: string;
  /** The surname, or the company's name. */
  surname: string;
  givenName: string;
  /** The fiscal code of a person, or the VAT number of a company. */
  fiscalCode: string;
  /** Empty for a company. */
  ownerBirthDate: string;
  email: string | null;
  phone: string | null;
  street: string;
  postalCode: string;
  municipality: string;
  province: string;
  drivingFormula: string;
  packageCode: "RECOMMENDED" | "CUSTOM";
  coverages: string[];
  startMode: StartMode;
}

export interface BatchProblem {
  line: number;
  field: string;
  issue: string;
}

/** The values a cell can take, with the labels the broker writes (from the lists). */
export interface BatchVocabulary {
  drivingFormulas: readonly { code: string; label: string }[];
  coverages: readonly { code: string; label: string }[];
  startModes: readonly { code: string; label: string }[];
  /** The name of the «Consigliato» package. */
  recommendedName: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?\d{8,15}$/;
const key = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Excel stores a date as the days since 1899-12-30; a text date may be dd/mm/yyyy or yyyy-mm-dd. */
export function batchDate(value: BatchCell): string | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0 && value < 100_000) {
    return addCalendarDays("1899-12-30", value);
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (isCalendarDate(text)) return text;
  const italian = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (!italian) return null;
  const date = `${italian[3]}-${italian[2]?.padStart(2, "0")}-${italian[1]?.padStart(2, "0")}`;
  return isCalendarDate(date) ? date : null;
}

const textOf = (value: BatchCell | undefined): string =>
  value === null || value === undefined
    ? ""
    : typeof value === "number"
      ? String(value)
      : value.trim();

/**
 * Checks the whole sheet before anything is written: the header, the row
 * limit, every cell of every row, plates repeated inside the file. `today`
 * is the Rome date from Clock: a policy already expired cannot be renewed in
 * a lot.
 */
export function parseBatchRows(
  table: readonly (readonly BatchCell[])[],
  options: { maxRows: number; today: string; vocabulary: BatchVocabulary },
): { rows: BatchRow[]; problems: BatchProblem[] } {
  const [header, ...rest] = table;
  const expected = BATCH_COLUMNS.map(key);
  const found = (header ?? []).slice(0, expected.length).map((c) => key(textOf(c)));
  if (found.join("|") !== expected.join("|")) {
    return { rows: [], problems: [{ line: 1, field: "intestazione", issue: "HEADER" }] };
  }
  const data = rest
    .map((cells, i) => ({ cells, line: i + 2 }))
    .filter(({ cells }) => cells.some((c) => textOf(c) !== ""));
  if (data.length === 0)
    return { rows: [], problems: [{ line: 1, field: "file", issue: "EMPTY" }] };
  if (data.length > options.maxRows) {
    return { rows: [], problems: [{ line: 1, field: "file", issue: "TOO_MANY_ROWS" }] };
  }
  const { vocabulary } = options;
  const formulas = new Map(
    vocabulary.drivingFormulas.flatMap((f) => [
      [key(f.label), f.code],
      [key(f.code), f.code],
    ]),
  );
  const coverages = new Map(
    vocabulary.coverages.flatMap((c) => [
      [key(c.label), c.code],
      [key(c.code), c.code],
    ]),
  );
  const startModes = new Map(
    vocabulary.startModes.flatMap((m) => [
      [key(m.label), m.code],
      [key(m.code), m.code],
    ]),
  );

  const rows: BatchRow[] = [];
  const problems: BatchProblem[] = [];
  const plates = new Map<string, number>();
  for (const { cells, line } of data) {
    const cell = (i: number) => textOf(cells[i]);
    const problem = (field: string, issue: string) => problems.push({ line, field, issue });
    const required = (i: number, field: string) => {
      const value = cell(i);
      if (!value) problem(field, "REQUIRED");
      return value;
    };

    const plate = normalizePlate(cell(0));
    if (!plate) problem("targa", "REQUIRED");
    else if (!isItalianPlate(plate)) problem("targa", "INVALID_PLATE");
    const previous = plate ? plates.get(plate) : undefined;
    if (previous !== undefined) problem("targa", `DUPLICATE_OF_${previous}`);
    else if (plate) plates.set(plate, line);

    const expiry = batchDate(cells[1] ?? null);
    if (!expiry) problem("scadenza", "INVALID_DATE");
    else if (expiry < options.today) problem("scadenza", "EXPIRED");

    const surname = required(2, "cognome");
    const rawCode = cell(4);
    // Question 25: 11 digits are a company's VAT number; otherwise a person's fiscal code.
    const kind: BatchRow["kind"] = /^\d{11}$/.test(rawCode.replace(/\s/g, ""))
      ? "COMPANY"
      : "PERSON";
    const givenName = kind === "COMPANY" ? cell(3) : required(3, "nome");
    const fiscalCode =
      kind === "COMPANY"
        ? rawCode.replace(/\s/g, "")
        : rawCode
          ? normalizeFiscalCodeInput(rawCode)
          : "";
    // A person's birth date comes from the fiscal code.
    const decoded =
      kind === "PERSON" && fiscalCode ? decodeFiscalCode(fiscalCode, options.today) : null;
    if (!rawCode) problem("codice_fiscale", "REQUIRED");
    else if (kind === "COMPANY" && !isValidVatNumber(fiscalCode)) {
      problem("codice_fiscale", "INVALID_VAT_NUMBER");
    } else if (kind === "PERSON" && !decoded) problem("codice_fiscale", "INVALID_FISCAL_CODE");

    const email = cell(5) || null;
    if (email && !EMAIL.test(email)) problem("email", "INVALID_EMAIL");
    const phoneRaw = cell(6).replace(/[\s.-]/g, "");
    const phone = phoneRaw || null;
    if (phone && !PHONE.test(phone)) problem("cellulare", "INVALID_PHONE");

    const street = required(7, "indirizzo");
    const postalCode = cell(8).padStart(cell(8) ? 5 : 0, "0");
    if (!/^\d{5}$/.test(postalCode)) problem("cap", "INVALID_POSTAL_CODE");
    const municipality = required(9, "comune");
    const province = cell(10).toUpperCase();
    if (!/^[A-Z]{2}$/.test(province)) problem("provincia", "INVALID_PROVINCE");

    const drivingFormula = formulas.get(key(cell(11)));
    if (!cell(11)) problem("tipo_di_guida", "REQUIRED");
    else if (!drivingFormula) problem("tipo_di_guida", "UNKNOWN_VALUE");

    // «Consigliato» (or empty) is the package; otherwise the coverages, separated by commas.
    const coverageText = cell(12);
    let packageCode: BatchRow["packageCode"] = "RECOMMENDED";
    const chosen: string[] = [];
    if (coverageText && key(coverageText) !== key(vocabulary.recommendedName)) {
      packageCode = "CUSTOM";
      for (const part of coverageText
        .split(/[,;]/)
        .map((p) => p.trim())
        .filter(Boolean)) {
        const code = coverages.get(key(part));
        if (code) chosen.push(code);
        else problem("garanzie", "UNKNOWN_VALUE");
      }
    }

    // Empty: from the expiry of the current policy.
    const startMode = cell(13) ? startModes.get(key(cell(13))) : "DATE";
    if (!startMode) problem("decorrenza", "UNKNOWN_VALUE");

    rows.push({
      line,
      kind,
      plate,
      policyExpiryDate: expiry ?? "",
      surname,
      givenName,
      fiscalCode,
      ownerBirthDate: decoded?.birthDate ?? "",
      email,
      phone,
      street,
      postalCode,
      municipality,
      province,
      drivingFormula: drivingFormula ?? "",
      packageCode,
      coverages: [...new Set(chosen)],
      startMode: (startMode ?? "DATE") as StartMode,
    });
  }
  return { rows, problems };
}

/**
 * ADR 0014: the auction of a row opens `auctionDaysBeforeExpiry` days before
 * the expiry of its policy (7, answer 6); the documents are asked
 * `documentsDaysBeforeAuction` days before (3). Never before today.
 */
export function batchSchedule(
  policyExpiryDate: string,
  days: { auctionDaysBeforeExpiry: number; documentsDaysBeforeAuction: number },
  today: string,
): { auctionDate: string; documentsDate: string } {
  const auction = addCalendarDays(policyExpiryDate, -days.auctionDaysBeforeExpiry);
  const documents = addCalendarDays(auction, -days.documentsDaysBeforeAuction);
  return {
    auctionDate: auction < today ? today : auction,
    documentsDate: documents < today ? today : documents,
  };
}
