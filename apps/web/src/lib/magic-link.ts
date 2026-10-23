/**
 * The one-use token of the magic link in the email code of private customers
 * (ADR 0019): 32 random bytes in base64url, issued by the Keycloak extension
 * `astax-email-code`. The web app only carries it from the link to the login
 * request; the identity provider consumes it. Anything else is not a token.
 */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function isMagicLinkToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

/** Name of the extra parameter on the authorization request, read by the Keycloak extension. */
export const MAGIC_LINK_PARAM = "astax_link";
