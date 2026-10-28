import { randomBytes } from "node:crypto";
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
import { privateRequestSteps, requestCode } from "./requests.js";

export const WEB = "http://localhost:3000";
export const ADMIN = "http://localhost:3001";

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
  // Dan, 2026-10-21: the five screens; the consents with one tick (no code).
  void email;
  await page.getByRole("button", { name: "Nuovo preventivo" }).click();
  await privateRequestSteps(page);
  await expect(page.getByText("Richiesta inviata. La verifichiamo")).toBeVisible();
  return { code: await requestCode(page), url: page.url().split("?")[0] ?? "" };
}

export async function backOffice(
  page: Page,
  as: "verifier" | "supervisor" | "admin" = "verifier",
): Promise<void> {
  const { users, password } = e2eState();
  const email = users[as];
  await page.goto(ADMIN);
  await page.getByRole("link", { name: "Accedi" }).click();
  const secret = savedSecret(email);
  if (secret) await loginProfessionalAgain(page, email, password, secret);
  else saveSecret(email, await loginProfessional(page, email, password));
  await acceptLegalIfAsked(page);
  await expect(page).toHaveURL(`${ADMIN}/`);
}

/**
 * ADR 0013: the back office completes a request with the essential data only:
 * the purchase date is never on a document, and since Dan, 2026-10-28 (no risk
 * certificate) the class and the current insurer come from the back office (ANIA).
 */
export async function completeData(page: Page): Promise<void> {
  await page.getByLabel(/Data di acquisto/).fill("2020-04-01");
  const cu = page.getByLabel(/Classe di merito CU/);
  if ((await cu.inputValue()) === "") await cu.fill("1");
  const insurer = page.getByLabel(/Compagnia attuale/);
  if ((await insurer.inputValue()) === "") await insurer.fill("Compagnia Alfa");
  const expiry = page.getByLabel(/Scadenza attuale/);
  if ((await expiry.inputValue()) === "") await expiry.fill("2027-03-31");
  await page.getByRole("button", { name: "Salva i dati completati" }).click();
  await expect(page.getByText("Dati completati")).toBeVisible();
}

export async function approve(page: Page, code: string): Promise<void> {
  await page.goto(`${ADMIN}/verifiche`);
  await page.getByRole("link", { name: code }).click();
  // ADR 0013: a private request with the essential data only is completed first:
  // the bot's reading is there, the purchase date is never on a document.
  await expect(page.getByRole("heading", { name: `Verifica ${code}` })).toBeVisible();
  const completion = page.getByRole("heading", { name: "Completa i dati" });
  if (await completion.isVisible()) await completeData(page);
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
    await page.goto(`${ADMIN}/aste?codice=${code}`);
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
      await page.goto(`${ADMIN}/aste?codice=${code}`);
    }
    await expect(card.getByText(status, { exact: true })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 120_000, intervals: [1000, 2000, 3000] });
}
