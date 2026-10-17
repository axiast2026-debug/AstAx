import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * LEG-05: the documents of the acceptance as PDF files. The legal text comes
 * from the archive with versions (rule 10: «[DA VALIDARE — LEGALE]» until the
 * lawyer validates it); the data of the acceptance (parties, company,
 * compensation, payment) are printed after it as label and value.
 */
export interface AcceptancePdfInput {
  title: string;
  /** The legal text, Markdown of the archive: printed as plain lines. */
  legalText: string;
  versionLabel: string;
  dataTitle: string;
  rows: [string, string][];
}

/** Latin-1 only: the standard PDF fonts cannot draw other characters. */
const latin1 = (text: string) => text.replace(/[^\n -ÿ]/g, "?");

const MARGIN = 50;
const WIDTH = 595;
const HEIGHT = 842;

function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > max && line) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out;
}

export async function acceptancePdf(input: AcceptancePdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage([WIDTH, HEIGHT]);
  let y = HEIGHT - MARGIN;
  const write = (text: string, font: PDFFont, size: number, gap = 4) => {
    for (const line of wrap(latin1(text), font, size, WIDTH - 2 * MARGIN)) {
      if (y < MARGIN + size) {
        page = pdf.addPage([WIDTH, HEIGHT]);
        y = HEIGHT - MARGIN;
      }
      page.drawText(line, { x: MARGIN, y, size, font, color: rgb(0.1, 0.1, 0.1) });
      y -= size + gap;
    }
  };
  write(input.title, bold, 16, 8);
  write(input.versionLabel, regular, 9, 10);
  write(input.legalText.replace(/^#+\s*/gm, ""), regular, 10);
  y -= 10;
  write(input.dataTitle, bold, 12, 6);
  for (const [label, value] of input.rows) write(`${label}: ${value}`, regular, 10);
  pdf.setTitle(latin1(input.title));
  pdf.setCreator("AstAx");
  pdf.setProducer("AstAx");
  return pdf.save();
}
