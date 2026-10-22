import { describe, expect, it } from "vitest";
import {
  BATCH_COLUMNS,
  batchDate,
  batchSchedule,
  parseBatchRows,
  type BatchCell,
} from "./batch.js";
import { buildFiscalCode } from "./fiscal-code.js";
import { buildVatNumber } from "./italian-ids.js";

// ADR 0014, Dan 2026-10-21 (docs/piano-broker.md C-E): the broker's lot from Excel.
const vocabulary = {
  drivingFormulas: [
    { code: "FREE", label: "Guida libera" },
    { code: "EXCLUSIVE", label: "Guida esclusiva" },
  ],
  coverages: [
    { code: "roadsideAssistance", label: "Assistenza stradale" },
    { code: "glass", label: "Cristalli" },
  ],
  startModes: [
    { code: "DATE", label: "Alla scadenza" },
    { code: "ON_ISSUANCE", label: "All'emissione" },
  ],
  recommendedName: "Consigliato",
};
const fiscalCode = buildFiscalCode({
  surname: "Riva",
  givenName: "Anna",
  birthDate: "1985-09-03",
  sex: "F",
  birthPlaceCadastralCode: "H501",
});
const row = (overrides: Partial<Record<number, BatchCell>> = {}): BatchCell[] => {
  const base: BatchCell[] = [
    "ab 123 cd",
    "15/12/2026",
    "Riva",
    "Anna",
    fiscalCode,
    "anna@example.test",
    "333 1234567",
    "Via Roma 1",
    "00184",
    "Roma",
    "rm",
    "Guida libera",
    "",
    "",
  ];
  return base.map((v, i) => (i in overrides ? (overrides[i] ?? null) : v));
};
const parse = (rows: BatchCell[][], maxRows = 200) =>
  parseBatchRows([[...BATCH_COLUMNS], ...rows], { maxRows, today: "2026-10-21", vocabulary });

describe("broker lots from Excel (ADR 0014)", () => {
  it("a valid row: customer, essential data, «Consigliato» and start at the expiry by default", () => {
    const { rows, problems } = parse([row()]);
    expect(problems).toEqual([]);
    expect(rows[0]).toMatchObject({
      line: 2,
      plate: "AB123CD",
      policyExpiryDate: "2026-12-15",
      fiscalCode,
      ownerBirthDate: "1985-09-03",
      phone: "3331234567",
      province: "RM",
      drivingFormula: "FREE",
      packageCode: "RECOMMENDED",
      coverages: [],
      startMode: "DATE",
    });
  });

  it("question 25: a company by its VAT number, its name in the first column, no birth date", () => {
    const vat = buildVatNumber(4242, 7);
    const { rows, problems } = parse([row({ 2: "Trasporti Lotto Srl", 3: "", 4: vat })]);
    expect(problems).toEqual([]);
    expect(rows[0]).toMatchObject({
      kind: "COMPANY",
      surname: "Trasporti Lotto Srl",
      fiscalCode: vat,
      ownerBirthDate: "",
    });
  });

  it("the coverages by name make «Su misura»; the start by its label", () => {
    const { rows, problems } = parse([
      row({ 12: "Assistenza stradale, cristalli", 13: "All'emissione" }),
    ]);
    expect(problems).toEqual([]);
    expect(rows[0]).toMatchObject({
      packageCode: "CUSTOM",
      coverages: ["roadsideAssistance", "glass"],
      startMode: "ON_ISSUANCE",
    });
  });

  it("every wrong cell is reported with its row; nothing is accepted from a wrong file", () => {
    const { problems } = parse([
      row(),
      row({ 0: "AB123CD", 1: "2026-01-01", 4: "12345678901", 11: "Guida a caso", 12: "Viaggi" }),
    ]);
    expect(problems).toEqual(
      expect.arrayContaining([
        { line: 3, field: "targa", issue: "DUPLICATE_OF_2" },
        { line: 3, field: "scadenza", issue: "EXPIRED" },
        { line: 3, field: "codice_fiscale", issue: "INVALID_VAT_NUMBER" },
        { line: 3, field: "tipo_di_guida", issue: "UNKNOWN_VALUE" },
        { line: 3, field: "garanzie", issue: "UNKNOWN_VALUE" },
      ]),
    );
    expect(
      parseBatchRows([["Targa"], row()], { maxRows: 5, today: "2026-10-21", vocabulary }),
    ).toMatchObject({ problems: [{ issue: "HEADER" }] });
    expect(parse([row(), row({ 0: "XY987ZW" })], 1).problems).toEqual([
      { line: 1, field: "file", issue: "TOO_MANY_ROWS" },
    ]);
  });

  it("dates: the Excel number, dd/mm/yyyy and yyyy-mm-dd", () => {
    expect(batchDate(46371)).toBe("2026-12-15");
    expect(batchDate("5/1/2027")).toBe("2027-01-05");
    expect(batchDate("2027-01-05")).toBe("2027-01-05");
    expect(batchDate("31/02/2027")).toBeNull();
  });

  it("answer 6: auction 7 days before the expiry, documents 3 days before the auction, never in the past", () => {
    const days = { auctionDaysBeforeExpiry: 7, documentsDaysBeforeAuction: 3 };
    expect(batchSchedule("2026-12-15", days, "2026-10-21")).toEqual({
      auctionDate: "2026-12-08",
      documentsDate: "2026-12-05",
    });
    expect(batchSchedule("2026-10-25", days, "2026-10-21")).toEqual({
      auctionDate: "2026-10-21",
      documentsDate: "2026-10-21",
    });
  });
});
