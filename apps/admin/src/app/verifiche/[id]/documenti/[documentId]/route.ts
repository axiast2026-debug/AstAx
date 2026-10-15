import { browserClient, sessionId, webAuth } from "@/lib/auth";

/** A document of the request, through the API, which logs every opening (rule 4). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; documentId: string }> },
) {
  const { id, documentId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(documentId)) {
    return new Response(null, { status: 404 });
  }
  const response = await webAuth().api(
    await sessionId(),
    `/verification/requests/${id}/documents/${documentId}/file`,
    {},
    await browserClient(),
  );
  if (!response.ok) return new Response(null, { status: response.status === 403 ? 403 : 404 });
  return new Response(response.body, {
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/octet-stream",
      "content-disposition": response.headers.get("content-disposition") ?? "inline",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
