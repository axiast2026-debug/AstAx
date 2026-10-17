import { readFile } from "node:fs/promises";
import { validateXML } from "xmllint-wasm";

/**
 * The official schemas, kept in the repository (proposal B of phase 6): the
 * ISO 20022 credit transfer `pain.001.001.03` for the remittances (CONT-02)
 * and the FatturaPA 1.2.2 of the Agenzia delle Entrate, with the W3C
 * signature schema it imports, for the invoices (CONT-03).
 */
export type XmlSchema = "PAIN_001" | "FATTURA_PA";

const FILES: Record<XmlSchema, { main: string; preload: string[] }> = {
  PAIN_001: { main: "pain.001.001.03.xsd", preload: [] },
  FATTURA_PA: {
    main: "Schema_del_file_xml_FatturaPA_v1.2.2.xsd",
    preload: ["xmldsig-core-schema.xsd"],
  },
};

const schemaUrl = (name: string) => new URL(`../../schemas/${name}`, import.meta.url);

export interface XmlValidation {
  valid: boolean;
  /** xmllint's messages: line and reason, never the document's values. */
  errors: string[];
}

export async function validateXml(schema: XmlSchema, xml: string): Promise<XmlValidation> {
  const files = FILES[schema];
  const result = await validateXML({
    xml: [{ fileName: "document.xml", contents: xml }],
    schema: [{ fileName: files.main, contents: await readFile(schemaUrl(files.main), "utf8") }],
    preload: await Promise.all(
      files.preload.map(async (fileName) => ({
        fileName,
        contents: await readFile(schemaUrl(fileName), "utf8"),
      })),
    ),
  });
  return {
    valid: result.valid,
    errors: result.errors.map((e) => `${e.loc?.lineNumber ?? "?"}: ${e.message}`),
  };
}

/** The five XML characters escaped; text only, never markup from the caller. */
export function xmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Whole cents as «35.00» (rule 5: no floating point on the way). */
export function xmlAmount(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error("Amounts are whole cents");
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
