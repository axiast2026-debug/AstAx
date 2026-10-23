import { NextResponse, type NextRequest } from "next/server";
import { webAuth } from "@/lib/auth";
import { isMagicLinkToken, MAGIC_LINK_PARAM } from "@/lib/magic-link";

const webUrl = process.env.WEB_URL ?? "http://localhost:3000";

/**
 * Second step of the magic link (ADR 0019): the landing page «/accedi/link»
 * posts the token here, and the login of the private customer starts with it
 * on the authorization request. Keycloak consumes the token (valid once, same
 * expiry as the code) and sends the browser back to /auth/callback, which
 * records the access in the audit log as for any other login (rule 4).
 * A POST, not a GET: email scanners that open links must not spend the token.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData();
  const token = form.get("t");
  if (!isMagicLinkToken(token)) return NextResponse.redirect(new URL("/accedi", webUrl), 303);
  const url = await webAuth().beginLogin("private", { [MAGIC_LINK_PARAM]: token });
  return NextResponse.redirect(url, 303);
}
