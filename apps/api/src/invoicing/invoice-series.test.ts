import { describe, expect, it } from "vitest";
import { ofSeries } from "./invoice-series.js";

describe("audit 2026-10-30 B4: each statement of an agency shows its own invoices", () => {
  const invoices = [
    { id: "a1", series: "A", creditedInvoiceId: null },
    { id: "b1", series: "B", creditedInvoiceId: null },
    { id: "n1", series: "N", creditedInvoiceId: "a1" },
    { id: "n2", series: "N", creditedInvoiceId: "b1" },
  ];

  it("as the issuer, the invoices A and their credit notes", () => {
    expect(ofSeries(invoices, "A").map((i) => i.id)).toEqual(["a1", "n1"]);
  });

  it("as a requester, the invoices B and their credit notes", () => {
    expect(ofSeries(invoices, "B").map((i) => i.id)).toEqual(["b1", "n2"]);
  });
});
