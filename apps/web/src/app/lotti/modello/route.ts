import { documentFile } from "@/lib/document-file";

/** ADR 0014: the Excel template of the broker's lots. */
export async function GET() {
  return documentFile("/broker/batches/template");
}
