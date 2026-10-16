import { randomBytes } from "node:crypto";
import { SystemClock } from "@astax/adapters/clock";
import { expect, test, type Page } from "@playwright/test";
import {
  acceptLegalIfAsked,
  e2eState,
  loginPrivate,
  loginProfessional,
  loginProfessionalAgain,
  savedSecret,
  saveSecret,
} from "../support/auth.js";
import {
  codeFromMail,
  coverageAndAuctionSteps,
  driversStep,
  requestCode,
  vehicleStep,
} from "../support/requests.js";

const WEB = "http://localhost:3000";
const ADMIN = "http://localhost:3001";
const clock = new SystemClock();

/**
 * Fase 3: the auction from the approval to the closing, with the worker
 * running (ADR 0008) and the development tools of the «Aste» page (rule 13):
 * test offers from the invited synthetic agencies and «Fai scattare il
 * prossimo passo» in place of hours of waiting.
 */
test.describe.serial("fase 3: motore d'asta", () => {
  test.describe.configure({ timeout: 300_000 });

  async function newPrivate(page: Page): Promise<string> {
    const email = `e2e.asta.${randomBytes(4).toString("hex")}@example.test`;
    await page.goto(`${WEB}/auth/login?as=private`);
    await loginPrivate(page, email);
    await acceptLegalIfAsked(page);
    await expect(page).toHaveURL(`${WEB}/`);
    return email;
  }

  async function submittedRequest(
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

  async function backOffice(page: Page): Promise<void> {
    const { users, password } = e2eState();
    await page.goto(ADMIN);
    await page.getByRole("link", { name: "Accedi" }).click();
    const secret = savedSecret(users.verifier);
    if (secret) await loginProfessionalAgain(page, users.verifier, password, secret);
    else saveSecret(users.verifier, await loginProfessional(page, users.verifier, password));
    await acceptLegalIfAsked(page);
    await expect(page).toHaveURL(`${ADMIN}/`);
  }

  async function approve(page: Page, code: string): Promise<void> {
    await page.goto(`${ADMIN}/verifiche`);
    await page.getByRole("link", { name: code }).click();
    // Fase 3: the card previews the agencies the approval invites.
    await expect(page.getByRole("heading", { name: "Agenzie da invitare" })).toBeVisible();
    await page.getByRole("button", { name: "Approva e apri l'asta" }).click();
    await expect(page.getByText("Richiesta approvata")).toBeVisible();
  }

  /** The card of the request in «Aste», once the worker has opened the auction. */
  async function auctionCard(page: Page, code: string) {
    const card = page.getByRole("region", { name: code });
    await expect(async () => {
      await page.goto(`${ADMIN}/aste`);
      await expect(card).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 60_000 });
    return card;
  }

  async function fireUntil(page: Page, code: string, status: string): Promise<void> {
    await expect(async () => {
      const card = page.getByRole("region", { name: code });
      if (!(await card.getByText(status, { exact: true }).isVisible())) {
        const fire = card.getByRole("button", { name: "Fai scattare il prossimo passo" });
        if (await fire.isVisible()) await fire.click();
        await page.goto(`${ADMIN}/aste`);
      }
      await expect(card.getByText(status, { exact: true })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 120_000, intervals: [1000, 2000, 3000] });
  }

  test("ASTA-01 VIS-03 BC-01 S07: the approval opens the auction; offers arrive and nobody sees a price until the closing; then the best per company", async ({
    browser,
  }) => {
    const customer = await browser.newPage();
    const email = await newPrivate(customer);
    const { code, url } = await submittedRequest(customer, email);

    const operator = await browser.newPage();
    await backOffice(operator);
    await approve(operator, code);
    const card = await auctionCard(operator, code);
    await expect(card.getByText("Aperta", { exact: true })).toBeVisible();

    // The requester: countdown and number of offers (VIS-03).
    await customer.goto(url);
    await expect(customer.getByRole("heading", { name: "Asta" })).toBeVisible();
    await expect(customer.getByText("Chiude tra")).toBeVisible();

    // Three invited synthetic agencies send their offers.
    await card.getByRole("button", { name: "Invia 3 offerte di prova" }).click();
    await expect(operator.getByText("Richiesta inviata")).toBeVisible();
    const after = await auctionCard(operator, code);
    await expect(after.getByText("3", { exact: true })).toBeVisible();
    // BC-01: counters only, no price, also for the back office.
    expect(await after.innerText()).not.toContain("€");

    await expect(async () => {
      await customer.reload();
      await expect(customer.locator("dd", { hasText: /^3$/ })).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    expect(await customer.locator("main").innerText()).not.toContain("€");

    // Top-up, reminder, closing: at once with the development tool.
    await fireUntil(operator, code, "Chiusa");

    // PRES-02: per company the best offer still guaranteed, with the cheapest marked.
    await expect(async () => {
      await customer.reload();
      await expect(customer.getByText("Più conveniente")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    await expect(customer.getByText(/Garantito fino al/).first()).toBeVisible();
    expect(await customer.locator("main").innerText()).toContain("€");
    await expect(customer.getByText("Offerte disponibili").first()).toBeVisible();
  });

  test("ASTA-08 S04 variant: no offer and no agency left for the reopening: the request is «Deserta»", async ({
    browser,
  }) => {
    const customer = await browser.newPage();
    const email = await newPrivate(customer);
    const { code, url } = await submittedRequest(customer, email);
    const operator = await browser.newPage();
    await backOffice(operator);
    await approve(operator, code);
    await auctionCard(operator, code);
    // Nobody offers: the top-up and the reopening invite the compatible agencies left, then deserted.
    await expect(async () => {
      await customer.goto(url);
      if (await customer.getByText("Deserta").first().isVisible()) return;
      await operator.goto(`${ADMIN}/aste`);
      const fire = operator
        .getByRole("region", { name: code })
        .last()
        .getByRole("button", { name: "Fai scattare il prossimo passo" });
      if (await fire.isVisible()) await fire.click();
      await expect(customer.getByText("Deserta").first()).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 180_000, intervals: [2000, 3000] });
    await expect(customer.getByText("Nessuna offerta valida").first()).toBeVisible();
  });
});
