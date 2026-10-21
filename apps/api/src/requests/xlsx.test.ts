import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { readXlsx, writeXlsx, XlsxError } from "./xlsx.js";

// ADR 0014: the broker's lots in Excel, without a new library.
describe("xlsx reader and writer", () => {
  it("reads back what it writes, first sheet only", () => {
    const file = writeXlsx([
      {
        name: "Richieste",
        rows: [
          ["Targa", "Comune"],
          ["AB123CD", "Forlì & Cesena <FC>"],
        ],
      },
      { name: "Valori", rows: [["Tipo di guida"]] },
    ]);
    expect(readXlsx(file)).toEqual([
      ["Targa", "Comune"],
      ["AB123CD", "Forlì & Cesena <FC>"],
    ]);
  });

  it("reads what Excel saves: shared strings in runs, numbers, dates as numbers, empty cells", () => {
    const xml = (s: string) => strToU8(`<?xml version="1.0" encoding="UTF-8"?>${s}`);
    const file = zipSync({
      "[Content_Types].xml": xml("<Types/>"),
      "xl/workbook.xml": xml(
        '<workbook xmlns:r="r"><sheets><sheet name="Lotto" sheetId="1" r:id="rId7"/></sheets></workbook>',
      ),
      "xl/_rels/workbook.xml.rels": xml(
        '<Relationships><Relationship Id="rId7" Type="ws" Target="worksheets/foglio.xml"/></Relationships>',
      ),
      "xl/sharedStrings.xml": xml(
        "<sst><si><t>Targa</t></si><si><r><t>Ri</t></r><r><t>va</t></r></si></sst>",
      ),
      "xl/worksheets/foglio.xml": xml(
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
          '<row r="3"><c r="A3" t="s"><v>1</v></c><c r="C3"><v>46371</v></c>' +
          '<c r="D3" t="inlineStr"><is><t>&#233;</t></is></c><c r="E3" t="str"><f>A1</f><v>calcolato</v></c></row>' +
          "</sheetData></worksheet>",
      ),
    });
    expect(readXlsx(file)).toEqual([["Targa"], [], ["Riva", null, 46371, "é", "calcolato"]]);
  });

  it("a file that is not an xlsx, or too big, is refused", () => {
    expect(() => readXlsx(strToU8("targa;comune\n"))).toThrow(XlsxError);
    expect(() => readXlsx(zipSync({ "a.txt": strToU8("x") }))).toThrow(XlsxError);
    expect(() => readXlsx(new Uint8Array(6 * 1024 * 1024).fill(0x50))).toThrow("TOO_LARGE");
  });
});
