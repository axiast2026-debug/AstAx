import "server-only";
import { browserClient, sessionId, webAuth } from "./auth";

/** Streams a document from the API to the browser, without caching (spec 03 «Documenti»). */
export async function documentFile(path: string): Promise<Response> {
  const id = "[0-9a-f-]{36}";
  const allowed = [
    new RegExp(`^/[a-z/-]+${id}/documents/${id}(/file)?$`),
    // Phase 5: the acceptance documents and the PDF quote of an offer shown.
    new RegExp(`^/requests/${id}/acceptance/documents/${id}$`),
    new RegExp(`^/requests/${id}/offers/${id}/quote$`),
    // Phase 6: the payment receipt for the agency that issues.
    new RegExp(`^/agency/issuance/${id}/documents/receipt$`),
    // The courtesy copies of AstAx's invoices, to their recipient.
    new RegExp(`^/invoices/${id}/pdf$`),
    new RegExp("^/broker/statement/csv$"),
    // ADR 0014: the template of the broker's lots.
    new RegExp("^/broker/batches/template$"),
  ];
  if (!allowed.some((pattern) => pattern.test(path))) {
    return new Response(null, { status: 404 });
  }
  const response = await webAuth().api(await sessionId(), path, {}, await browserClient());
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
