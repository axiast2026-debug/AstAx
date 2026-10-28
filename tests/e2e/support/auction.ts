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
 * Dan, 2026-10-28 (docs/piano-dati-dal-bot.md): no data written by hand: the
 * operator reads ANIA and confirms the bots' data; the auction opens at once.
 */
export async function confirmBotData(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Leggi (di nuovo )?da ANIA/ }).click();
  await expect(page.getByText(/Letta da ANIA alle/)).toBeVisible();
  await page.getByLabel("Confermo la correttezza dei dati estratti dal bot").check();
  await page.getByRole("button", { name: "Approva e apri l'asta" }).click();
  await expect(page.getByText("Richiesta approvata")).toBeVisible();
}

export async function approve(page: Page, code: string): Promise<void> {
  await page.goto(`${ADMIN}/verifiche`);
  await page.getByRole("link", { name: code }).click();
  await expect(page.getByRole("heading", { name: `Verifica ${code}` })).toBeVisible();
  await fiveChecks(page);
  await confirmBotData(page);
}

/**
 * Dan, 2026-10-28: the five checks of the operator, each confirmed as it is;
 * the type of quote suggested by the data, or «Rinnovo».
 */
export async function fiveChecks(page: Page): Promise<void> {
  const checks = page.getByRole("region", { name: "Le 5 verifiche" });
  for (let i = 0; i < 2; i++) {
    await checks.getByRole("button", { name: "Confermo", exact: true }).first().click();
    await expect(checks.getByText(`${i + 1} di 5 fatte`)).toBeVisible();
  }
  for (let i = 2; i < 4; i++) {
    await checks.getByRole("button", { name: "È corretta" }).first().click();
    await expect(checks.getByText(`${i + 1} di 5 fatte`)).toBeVisible();
  }
  const type = checks.getByRole("combobox");
  if ((await type.inputValue()) === "") await type.selectOption("RENEWAL");
  await checks.getByLabel("Il preventivo è fattibile con questa tipologia").check();
  await checks.getByRole("button", { name: "Confermo la tipologia" }).click();
  await expect(checks.getByText("5 di 5 fatte")).toBeVisible();
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
