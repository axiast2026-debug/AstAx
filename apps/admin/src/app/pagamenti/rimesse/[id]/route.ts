import { apiFile, isUuid } from "@/lib/api-file";

/** CONT-02: the SEPA file of a remittance, to upload to the bank. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isUuid(id)) return new Response(null, { status: 404 });
  return apiFile(`/back-office/remittances/${id}/file`);
}
