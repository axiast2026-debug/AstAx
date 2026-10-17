import { documentFile } from "@/lib/document-file";

/** PRES-04: the PDF quote of an offer shown to the requester, through the API (which logs it). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; offerId: string }> },
) {
  const { id, offerId } = await context.params;
  return documentFile(`/requests/${id}/offers/${offerId}/quote`);
}
