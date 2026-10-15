import { NextResponse, type NextRequest } from "next/server";
import { webAuth } from "@/lib/auth";

/**
 * Starts the login: privates with the email code (astax-web-private),
 * brokers and agencies with password and TOTP (astax-web-pro).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const kind = request.nextUrl.searchParams.get("as") === "pro" ? "pro" : "private";
  return NextResponse.redirect(await webAuth().beginLogin(kind));
}
