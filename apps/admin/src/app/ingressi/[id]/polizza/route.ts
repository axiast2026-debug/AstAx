import { apiFile, isUuid } from "@/lib/api-file";

/** The professional liability policy of an entry (the opening is logged by the API). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isUuid(id)) return new Response(null, { status: 404 });
  return apiFile(`/back-office/onboarding/${id}/prof-insurance`);
}
