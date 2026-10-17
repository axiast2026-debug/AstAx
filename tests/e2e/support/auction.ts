import { randomBytes } from "node:crypto";
import { SystemClock } from "@astax/adapters/clock";
import { expect, type Page } from "@playwright/test";
import {
  acceptLegalIfAsked,
  e2eState,
  loginPrivate,
  loginProfessional,
  loginProfessionalAgain,
  savedSecret,
  saveSecret,
} from "./auth.js";
import {
  codeFromMail,
  coverageAndAuctionSteps,
  driversStep,
  requestCode,
  vehicleStep,
} from "./requests.js";

export const WEB = "http://localhost:3000";
export const ADMIN = "http://localhost:3001";
const clock = new SystemClock();

/**
 * Fase 3: the auction from the approval to the closing, with the worker
 * running (ADR 0008) and the development tools of the «Aste» page (rule 13):
 * test offers from the invited synthetic agencies and «Fai scattare il
 * prossimo passo» in place of hours of waiting.
 */
export async function newPrivate(page: Page): Promise<string> {
  const email = `e2e.asta.${randomBytes(4).toString("hex")}@example.test`;
  await page.goto(`${WEB}/auth/login?as=private`);
  await loginPrivate(page, email);
  await acceptLegalIfAsked(page);
  await expect(page).toHaveURL(`${WEB}/`);
  return email;
}

export async function submittedRequest(
  page: Page,
  email: string,
): Promise<{ code: string; url: string }> {
  await page.getByRole("button", { name: "Nuovo preventivo" }).click();
  await vehicleStep(page, {
    libretto: "libretto-giulia-neri.jpg",
    attestato: "attestato-giulia-neri.pdf",
  });
  await driversStep(page, "patente-giulia-neri.jpg");
  await coverageAndAuctionSteps(page);
  const sentAt = clock.now().getTime() - 1000;
  await page.getByRole("button", { name: "Mandami il codice" }).click();
  await page.getByLabel("Codice ricevuto").fill(await codeFromMail(email, sentAt));
  await page.getByRole("button", { name: "Confermo" }).click();
  await page.getByRole("button", { name: "Invia la richiesta" }).click();
  await expect(page.getByText("Richiesta inviata. La verifichiamo")).toBeVisible();
  return { code: await requestCode(page), url: page.url().split("?")[0] ?? "" };
}

export async function backOffice(page: Page): Promise<void> {
  const { users, password } = e2eState();
  await page.goto(ADMIN);
  await page.getByRole("link", { name: "Accedi" }).click();
  const secret = savedSecret(users.verifier);
  if (secret) await loginProfessionalAgain(page, users.verifier, password, secret);
  else saveSecret(users.verifier, await loginProfessional(page, users.verifier, password));
  await acceptLegalIfAsked(page);
  await expect(page).toHaveURL(`${ADMIN}/`);
}

export async function approve(page: Page, code: string): Promise<void> {
  await page.goto(`${ADMIN}/verifiche`);
  await page.getByRole("link", { name: code }).click();
  // Fase 3: the card previews the agencies the approval invites.
  await expect(page.getByRole("heading", { name: "Agenzie da invitare" })).toBeVisible();
  await page.getByRole("button", { name: "Approva e apri l'asta" }).click();
  await expect(page.getByText("Richiesta approvata")).toBeVisible();
}

/**
 * The card of the request in «Aste», once the worker has opened the auction:
 * the latest round (a reopening or a reconfirmation has a card of its own).
 */
export async function auctionCard(page: Page, code: string) {
  const card = page.getByRole("region", { name: code }).last();
  await expect(async () => {
    await page.goto(`${ADMIN}/aste`);
    await expect(card).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 60_000 });
  return card;
}

export async function fireUntil(page: Page, code: string, status: string): Promise<void> {
  await expect(async () => {
    const card = page.getByRole("region", { name: code }).last();
    if (!(await card.getByText(status, { exact: true }).isVisible())) {
      const fire = card.getByRole("button", { name: "Fai scattare il prossimo passo" });
      if (await fire.isVisible()) await fire.click();
      await page.goto(`${ADMIN}/aste`);
    }
    await expect(card.getByText(status, { exact: true })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 120_000, intervals: [1000, 2000, 3000] });
}
