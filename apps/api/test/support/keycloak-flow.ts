import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Drives the real Keycloak login pages over HTTP, as a browser would, to obtain
 * tokens for tests: professionals with password and TOTP, privates with the
 * email code read from Mailpit. Development and test environments only.
 */
export interface KeycloakTarget {
  baseUrl: string;
  realm: string;
  clientId: string;
  redirectUri: string;
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in: number;
}

/** RFC 6238 code, with the raw secret Keycloak puts in the totpSecret field. */
export function totp(secret: string, atMs: number, stepSeconds = 30, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 1000 / stepSeconds)));
  const hmac = createHmac("sha1", Buffer.from(secret, "utf8")).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, "0");
}

class Browser {
  readonly cookies = new Map<string, string>();

  async request(url: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(url, {
      ...init,
      redirect: "manual",
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      },
    });
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const index = pair?.indexOf("=") ?? -1;
      if (pair && index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  }

  /** Follows redirects inside Keycloak, stopping at the application redirect URI. */
  async follow(response: Response, stopAt: string): Promise<Response> {
    let current = response;
    for (let hops = 0; hops < 5; hops += 1) {
      const location = current.headers.get("location");
      if (current.status !== 302 || !location || location.startsWith(stopAt)) return current;
      current = await this.request(location);
    }
    return current;
  }

  async post(url: string, form: Record<string, string>): Promise<Response> {
    return this.request(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
    });
  }
}

const decode = (value: string) => value.replaceAll("&amp;", "&");

function formAction(html: string, formId: string): string {
  const match =
    new RegExp(`<form[^>]*id="${formId}"[^>]*action="([^"]+)"`).exec(html) ??
    new RegExp(`<form[^>]*action="([^"]+)"[^>]*id="${formId}"`).exec(html);
  if (!match?.[1]) throw new Error(`Form ${formId} not found on the Keycloak page`);
  return decode(match[1]);
}

function hiddenValue(html: string, name: string): string | undefined {
  const match =
    new RegExp(`name="${name}"[^>]*value="([^"]*)"`).exec(html) ??
    new RegExp(`value="([^"]*)"[^>]*name="${name}"`).exec(html);
  return match?.[1];
}

async function start(target: KeycloakTarget, browser: Browser) {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(`${target.baseUrl}/realms/${target.realm}/protocol/openid-connect/auth`);
  url.search = new URLSearchParams({
    client_id: target.clientId,
    response_type: "code",
    scope: "openid",
    redirect_uri: target.redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: randomBytes(8).toString("hex"),
  }).toString();
  const response = await browser.request(url.toString());
  return { verifier, html: await response.text() };
}

async function finish(
  target: KeycloakTarget,
  browser: Browser,
  response: Response,
  verifier: string,
): Promise<Tokens> {
  const location = response.headers.get("location");
  if (response.status !== 302 || !location?.startsWith(target.redirectUri)) {
    throw new Error(`Login did not complete (status ${response.status})`);
  }
  const code = new URL(location).searchParams.get("code");
  if (!code) throw new Error("No authorization code in the redirect");
  const tokenResponse = await browser.post(
    `${target.baseUrl}/realms/${target.realm}/protocol/openid-connect/token`,
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: target.redirectUri,
      client_id: target.clientId,
      code_verifier: verifier,
    },
  );
  if (!tokenResponse.ok) throw new Error(`Token exchange failed (status ${tokenResponse.status})`);
  return (await tokenResponse.json()) as Tokens;
}

export interface ProfessionalLogin {
  tokens: Tokens;
  /** Raw TOTP secret, set up on the first login and needed for the next ones. */
  totpSecret: string;
  /** Pages met on the way: proves TOTP was asked. */
  steps: ("PASSWORD" | "TOTP_SETUP" | "TOTP")[];
}

export async function loginProfessional(
  target: KeycloakTarget,
  credentials: { username: string; password: string; totpSecret?: string },
  now: () => number,
): Promise<ProfessionalLogin> {
  const browser = new Browser();
  const { verifier, html } = await start(target, browser);
  const steps: ProfessionalLogin["steps"] = ["PASSWORD"];
  let response = await browser.follow(
    await browser.post(formAction(html, "kc-form-login"), {
      username: credentials.username,
      password: credentials.password,
      credentialId: "",
    }),
    target.redirectUri,
  );
  const page = response.status === 200 ? await response.text() : "";
  let secret = credentials.totpSecret;

  if (page.includes('id="kc-totp-settings-form"')) {
    steps.push("TOTP_SETUP");
    secret = hiddenValue(page, "totpSecret");
    if (!secret) throw new Error("TOTP secret not found on the setup page");
    response = await browser.follow(
      await browser.post(formAction(page, "kc-totp-settings-form"), {
        totp: totp(secret, now()),
        totpSecret: secret,
        userLabel: "test",
      }),
      target.redirectUri,
    );
  } else if (page.includes('id="kc-otp-login-form"')) {
    steps.push("TOTP");
    if (!secret) throw new Error("TOTP required but no secret given");
    response = await browser.follow(
      await browser.post(formAction(page, "kc-otp-login-form"), { otp: totp(secret, now()) }),
      target.redirectUri,
    );
  }
  if (!secret || steps.length < 2) {
    throw new Error("Login completed without TOTP: the professional flow is wrong");
  }
  return { tokens: await finish(target, browser, response, verifier), totpSecret: secret, steps };
}

/** Private login: email, then the code read from the local Mailpit. */
export async function loginPrivate(
  target: KeycloakTarget,
  email: string,
  mailpitUrl: string,
): Promise<Tokens> {
  const browser = new Browser();
  const { verifier, html } = await start(target, browser);
  const response = await browser.post(formAction(html, "kc-email-code-form"), { email });
  const page = await response.text();
  if (!page.includes('id="kc-email-code-verify"')) throw new Error("Code page not shown");
  const code = await readCodeFromMailpit(mailpitUrl, email);
  const verified = await browser.post(formAction(page, "kc-email-code-verify"), { code });
  return finish(target, browser, verified, verifier);
}

/** The code page is shown only after Keycloak sent the email, so the newest message is the right one. */
async function readCodeFromMailpit(mailpitUrl: string, email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const list = (await (
      await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`)
    ).json()) as {
      messages: { ID: string }[];
    };
    const latest = list.messages[0];
    if (latest) {
      const message = (await (await fetch(`${mailpitUrl}/api/v1/message/${latest.ID}`)).json()) as {
        Text: string;
      };
      const code = /\b(\d{6})\b/.exec(message.Text)?.[1];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("No code email arrived in Mailpit");
}

export function decodeJwt(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  return JSON.parse(Buffer.from(payload ?? "", "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
}
