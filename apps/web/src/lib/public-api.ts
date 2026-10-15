import "server-only";
import { loadEnv } from "@astax/shared/env";
import { browserClient } from "./auth";

loadEnv(process.cwd());

/**
 * Calls to the API without a session: only the consent page the broker's
 * customer opens from the link (the token in the path is the proof).
 */
export async function publicApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: T }> {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) throw new Error("API_URL is not set: run pnpm env:init");
  const client = await browserClient();
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  if (client.forwardedFor) headers.set("x-forwarded-for", client.forwardedFor);
  if (client.userAgent) headers.set("user-agent", client.userAgent.slice(0, 300));
  const response = await fetch(`${apiUrl}${path}`, { ...init, headers, cache: "no-store" });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : null) as T };
}
