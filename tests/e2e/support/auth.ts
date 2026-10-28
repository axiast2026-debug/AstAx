import { createHmac, randomInt } from "node:crypto";
import { SystemClock } from "@astax/adapters/clock";
import { readFileSync, writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Written by global-setup.ts for this run only (never committed). */
export interface E2eState {
  password: string;
  users: {
    owner: string;
    marco: string;
    sofia: string;
    cinque: string;
    tre: string;
    admin: string;
    verifier: string;
    supervisor: string;
    brokerOwner: string;
    broker: string;
  };
}

export function e2eState(): E2eState {
  return JSON.parse(
    readFileSync(new URL("../.state/users.json", import.meta.url), "utf8"),
  ) as E2eState;
}

/** Real time: the tests talk to a real Keycloak, which checks TOTP codes against it. */
const clock = new SystemClock();

export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";

/** RFC 6238 code from the raw secret Keycloak puts in the totpSecret field, as an authenticator app does. */
export function totp(secret: string, atMs: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 30_000)));
  const hmac = createHmac("sha1", Buffer.from(secret, "utf8")).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/**
 * Keycloak password form, then the mandatory TOTP setup of the first login (SIC-05).
 * With `wrongCodeFirst` a wrong code is tried first and must be refused.
 * Returns the TOTP secret, needed for the next logins.
 */
export async function loginProfessional(
  page: Page,
  email: string,
  password: string,
  options: { wrongCodeFirst?: boolean } = {},
): Promise<string> {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Accedi" }).click();

  const secretField = page.locator('input[name="totpSecret"]');
  await expect(secretField).toBeAttached();
  const secret = await secretField.inputValue();
  if (options.wrongCodeFirst) {
    const right = totp(secret, clock.now().getTime());
    await page.locator("#totp").fill(right === "000000" ? "111111" : "000000");
    await page.locator('input[name="userLabel"]').fill("e2e");
    await page.locator('#kc-totp-settings-form [type="submit"]').first().click();
    // Still on the setup page: no way in without a valid code.
    await expect(page.locator("#kc-totp-settings-form")).toBeVisible();
  }
  await page.locator("#totp").fill(totp(secret, clock.now().getTime()));
  await page.locator('input[name="userLabel"]').fill("e2e");
  await page.locator('#kc-totp-settings-form [type="submit"]').first().click();
  return secret;
}

/**
 * A later login: password, then the TOTP code is asked again. The code of the next
 * 30-second step is used, because Keycloak refuses a code that was already used.
 */
export async function loginProfessionalAgain(
  page: Page,
  email: string,
  password: string,
  secret: string,
): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Accedi" }).click();
  const otp = page.locator("#otp");
  await expect(otp).toBeVisible();
  // Keycloak refuses a code already used: two logins in the same 30-second
  // step (a fast machine, such as the CI) must wait for the next one.
  let step = Math.floor((clock.now().getTime() + 30_000) / 30_000);
  const last = usedSteps.get(secret);
  if (last !== undefined && step <= last) {
    await page.waitForTimeout((last + 1) * 30_000 - 30_000 - clock.now().getTime() + 500);
    step = Math.floor((clock.now().getTime() + 30_000) / 30_000);
  }
  usedSteps.set(secret, step);
  await otp.fill(totp(secret, step * 30_000));
  await page.locator('#kc-otp-login-form [type="submit"]').first().click();
}

/** The last TOTP step used with each secret in this run. */
const usedSteps = new Map<string, number>();

/**
 * TOTP secrets configured during this run, kept in the run's state folder
 * (never committed): a retried test starts in a new worker and must log in
 * again, not configure TOTP a second time.
 */
const SECRETS_FILE = new URL("../.state/totp.json", import.meta.url);

export function savedSecret(email: string): string | null {
  return savedSecrets()[email] ?? null;
}

function savedSecrets(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(SECRETS_FILE, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveSecret(email: string, secret: string): void {
  writeFileSync(SECRETS_FILE, JSON.stringify({ ...savedSecrets(), [email]: secret }), {
    mode: 0o600,
  });
}

/** Number of emails Mailpit holds for an address. */
export async function mailCount(email: string): Promise<number> {
  const list = (await (
    await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
  ).json()) as { messages_count: number };
  return list.messages_count;
}

/** Private login: email, then the code read from the local Mailpit. */
export async function loginPrivate(page: Page, email: string): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Inviami il codice" }).click();
  await expect(page.getByText("Scrivi il codice")).toBeVisible();
  await page.getByLabel("Codice").fill(await readCode(email));
  await page.getByRole("button", { name: "Accedi" }).click();
}

async function readCode(email: string): Promise<string> {
  // «scrivi il codice 123456»: never a run of digits inside the link's token.
  return readFromLatestMail(email, /codice (\d{6})\b/, "code");
}

/** The magic link of the same email (ADR 0019): the token is the only thing in its URL. */
export async function readMagicLink(email: string): Promise<string> {
  return readFromLatestMail(email, /(https?:\/\/\S+\/accedi\/link\?t=[A-Za-z0-9_-]+)/, "link");
}

async function readFromLatestMail(email: string, pattern: RegExp, what: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const list = (await (
      await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`)
    ).json()) as { messages: { ID: string }[] };
    const latest = list.messages[0];
    if (latest) {
      const message = (await (
        await fetch(`${MAILPIT_URL}/api/v1/message/${latest.ID}`)
      ).json()) as {
        Text: string;
      };
      const found = pattern.exec(message.Text)?.[1];
      if (found) return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No ${what} email arrived in Mailpit`);
}

/** Accepts the legal texts in force when the app asks for them (LEG-02). */
export async function acceptLegalIfAsked(page: Page): Promise<void> {
  // Customer and professional site: /documenti-legali; back office: /accetta-documenti.
  if (/\/(documenti-legali|accetta-documenti)$/.test(page.url())) {
    await page.getByRole("button", { name: /accetto|pranoj/ }).click();
    await page.waitForURL((url) => !/\/(documenti-legali|accetta-documenti)$/.test(url.pathname));
    // A private customer without a name goes on from «/» to «/benvenuto»: wait for
    // where the redirects end (the welcome page, or a page with the menu).
    await Promise.race([
      page.waitForURL(/\/benvenuto$/),
      page.getByRole("navigation").first().waitFor(),
    ]).catch(() => undefined);
  }
  await completeProfileIfAsked(page);
}

/**
 * Dan, 2026-10-28: the first access of a private customer asks name, surname
 * and mobile phone (invented: rule 11), then goes home.
 */
export async function completeProfileIfAsked(
  page: Page,
  person: { firstName: string; lastName: string } = { firstName: "Giulia", lastName: "Prova" },
): Promise<void> {
  if (!/\/benvenuto$/.test(page.url())) return;
  await page.getByLabel("Nome", { exact: true }).fill(person.firstName);
  await page.getByLabel("Cognome").fill(person.lastName);
  await page.getByLabel("Cellulare").fill(`333 ${String(randomInt(1_000_000, 9_999_999))}`);
  await page.getByRole("button", { name: "Continua" }).click();
  await page.waitForURL((url) => url.pathname !== "/benvenuto");
}
