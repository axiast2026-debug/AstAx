import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import type { AcceptanceView, OfferRow } from "./acceptance";
import { browserClient } from "./auth";

/**
 * The broker's customer on the link (decision 26): after the code the API
 * gives a proof; the page keeps it in a cookie named after the link (not
 * limited by path: the fake providers' pages send the customer back through a
 * server action of their own) and sends it back as a header. No account, no
 * session.
 */
export const TOKEN = /^[A-Za-z0-9_-]{40,60}$/;
const cookieOf = (token: string) =>
  `astax_offerta_${createHash("sha256").update(token).digest("hex").slice(0, 16)}`;
export const PROOF_HEADER = "x-astax-link-proof";

/** The code of a link (decision 42): sent with the opening, or why not. */
export interface LinkCodeStatus {
  sent: boolean;
  limited: boolean;
  resendAt: string | null;
}

export interface LinkPage {
  state: "ACTIVE" | "EXPIRED" | "REVOKED";
  broker: string;
  vehicle: string;
  expiresAt: string;
  serverNow: string;
  verified: boolean;
  code?: LinkCodeStatus | null;
  offers?: OfferRow[];
  acceptance?: AcceptanceView | null;
}

export async function linkProof(token: string): Promise<string | undefined> {
  return (await cookies()).get(cookieOf(token))?.value;
}

const UUID = /^[0-9a-f-]{36}$/;
const tokenCookieOf = (linkId: string) => `astax_offerta_link_${linkId}`;

/**
 * After the code: the proof, and the token under the link's id, so that the
 * providers send the customer back to `/offerta/ritorno/{linkId}` and the
 * token never travels to them (rule 8).
 */
export async function saveLinkProof(
  token: string,
  linkId: string,
  proof: string,
  expiresAt: Date,
): Promise<void> {
  const jar = await cookies();
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
  jar.set(cookieOf(token), proof, options);
  if (UUID.test(linkId)) jar.set(tokenCookieOf(linkId), token, options);
}

/** The token of a link this browser confirmed with the code, or nothing. */
export async function tokenOfLink(linkId: string): Promise<string | undefined> {
  if (!UUID.test(linkId)) return undefined;
  const token = (await cookies()).get(tokenCookieOf(linkId))?.value;
  return token && TOKEN.test(token) ? token : undefined;
}

/** Streams a file of the link from the API (the API checks token and proof, and logs it). */
export async function linkFile(path: string): Promise<Response> {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) throw new Error("API_URL is not set: run pnpm env:init");
  const id = "[0-9a-f-]{36}";
  const allowed = new RegExp(
    `^/customer-links/[A-Za-z0-9_-]{40,60}/(acceptance/documents/${id}|offers/${id}/quote)$`,
  );
  if (!allowed.test(path)) return new Response(null, { status: 404 });
  const proof = await linkProof(path.split("/")[2] ?? "");
  const client = await browserClient();
  const headers = new Headers();
  if (proof) headers.set(PROOF_HEADER, proof);
  if (client.forwardedFor) headers.set("x-forwarded-for", client.forwardedFor);
  if (client.userAgent) headers.set("user-agent", client.userAgent.slice(0, 300));
  const response = await fetch(`${apiUrl}${path}`, { headers, cache: "no-store" });
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
