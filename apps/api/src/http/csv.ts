import { addCalendarDays, romeInstant } from "@astax/shared/domain";

/**
 * The CSV files of the panels: semicolons, every cell quoted. A text that
 * starts like a formula (=, +, -, @, tab) gets a leading apostrophe, so a
 * spreadsheet never runs what a customer wrote (CSV injection); numbers go
 * as they are.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (typeof value === "number") return `"${value}"`;
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function csvFile(
  header: string[],
  rows: (string | number | null | undefined)[][],
): Uint8Array {
  return new TextEncoder().encode(
    `${[header.join(";"), ...rows.map((r) => r.map(csvCell).join(";"))].join("\r\n")}\r\n`,
  );
}

/** A period of whole days in Rome (rule 6): from the first instant of `from` to the end of `to`. */
export function romePeriod(from: string, to: string): { gte: Date; lt: Date } {
  return {
    gte: romeInstant(from, "00:00"),
    lt: romeInstant(addCalendarDays(to, 1), "00:00"),
  };
}
