import { NextResponse, type NextRequest } from "next/server";
import { browserClientFrom } from "@astax/ui/server";
import { behindTrustedProxy, SESSION_COOKIE, webAuth } from "@/lib/auth";

const webUrl = process.env.WEB_URL ?? "http://localhost:3000";

/** Keycloak sends the browser back here with the authorization code. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const callbackUrl = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, webUrl);
  try {
    const id = await webAuth().completeLogin(callbackUrl);
    // Every access goes to the audit log, with the browser's address (rule 4).
    await webAuth().recordLogin(id, browserClientFrom(request.headers, behindTrustedProxy));
    const response = NextResponse.redirect(new URL("/", webUrl));
    response.cookies.set(SESSION_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: webUrl.startsWith("https://"),
      path: "/",
    });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/accedi?scaduta=1", webUrl));
  }
}
