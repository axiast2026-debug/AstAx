import "server-only";
import { browserClient, sessionId, webAuth } from "./auth";

/** Streams a file from the API (which logs who opened it, rule 4), never cached. */
export async function apiFile(path: string): Promise<Response> {
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

export const isUuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value);
