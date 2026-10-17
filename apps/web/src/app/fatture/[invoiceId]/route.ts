import { documentFile } from "@/lib/document-file";

/** The courtesy copy of one of the viewer's AstAx invoices (invoice.viewOwn). */
export async function GET(_request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await context.params;
  return documentFile(`/invoices/${invoiceId}/pdf`);
}
