import { expect, test, type Page } from "@playwright/test";
import {
  acceptLegalIfAsked,
  e2eState,
  loginProfessional,
  loginProfessionalAgain,
  savedSecret,
  saveSecret,
} from "../support/auth.js";
import {
  approve,
  auctionCard,
  backOffice,
  newPrivate,
  submittedRequest,
  WEB,
} from "../support/auction.js";

/**
 * S10 (fase 4): Marco Rossi works for Agenzia Uno and Agenzia Tre, both
 * invited to the same auction. One person works on it for one agency only,
 * and makes one offer only (OFF-02, OFF-03); his colleague Sofia offers for Tre.
 */
async function professional(page: Page, email: string): Promise<void> {
  const { password } = e2eState();
  await page.goto(`${WEB}/auth/login?as=pro`);
  const secret = savedSecret(email);
  if (secret) await loginProfessionalAgain(page, email, password, secret);
  else saveSecret(email, await loginProfessional(page, email, password));
  await acceptLegalIfAsked(page);
}

async function switchTo(page: Page, agency: string): Promise<void> {
  await page.getByLabel("Passa a").selectOption({ label: agency });
  await page.getByRole("button", { name: "Vai", exact: true }).click();
  await expect(page.getByRole("banner").locator("span", { hasText: /^Agenzia / })).toHaveText(
    agency,
  );
}

/** Opens the request from «Richieste in arrivo», once the invitation has arrived. */
async function openIncoming(page: Page, code: string): Promise<void> {
  await expect(async () => {
    await page.goto(`${WEB}/richieste-in-arrivo`);
    await expect(page.getByRole("link", { name: code })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 60_000 });
  await page.getByRole("link", { name: code }).click();
  await expect(page.getByText("Ogni apertura di questa richiesta")).toBeVisible();
}

async function sendOffer(page: Page, company: string, premium: string): Promise<void> {
  await page.getByLabel("Premio annuo lordo (€)").fill(premium);
  await page.getByLabel("Compagnia", { exact: true }).selectOption({ label: company });
  const product = page.getByLabel("Prodotto", { exact: true });
  const first = product.locator(`optgroup[label="${company}"] option`).first();
  await product.selectOption((await first.getAttribute("value")) ?? "");
  await page.getByLabel("Massimale unico (€)").fill("10000000");
  await page.getByLabel("PDF del preventivo").setInputFiles({
    name: "preventivo.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 e2e S10"),
  });
  await page.getByLabel(/Confermo che l'offerta è vincolante/).check();
  await page.getByRole("button", { name: "Invia l'offerta" }).click();
  await expect(page.getByText("Offerta registrata")).toBeVisible();
}

test.describe.serial("S10 — sub-agente di due agenzie", () => {
  test.describe.configure({ timeout: 360_000 });

  test("OFF-01 OFF-02 OFF-03 VIS-06 S10: Marco works on the request for one agency only; Sofia offers for Tre", async ({
    browser,
  }) => {
    const customer = await browser.newPage();
    const email = await newPrivate(customer);
    const { code } = await submittedRequest(customer, email);
    const operator = await browser.newPage();
    await backOffice(operator);
    await approve(operator, code);
    // Both agencies invited, whatever the automatic choice (ASTA-06).
    for (const agency of ["Agenzia Uno", "Agenzia Tre"]) {
      const card = await auctionCard(operator, code);
      const form = card.locator("form", {
        has: operator.getByRole("button", { name: "Invita" }),
      });
      await form.getByLabel("Agenzia", { exact: true }).selectOption({ label: agency });
      await form.getByLabel("Motivo").fill("Prova S10");
      await form.getByRole("button", { name: "Invita" }).click();
      await expect(operator.getByText("Richiesta inviata")).toBeVisible();
    }

    const { users } = e2eState();
    const marco = await browser.newPage();
    await professional(marco, users.marco);
    await expect(marco).toHaveURL(`${WEB}/contesto`);
    await marco
      .locator("div", { hasText: "Agenzia Uno" })
      .getByRole("button", { name: "Lavora per questa" })
      .first()
      .click();

    // Marco claims for Agenzia Uno.
    await openIncoming(marco, code);
    await marco.getByRole("button", { name: "Prendi in carico" }).click();
    await expect(marco.getByRole("heading", { name: "La tua offerta" })).toBeVisible();

    // In Agenzia Tre the request says so, and claim and offer are blocked.
    await switchTo(marco, "Agenzia Tre");
    await openIncoming(marco, code);
    await expect(
      marco.getByText("Hai già preso in carico questa richiesta per Agenzia Uno"),
    ).toBeVisible();
    await expect(marco.getByRole("button", { name: "Prendi in carico" })).toHaveCount(0);
    await expect(marco.getByRole("heading", { name: "La tua offerta" })).toHaveCount(0);

    // Released in Uno without an offer: he may claim for Tre.
    await switchTo(marco, "Agenzia Uno");
    await openIncoming(marco, code);
    await marco.getByRole("button", { name: "Rilascia" }).click();
    await switchTo(marco, "Agenzia Tre");
    await openIncoming(marco, code);
    await marco.getByRole("button", { name: "Prendi in carico" }).click();
    await expect(marco.getByRole("heading", { name: "La tua offerta" })).toBeVisible();
    await marco.getByRole("button", { name: "Rilascia" }).click();

    // Sofia, colleague in Agenzia Tre, claims and offers for Tre.
    const sofia = await browser.newPage();
    await professional(sofia, users.sofia);
    await openIncoming(sofia, code);
    await sofia.getByRole("button", { name: "Prendi in carico" }).click();
    await sendOffer(sofia, "Compagnia Beta", "480,00");

    // Marco offers for Agenzia Uno; then Tre stays closed to him (one offer per person).
    await switchTo(marco, "Agenzia Uno");
    await openIncoming(marco, code);
    await marco.getByRole("button", { name: "Prendi in carico" }).click();
    await sendOffer(marco, "Compagnia Alfa", "470,00");
    await switchTo(marco, "Agenzia Tre");
    await openIncoming(marco, code);
    await expect(
      marco.getByText("Hai già fatto un'offerta su questa richiesta per Agenzia Uno"),
    ).toBeVisible();
    await expect(marco.getByRole("heading", { name: /La tua offerta|Modifica/ })).toHaveCount(0);
  });
});
