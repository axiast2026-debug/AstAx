/**
 * Reconciliation of the separate account (spec 06 «Pagamenti», proposal C of
 * phase 7): the bank statement, as a CSV or an ISO 20022 camt.053 file, is
 * read into lines; a credit is matched to a captured payment when it carries
 * the request code and the same amount, and only one payment fits; the rest
 * goes to the queue for the back office. Amounts in integer cents (rule 5).
 */
export interface StatementLine {
  /** Booking date, "YYYY-MM-DD". */
  bookingDate: string;
  valueDate: string | null;
  /** Positive for a credit, negative for a debit. */
  amountCents: number;
  currency: string;
  counterparty: string | null;
  /** The remittance information, where the payer writes the request code. */
  description: string;
  /** The bank's reference of the entry, to recognize it in another import. */
  reference: string | null;
}

export class StatementFormatError extends Error {
  constructor(readonly issue: string) {
    super(`Statement not readable: ${issue}`);
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** «535,00», «1.234,56», «-12,5» or «535.00» → cents; null when not an amount. */
export function amountToCents(value: string): number | null {
  const v = value.trim().replace(/\s/g, "");
  if (!/^-?[\d.,]+$/.test(v)) return null;
  const negative = v.startsWith("-");
  const digits = negative ? v.slice(1) : v;
  // The last separator followed by 1-2 digits is the decimal one.
  const match = /^(.*?)(?:[.,](\d{1,2}))?$/.exec(digits);
  if (!match) return null;
  const whole = (match[1] ?? "").replace(/[.,]/g, "");
  if (!/^\d+$/.test(whole)) return null;
  const cents = Number(whole) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
  return negative ? -cents : cents;
}

function splitCsvRow(row: string): string[] {
  const cells: string[] = [];
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
      cells.push(current);
      current = "";
    } else current += ch;
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

export const STATEMENT_CSV_HEADER = "data;valuta;importo;divisa;controparte;causale;riferimento";

/**
 * The CSV of the bank (semicolons, a header row):
 * data;valuta;importo;divisa;controparte;causale;riferimento
 */
export function parseStatementCsv(text: string): StatementLine[] {
  const rows = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((r) => r.trim() !== "");
  const [header, ...data] = rows;
  if ((header ?? "").trim().toLowerCase() !== STATEMENT_CSV_HEADER) {
    throw new StatementFormatError("HEADER");
  }
  return data.map((row, i) => {
    const [
      bookingDate = "",
      valueDate = "",
      amount = "",
      currency = "",
      counterparty = "",
      description = "",
      reference = "",
    ] = splitCsvRow(row);
    const cents = amountToCents(amount);
    if (!DAY.test(bookingDate) || cents === null || (valueDate && !DAY.test(valueDate))) {
      throw new StatementFormatError(`ROW_${i + 2}`);
    }
    return {
      bookingDate,
      valueDate: valueDate || null,
      amountCents: cents,
      currency: currency || "EUR",
      counterparty: counterparty || null,
      description,
      reference: reference || null,
    };
  });
}

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** The text of the first element with this local name (any namespace prefix). */
function element(xml: string, name: string): string | null {
  const m = new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(
    xml,
  );
  return m ? (m[1] ?? "") : null;
}

function elements(xml: string, name: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "g");
  return [...xml.matchAll(re)].map((m) => m[1] ?? "");
}

/**
 * An ISO 20022 camt.053 statement (BkToCstmrStmt): one line per entry (Ntry)
 * with amount, credit or debit, booking and value date, the remittance
 * information and the debtor's name; the reference is AcctSvcrRef.
 */
export function parseCamt053(xml: string): StatementLine[] {
  if (
    !/urn:iso:std:iso:20022:tech:xsd:camt\.053\./.test(xml) ||
    element(xml, "BkToCstmrStmt") === null
  ) {
    throw new StatementFormatError("NOT_CAMT053");
  }
  return elements(xml, "Ntry").map((entry, i) => {
    const amountTag = /<(?:\w+:)?Amt\s+Ccy="([A-Z]{3})"\s*>([^<]+)</.exec(entry);
    const sign = element(entry, "CdtDbtInd")?.trim();
    const booking =
      element(element(entry, "BookgDt") ?? "", "Dt")?.trim() ??
      element(element(entry, "BookgDt") ?? "", "DtTm")
        ?.trim()
        .slice(0, 10);
    const value = element(element(entry, "ValDt") ?? "", "Dt")?.trim() ?? null;
    const cents = amountTag ? amountToCents(amountTag[2] ?? "") : null;
    if (
      !amountTag ||
      cents === null ||
      (sign !== "CRDT" && sign !== "DBIT") ||
      !booking ||
      !DAY.test(booking)
    ) {
      throw new StatementFormatError(`ENTRY_${i + 1}`);
    }
    const remittance = elements(entry, "Ustrd")
      .map((u) => decodeXml(u.trim()))
      .join(" ");
    const debtor = element(element(entry, "Dbtr") ?? "", "Nm");
    return {
      bookingDate: booking,
      valueDate: value && DAY.test(value) ? value : null,
      amountCents: sign === "CRDT" ? Math.abs(cents) : -Math.abs(cents),
      currency: amountTag[1] ?? "EUR",
      counterparty: debtor ? decodeXml(debtor.trim()) : null,
      description: remittance,
      reference: element(entry, "AcctSvcrRef")?.trim() ?? null,
    };
  });
}

/** Detects the format from the content: XML is camt.053, the rest the CSV. */
export function parseStatement(text: string): {
  format: "CSV" | "CAMT053";
  lines: StatementLine[];
} {
  const trimmed = text.replace(/^\uFEFF/, "").trimStart();
  return trimmed.startsWith("<")
    ? { format: "CAMT053", lines: parseCamt053(trimmed) }
    : { format: "CSV", lines: parseStatementCsv(trimmed) };
}

export interface PaymentToMatch {
  id: string;
  requestCode: string;
  amountCents: number;
}

/** The request codes written in a line («AX-2026-000123»), with the parameter's prefix. */
export function requestCodesIn(text: string, prefix: string): string[] {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}[-\\s]?(\\d{4})[-\\s]?(\\d{6})\\b`, "gi");
  return [...new Set([...text.matchAll(re)].map((m) => `${prefix}-${m[1]}-${m[2]}`))];
}

/**
 * Proposal C: a credit is matched to a payment when it carries its request
 * code and the same amount, and exactly one payment fits; each payment once.
 */
export function matchStatement(
  lines: readonly { id: string; amountCents: number; description: string }[],
  payments: readonly PaymentToMatch[],
  prefix: string,
): { lineId: string; paymentId: string }[] {
  const used = new Set<string>();
  const matches: { lineId: string; paymentId: string }[] = [];
  for (const line of lines) {
    if (line.amountCents <= 0) continue;
    const codes = requestCodesIn(line.description, prefix);
    const fitting = payments.filter(
      (p) => !used.has(p.id) && codes.includes(p.requestCode) && p.amountCents === line.amountCents,
    );
    if (fitting.length !== 1) continue;
    const [payment] = fitting;
    if (!payment) continue;
    used.add(payment.id);
    matches.push({ lineId: line.id, paymentId: payment.id });
  }
  return matches;
}

/** The daily balance: what the bank credited and what the payments say, per day. */
export function dailyBalance(
  lines: readonly { bookingDate: string; amountCents: number; matched: boolean }[],
  captured: readonly { day: string; amountCents: number }[],
): {
  day: string;
  creditsCents: number;
  matchedCents: number;
  capturedCents: number;
  differenceCents: number;
}[] {
  const days = new Map<
    string,
    { creditsCents: number; matchedCents: number; capturedCents: number }
  >();
  const of = (day: string) => {
    let d = days.get(day);
    if (!d) {
      d = { creditsCents: 0, matchedCents: 0, capturedCents: 0 };
      days.set(day, d);
    }
    return d;
  };
  for (const l of lines) {
    if (l.amountCents <= 0) continue;
    const d = of(l.bookingDate);
    d.creditsCents += l.amountCents;
    if (l.matched) d.matchedCents += l.amountCents;
  }
  for (const p of captured) of(p.day).capturedCents += p.amountCents;
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, d]) => ({ day, ...d, differenceCents: d.creditsCents - d.capturedCents }));
}
