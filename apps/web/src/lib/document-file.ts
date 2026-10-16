import "server-only";
import { browserClient, sessionId, webAuth } from "./auth";

/** Streams a document from the API to the browser, without caching (spec 03 «Documenti»). */
export async function documentFile(path: string): Promise<Response> {
  if (!/^\/[a-z/-]+[0-9a-f-]{36}\/documents\/[0-9a-f-]{36}(\/file)?$/.test(path)) {
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
