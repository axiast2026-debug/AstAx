import { createHmac } from "node:crypto";
import { SystemClock } from "@astax/adapters/clock";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Written by global-setup.ts for this run only (never committed). */
export interface E2eState {
  password: string;
  users: { owner: string; marco: string; admin: string };
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

/** Keycloak password form, then the mandatory TOTP setup of the first login (SIC-05). */
export async function loginProfessional(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Accedi" }).click();

  const secretField = page.locator('input[name="totpSecret"]');
  await expect(secretField).toBeAttached();
  const secret = await secretField.inputValue();
  await page.locator("#totp").fill(totp(secret, clock.now().getTime()));
  await page.locator('input[name="userLabel"]').fill("e2e");
  await page.locator('#kc-totp-settings-form [type="submit"]').first().click();
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
      const code = /\b(\d{6})\b/.exec(message.Text)?.[1];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("No code email arrived in Mailpit");
}

/** Accepts the legal texts in force when the app asks for them (LEG-02). */
export async function acceptLegalIfAsked(page: Page): Promise<void> {
  if (page.url().endsWith("/documenti-legali")) {
    await page.getByRole("button", { name: /accetto|pranoj/ }).click();
  }
}
