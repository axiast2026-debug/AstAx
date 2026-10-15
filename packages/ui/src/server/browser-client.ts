import type { BrowserClient } from "./web-auth.js";

export interface HeaderReader {
  get(name: string): string | null;
}

/**
 * The browser data passed on to the API for the audit log and legal acceptances
 * (LEG-01, CLAUDE.md rule 4).
 *
 * X-Forwarded-For can be written by the browser itself, so it is trusted only
 * when the web app runs behind a proxy of ours (`behindTrustedProxy`, set in
 * the cloud): then only its LAST entry, the one appended by that proxy, is the
 * real client address. Without a trusted proxy (local development) nothing is
 * forwarded and the API records the web app's own address: honest, not forged.
 */
export function browserClientFrom(
  headers: HeaderReader,
  behindTrustedProxy: boolean,
): BrowserClient {
  const userAgent = headers.get("user-agent");
  if (!behindTrustedProxy) return { forwardedFor: null, userAgent };
  const entries = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const last = entries.at(-1);
  return { forwardedFor: last && /^[0-9a-fA-F:.]{2,45}$/.test(last) ? last : null, userAgent };
}
