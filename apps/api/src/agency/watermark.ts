import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";

/**
 * VIS-10: every document of a customer that an agency user views or
 * downloads carries a watermark with the agency, the user, date and time.
 * The agency always receives a PDF: a photo is placed on an A4 page. The
 * same text goes in the PDF keywords, so that it can be checked on the file.
 */
export async function watermarked(
  body: Uint8Array,
  mime: string,
  text: string,
  unreadable: string,
): Promise<Uint8Array> {
  let pdf: PDFDocument;
  if (mime === "application/pdf") {
    try {
      pdf = await redrawn(await PDFDocument.load(body, { ignoreEncryption: true }));
    } catch {
      pdf = await placeholder(unreadable);
    }
  } else {
    pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    try {
      const image = mime === "image/png" ? await pdf.embedPng(body) : await pdf.embedJpg(body);
      const scale = Math.min(555 / image.width, 802 / image.height, 1);
      page.drawImage(image, {
        x: 20,
        y: 822 - image.height * scale,
        width: image.width * scale,
        height: image.height * scale,
      });
    } catch {
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      page.drawText(unreadable, { x: 40, y: 780, size: 14, font });
    }
  }
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    for (const y of [height * 0.25, height * 0.55, height * 0.85]) {
      page.drawText(text, {
        x: width * 0.08,
        y,
        size: 14,
        font,
        color: rgb(0.85, 0.2, 0.1),
        opacity: 0.35,
        rotate: degrees(20),
      });
    }
    page.drawText(text, { x: 20, y: 12, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
  }
  pdf.setCreator("AstAx");
  pdf.setProducer("AstAx");
  pdf.setKeywords(["AstAx", text]);
  // Without object streams the document information stays readable as text.
  return pdf.save({ useObjectStreams: false });
}

/**
 * VIS-01: a new document with only what the pages show. The customer's file
 * may carry names or addresses in its metadata (information, XMP), form
 * fields, annotations or attached files: none of it reaches the agency.
 */
async function redrawn(source: PDFDocument): Promise<PDFDocument> {
  const pdf = await PDFDocument.create();
  for (const page of source.getPages()) {
    const { width, height } = page.getSize();
    const target = pdf.addPage([width, height]);
    // A blank page has nothing to draw.
    if (page.node.Contents()) target.drawPage(await pdf.embedPage(page));
  }
  return pdf;
}

async function placeholder(text: string): Promise<PDFDocument> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  page.drawText(text, {
    x: 40,
    y: 780,
    size: 14,
    font: await pdf.embedFont(StandardFonts.Helvetica),
  });
  return pdf;
}
