import "server-only";
import { SystemClock } from "@astax/adapters/clock";
import { loadEnv } from "@astax/shared/env";
import { RedisSessionStore, SessionExpiredError, WebAuth } from "@astax/ui/server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

loadEnv(process.cwd());

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: run pnpm env:init`);
  return value;
};

export const SESSION_COOKIE = "astax_web_session";
const webUrl = process.env.WEB_URL ?? "http://localhost:3000";

const globalAuth = globalThis as unknown as { astaxWebAuth?: WebAuth };

/** One WebAuth per server process (Next reloads modules in development). */
export function webAuth(): WebAuth {
  globalAuth.astaxWebAuth ??= new WebAuth({
    issuer: `${required("KEYCLOAK_URL")}/realms/${process.env.KEYCLOAK_REALM ?? "astax"}`,
    clients: { private: "astax-web-private", pro: "astax-web-pro" },
    redirectUri: `${webUrl}/auth/callback`,
    postLogoutRedirectUri: `${webUrl}/`,
    apiUrl: required("API_URL"),
    store: new RedisSessionStore(required("REDIS_URL"), "web:"),
    clock: new SystemClock(),
  });
  return globalAuth.astaxWebAuth;
}

export async function sessionId(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** Calls the API as the logged-in user; an expired session goes back to the login page. */
export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: T }> {
  try {
    const response = await webAuth().api(await sessionId(), path, init, await browserClient());
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : null) as T };
  } catch (error) {
    if (error instanceof SessionExpiredError) redirect("/?scaduta=1");
    throw error;
  }
}

/** The browser of the current request, passed on to the API for the audit log. */
export async function browserClient(): Promise<{
  forwardedFor: string | null;
  userAgent: string | null;
}> {
  const h = await headers();
  return { forwardedFor: h.get("x-forwarded-for"), userAgent: h.get("user-agent") };
}
