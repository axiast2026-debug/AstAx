import { describe, expect, it } from "vitest";
import { BULK_CSV_HEADER, parseBulkCsv } from "./bulk-upload.js";
import { buildFiscalCode } from "./fiscal-code.js";
import { buildVatNumber } from "./italian-ids.js";

const options = { maxRows: 5, today: "2026-10-18" };
const cf = buildFiscalCode({
  surname: "Rossi",
  givenName: "Mario",
  birthDate: "1980-05-12",
  sex: "M",
  birthPlaceCadastralCode: "H501",
});
const vat = buildVatNumber(4242, 1);

describe("broker bulk upload (phase 7)", () => {
  it("reads people and companies with the documents of the ZIP", () => {
    const { rows, problems } = parseBulkCsv(
      [
        BULK_CSV_HEADER,
        `persona;Rossi;Mario;;${cf};;mario.rossi@example.test;+39 333 1234567;ab 123 cd;libretto-rossi.jpg;patente-rossi.jpg;attestato-rossi.pdf`,
        `società;;;"Trasporti Alfa; Srl";;${vat};;;;;;`,
      ].join("\n"),
      options,
    );
    expect(problems).toEqual([]);
    expect(rows[0]).toMatchObject({
      line: 2,
      kind: "PERSON",
      fiscalCode: cf,
      phone: "+393331234567",
      plate: "AB123CD",
      files: {
        REGISTRATION_CERTIFICATE: "libretto-rossi.jpg",
        DRIVING_LICENCE: "patente-rossi.jpg",
        RISK_CERTIFICATE: "attestato-rossi.pdf",
      },
    });
    expect(rows[1]).toMatchObject({
      kind: "COMPANY",
      companyName: "Trasporti Alfa; Srl",
      vatNumber: vat,
    });
  });

  it("checks every row before writing anything and names line and field", () => {
    const { problems } = parseBulkCsv(
      [
        BULK_CSV_HEADER,
        "persona;Rossi;;;RSSMRA80E12H501X;;non-una-email;12;XYZ;libretto.exe;;",
        `persona;Rossi;Mario;;${cf};;;;AB123CD;;;`,
        `persona;Rossi;Mario;;${cf};;;;AB123CD;;;`,
        "camion;;;;;;;;;;;",
      ].join("\n"),
      options,
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        { line: 2, field: "nome", issue: "REQUIRED" },
        { line: 2, field: "codice_fiscale", issue: "INVALID_FISCAL_CODE" },
        { line: 2, field: "email", issue: "INVALID_EMAIL" },
        { line: 2, field: "telefono", issue: "INVALID_PHONE" },
        { line: 2, field: "targa", issue: "INVALID_PLATE" },
        { line: 2, field: "libretto", issue: "INVALID_FILE_NAME" },
        { line: 4, field: "riga", issue: "DUPLICATE_OF_3" },
        { line: 5, field: "tipo", issue: "INVALID_KIND" },
      ]),
    );
  });

  it("refuses another header, an empty file and too many rows", () => {
    expect(parseBulkCsv("a;b\n1;2", options).problems[0]?.issue).toBe("HEADER");
    expect(parseBulkCsv(BULK_CSV_HEADER, options).problems[0]?.issue).toBe("EMPTY");
    const many = [BULK_CSV_HEADER, ...Array.from({ length: 6 }, () => "persona;;;;;;;;;;;")].join(
      "\n",
    );
    expect(parseBulkCsv(many, options).problems[0]?.issue).toBe("TOO_MANY_ROWS");
  });
});
