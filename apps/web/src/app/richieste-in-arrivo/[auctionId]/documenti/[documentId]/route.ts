import { documentFile } from "@/lib/document-file";

/** A document of a request in target, watermarked by the API (VIS-10), which logs the opening. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ auctionId: string; documentId: string }> },
) {
  const { auctionId, documentId } = await context.params;
  return documentFile(`/agency/requests/${auctionId}/documents/${documentId}`);
}
