import { documentFile } from "@/lib/document-file";

/** A document of the information set of a product of the agency library (decision 17). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ productId: string; documentId: string }> },
) {
  const { productId, documentId } = await context.params;
  return documentFile(`/agency/products/${productId}/documents/${documentId}`);
}
