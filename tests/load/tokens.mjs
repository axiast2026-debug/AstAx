// Access tokens of the professional test users for the load tests (phase 8).
// Logs in like the browser does (OIDC code flow with PKCE, password and TOTP)
// and prints JSON: [{ email, token, context }]. Development or collaudo only.
//   node tests/load/tokens.mjs users.json > tests/load/.state/tokens.json
// users.json: [{ "email": "...", "password": "...", "totpSecret": "..." }]
// (locally: built from tests/e2e/.state after an E2E run, see README.md).
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

if (process.env.NODE_ENV === "production") {
  console.error("Load tests never run against production.");
  process.exit(2);
}
const KEYCLOAK = process.env.KEYCLOAK_URL ?? "http://localhost:8180";
const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const API = process.env.API_URL ?? "http://127.0.0.1:4000";

function totp(secret, atMs) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 30_000)));
  const hmac = createHmac("sha1", Buffer.from(secret, "utf8")).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

const formAction = (html) => {
  const match = /<form[^>]*action="([^"]+)"/.exec(html);
  if (!match) throw new Error("login form not found");
  return match[1].replaceAll("&amp;", "&");
};

async function login({ email, password, totpSecret }) {
  const cookies = new Map();
  const keep = (response) => {
    for (const c of response.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [name, ...value] = pair.split("=");
      cookies.set(name, value.join("="));
    }
  };
  const jar = () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const redirectUri = `${WEB}/auth/callback`;
  const auth = new URL(`${KEYCLOAK}/realms/astax/protocol/openid-connect/auth`);
  auth.search = new URLSearchParams({
    client_id: "astax-web-pro",
    response_type: "code",
    scope: "openid",
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: randomBytes(8).toString("hex"),
  }).toString();
  let response = await fetch(auth, { redirect: "manual" });
  keep(response);
  const post = async (url, fields) => {
    const r = await fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar() },
      body: new URLSearchParams(fields),
    });
    keep(r);
    return r;
  };
  response = await post(formAction(await response.text()), { username: email, password });
  if (response.status !== 302) {
    response = await post(formAction(await response.text()), {
      // The code of the next 30-second step: Keycloak refuses one already used.
      otp: totp(totpSecret, Date.now() + 30_000),
    });
  }
  const location = response.headers.get("location") ?? "";
  const code = new URL(location, WEB).searchParams.get("code");
  if (!code) throw new Error(`login of ${email} did not end with a code`);
  const tokens = await fetch(`${KEYCLOAK}/realms/astax/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: "astax-web-pro",
      code_verifier: verifier,
    }),
  }).then((r) => r.json());
  const me = await fetch(`${API}/me`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  }).then((r) => r.json());
  const agency = me.memberships?.find((m) => m.organization?.type === "AGENCY");
  return { email, token: tokens.access_token, context: agency?.id ?? null };
}

const users = JSON.parse(readFileSync(process.argv[2], "utf8"));
const out = [];
for (const user of users) out.push(await login(user));
process.stdout.write(`${JSON.stringify(out.filter((u) => u.context))}\n`);
