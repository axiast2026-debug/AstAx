import { documentFile } from "@/lib/document-file";

/** One of the user's own documents, through the API (which logs the opening). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; documentId: string }> },
) {
  const { id, documentId } = await context.params;
  return documentFile(`/requests/${id}/documents/${documentId}/file`);
}
