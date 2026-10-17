import { documentFile } from "@/lib/document-file";

/** LEG-05: a document of the acceptance, to read before signing, or signed. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; documentId: string }> },
) {
  const { id, documentId } = await context.params;
  return documentFile(`/requests/${id}/acceptance/documents/${documentId}`);
}
