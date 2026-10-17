import { apiFile, isUuid } from "@/lib/api-file";

/** The courtesy copy of an invoice, for the back office. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isUuid(id)) return new Response(null, { status: 404 });
  return apiFile(`/back-office/invoices/${id}/pdf`);
}
