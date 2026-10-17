/**
 * CONT-03, CONT-04, decisions 24 and 34: the invoices of AstAx's fees, all
 * exempt from VAT. Series per year: P to the private customers (one per
 * policy, at the issuance), A to the agencies (one per remittance), B to the
 * brokers (one per month). The VAT nature, the legal reference and the stamp
 * duty come from the parameters `invoicing.*`, to be confirmed by the
 * accountant. The gap-free numbering is the database's (one counter row per
 * series and year, locked while the number is taken).
 */
export type InvoiceSeries = "P" | "A" | "B" | "N";

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitCents: number;
}

export interface InvoicingSettings {
  vatNature: string;
  legalReference: string;
  stampDutyThresholdCents: number;
  stampDutyCents: number;
  /** Who pays the stamp duty: RECIPIENT adds it to the invoice, ASTAX bears it. */
  stampDutyChargedTo: "RECIPIENT" | "ASTAX";
}

export interface InvoiceTotals {
  /** The exempt amount of the lines. */
  exemptCents: number;
  /** The stamp duty when the exempt amount is above the threshold, else 0. */
  stampDutyCents: number;
  /** What the recipient pays. */
  totalCents: number;
  vatNature: string;
  legalReference: string;
}

export function invoiceTotals(
  lines: readonly InvoiceLine[],
  settings: InvoicingSettings,
): InvoiceTotals {
  if (lines.length === 0) throw new Error("An invoice has at least one line");
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new Error("quantity");
    if (!Number.isInteger(l.unitCents) || l.unitCents < 0) throw new Error("unitCents");
  }
  const exemptCents = lines.reduce((sum, l) => sum + l.quantity * l.unitCents, 0);
  // CONT-04: «sopra la soglia», strictly above (77,47 € by default).
  const stampDutyCents =
    exemptCents > settings.stampDutyThresholdCents ? settings.stampDutyCents : 0;
  return {
    exemptCents,
    stampDutyCents,
    totalCents: exemptCents + (settings.stampDutyChargedTo === "RECIPIENT" ? stampDutyCents : 0),
    vatNature: settings.vatNature,
    legalReference: settings.legalReference,
  };
}

/** Decision 34: «P-2026-000001». */
export function invoiceNumber(series: InvoiceSeries, year: number, number: number): string {
  if (!Number.isInteger(number) || number <= 0) throw new Error("number");
  return `${series}-${year}-${String(number).padStart(6, "0")}`;
}

/**
 * CONT-03: a credit note gives back part or all of an invoice, never more
 * than what is still on it after earlier credit notes.
 */
export function creditNoteCents(
  invoiceExemptCents: number,
  alreadyCreditedCents: number,
  requestedCents: number,
): number {
  const left = invoiceExemptCents - alreadyCreditedCents;
  if (!Number.isInteger(requestedCents) || requestedCents <= 0) throw new Error("requestedCents");
  if (requestedCents > left)
    throw new Error("A credit note cannot exceed what is left on the invoice");
  return requestedCents;
}
