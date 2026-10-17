import {
  decodePDFRawStream,
  PDFArray,
  type PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFString,
  type PDFObject,
} from "pdf-lib";
import { describe, expect, it } from "vitest";
import { watermarked } from "../src/agency/watermark.js";

const STAMP = "Agenzia Uno - Anna Moretti - 16/11/26, 10:00";

/** The decoded content streams of every page, where the stamp is drawn. */
function pageContents(pdf: PDFDocument): string {
  const resolve = (o: PDFObject | undefined): PDFObject | undefined =>
    o instanceof PDFRef ? pdf.context.lookup(o) : o;
  const out: string[] = [];
  for (const page of pdf.getPages()) {
    const contents = resolve(page.node.get(PDFName.of("Contents")));
    const streams = contents instanceof PDFArray ? contents.asArray().map(resolve) : [contents];
    for (const s of streams) {
      if (s instanceof PDFRawStream) {
        out.push(Buffer.from(decodePDFRawStream(s).decode()).toString("latin1"));
      }
    }
  }
  return out.join("\n");
}

/** The document information dictionary (pdf-lib keeps its getter private). */
const infoOf = (pdf: PDFDocument) => (pdf as unknown as { getInfoDict(): PDFDict }).getInfoDict();

/** drawText writes the standard fonts' text as a hex string. */
const hex = (text: string) => Buffer.from(text, "latin1").toString("hex").toUpperCase();

describe("VIS-10 VIS-01 the documents an agency receives", () => {
  it("VIS-10 the stamp is drawn on every page, not only written in the keywords", async () => {
    const source = await PDFDocument.create();
    source.addPage();
    source.addPage();
    const out = await PDFDocument.load(
      await watermarked(await source.save(), "application/pdf", STAMP, "illeggibile"),
    );
    expect(out.getPageCount()).toBe(2);
    expect(pageContents(out).toUpperCase()).toContain(hex(STAMP));
    expect(out.getKeywords()).toContain(STAMP);
  });

  it("VIS-01 the customer's metadata (title, author, subject, XMP) does not reach the agency", async () => {
    const source = await PDFDocument.create();
    source.addPage();
    source.setTitle("Attestato di Giulia Neri");
    source.setAuthor("giulia.neri@example.test");
    source.setSubject("+39 333 1234567");
    source.setCreator("Scanner di Giulia");
    // A key of its own in the document information, and a form field.
    infoOf(source).set(PDFName.of("Company"), PDFString.of("Studio di Giulia Neri"));
    source.getForm().createTextField("telefono").setText("+39 333 1234567");
    const xmp = source.context.flateStream("<x:xmpmeta>giulia.neri@example.test</x:xmpmeta>", {
      Type: "Metadata",
      Subtype: "XML",
    });
    source.catalog.set(PDFName.of("Metadata"), source.context.register(xmp));
    const bytes = await watermarked(await source.save(), "application/pdf", STAMP, "illeggibile");
    const out = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(out.getTitle() ?? "").toBe("");
    expect(out.getAuthor() ?? "").toBe("");
    expect(out.getSubject() ?? "").toBe("");
    expect(out.getCreator()).toBe("AstAx");
    expect(out.catalog.get(PDFName.of("Metadata"))).toBeUndefined();
    expect(out.catalog.get(PDFName.of("AcroForm"))).toBeUndefined();
    expect(infoOf(out).get(PDFName.of("Company"))).toBeUndefined();
    // Nothing of it anywhere in the file, uncompressed or in its objects.
    const all = Buffer.from(bytes).toString("latin1");
    expect(all).not.toContain("giulia.neri");
    expect(all).not.toContain("Giulia Neri");
    expect(all).not.toContain("333 1234567");
  });

  it("VIS-10 a photo arrives as a PDF with the stamp", async () => {
    const out = await PDFDocument.load(
      await watermarked(new Uint8Array([1, 2, 3]), "image/jpeg", STAMP, "illeggibile"),
    );
    expect(out.getPageCount()).toBe(1);
    expect(pageContents(out).toUpperCase()).toContain(hex(STAMP));
  });
});
