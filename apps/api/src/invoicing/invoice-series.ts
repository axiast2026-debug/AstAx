/**
 * Audit of 2026-10-30 (B4): an agency has two statements, as the issuer
 * (invoices A) and as a requester (invoices B); each shows its own series and
 * the credit notes of those invoices, never both.
 */
export function ofSeries<
  T extends { id: string; series: string; creditedInvoiceId: string | null },
>(invoices: T[], series: "A" | "B"): T[] {
  return invoices.filter(
    (i) =>
      i.series === series ||
      (i.series === "N" && invoices.find((x) => x.id === i.creditedInvoiceId)?.series === series),
  );
}
