import { contentSecurityPolicy } from "@astax/shared/http";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Phase 8: every page gets a fresh nonce and a Content-Security-Policy that
 * lets only its own scripts run. Next.js reads the nonce from the request
 * header and puts it on its scripts (the pages are rendered per request).
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy({
    nonce,
    connectTo: [process.env.API_PUBLIC_URL ?? process.env.API_URL ?? ""],
    formsTo: [process.env.KEYCLOAK_URL ?? ""],
    development: process.env.NODE_ENV !== "production",
  });
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icons/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
