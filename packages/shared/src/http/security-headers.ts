/**
 * Phase 8 (OWASP ASVS V14.4): the security headers of the web apps and of the API.
 *
 * The web apps get a Content-Security-Policy with a fresh nonce for every page:
 * only the scripts Next.js marks with it run. Styles keep 'unsafe-inline'
 * (Tailwind and a few computed widths): a style cannot run code.
 */
export interface WebPolicyOptions {
  nonce: string;
  /** Origins the browser talks to directly: the realtime server of the API. */
  connectTo: string[];
  /** Origins a form may lead to: the login service (Keycloak). */
  formsTo: string[];
  /** Development: Next.js needs eval and its own websocket for the reload. */
  development: boolean;
}

const origin = (url: string): string | null => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

const origins = (urls: string[]): string[] =>
  [...new Set(urls.map(origin).filter((o): o is string => o !== null))].flatMap((o) =>
    // Socket.IO opens a websocket on the same host.
    o.startsWith("https:") ? [o, o.replace(/^https:/, "wss:")] : [o, o.replace(/^http:/, "ws:")],
  );

export function contentSecurityPolicy(options: WebPolicyOptions): string {
  const scripts = [`'self'`, `'nonce-${options.nonce}'`, `'strict-dynamic'`];
  if (options.development) scripts.push(`'unsafe-eval'`);
  const connect = [`'self'`, ...origins(options.connectTo)];
  if (options.development) connect.push("ws:");
  const directives: Record<string, string[]> = {
    "default-src": [`'self'`],
    "script-src": scripts,
    "style-src": [`'self'`, `'unsafe-inline'`],
    "img-src": [`'self'`, "data:", "blob:"],
    "font-src": [`'self'`],
    "connect-src": connect,
    "frame-src": [`'self'`, "blob:"],
    "object-src": [`'none'`],
    "base-uri": [`'self'`],
    "form-action": [`'self'`, ...new Set(options.formsTo.map(origin).filter((o) => o !== null))],
    "frame-ancestors": [`'none'`],
    "manifest-src": [`'self'`],
    "worker-src": [`'self'`],
  };
  const policy = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!options.development) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

/** Headers common to the web apps and the API. */
export function baseSecurityHeaders(production: boolean): Record<string, string> {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(self), microphone=(), geolocation=(), payment=()",
    "cross-origin-opener-policy": "same-origin",
    ...(production ? { "strict-transport-security": "max-age=63072000; includeSubDomains" } : {}),
  };
}

/** The API answers JSON and files: nothing in it may run or be framed. */
export function apiSecurityHeaders(production: boolean): Record<string, string> {
  return {
    ...baseSecurityHeaders(production),
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "cache-control": "no-store",
  };
}
