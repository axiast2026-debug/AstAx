import { documentFile } from "@/lib/document-file";

/** CONT-05: the broker's statement as CSV, for its management software. */
export async function GET() {
  return documentFile("/broker/statement/csv");
}
