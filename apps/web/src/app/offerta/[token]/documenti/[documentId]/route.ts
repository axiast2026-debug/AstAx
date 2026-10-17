import { linkFile } from "@/lib/customer-link";

/** LEG-05: a document of the acceptance for the broker's customer on the link. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string; documentId: string }> },
) {
  const { token, documentId } = await context.params;
  return linkFile(`/customer-links/${token}/acceptance/documents/${documentId}`);
}
