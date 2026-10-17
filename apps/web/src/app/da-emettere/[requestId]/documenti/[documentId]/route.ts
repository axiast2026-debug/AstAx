import { documentFile } from "@/lib/document-file";

/** EMI-02: a signed document, an upload or the payment receipt, through the API (logged). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ requestId: string; documentId: string }> },
) {
  const { requestId, documentId } = await context.params;
  return documentFile(`/agency/issuance/${requestId}/documents/${documentId}`);
}
