import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { WEB } from "../support/auction.js";
import {
  acceptLegalIfAsked,
  e2eState,
  loginProfessional,
  loginProfessionalAgain,
  savedSecret,
  saveSecret,
} from "../support/auth.js";
import { newFiscalCode } from "../support/broker.js";

/**
 * Named after fase 1, which needs the very first access of the agency owner.
 * The agency's sections (Dan, 2026-10-21, docs/piano-agenzie.md): Metriche and Profilo. */
test.describe("sezioni dell'agenzia", () => {
  test.describe.configure({ timeout: 180_000 });

  test("il titolare apre Metriche, cambia periodo e trova l'agenzia nel Profilo", async ({
    browser,
  }) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const { users, password } = e2eState();
    await page.goto(`${WEB}/auth/login?as=pro`);
    const secret = savedSecret(users.owner);
    if (secret) await loginProfessionalAgain(page, users.owner, password, secret);
    else saveSecret(users.owner, await loginProfessional(page, users.owner, password));
    await acceptLegalIfAsked(page);

    const menu = page.getByRole("navigation", { name: "Menu principale" });
    for (const name of [
      "Partecipa all'asta",
      "Risultati",
      "Polizze da emettere",
      "Polizze emesse",
      "Metriche",
      "Profilo",
    ]) {
      await expect(menu.getByRole("link", { name, exact: true })).toBeVisible();
    }

    await menu.getByRole("link", { name: "Metriche", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Metriche", level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Tasso di vittoria")).toBeVisible();
    await page.getByRole("link", { name: "Ultimi 12 mesi" }).click();
    await expect(page.getByRole("link", { name: "Ultimi 12 mesi" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.screenshot({ path: "test-results/agenzia-metriche.png" });

    await menu.getByRole("link", { name: "Profilo", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Agenzia Uno" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Compagnie mandanti")).toBeVisible();
    await expect(page.getByText(/IT\d\d •••• \d{4}/)).toBeVisible();
    await page.screenshot({ path: "test-results/agenzia-profilo.png", fullPage: true });
  });

  test("ADR 0015: il titolare apre «Le mie richieste» e inizia la richiesta per un cliente nuovo", async ({
    browser,
  }) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const { users, password } = e2eState();
    await page.goto(`${WEB}/auth/login?as=pro`);
    const secret = savedSecret(users.owner);
    if (secret) await loginProfessionalAgain(page, users.owner, password, secret);
    else saveSecret(users.owner, await loginProfessional(page, users.owner, password));
    await acceptLegalIfAsked(page);

    await page
      .getByRole("navigation", { name: "Menu principale" })
      .getByRole("link", { name: "Le mie richieste", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "Richieste", level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("link", { name: "Nuova richiesta" }).click();
    await page.getByRole("link", { name: "Nuovo cliente" }).click();
    await page.getByLabel("Cognome").fill(`Agenzia${randomBytes(3).toString("hex")}`);
    await page.getByLabel("Nome", { exact: true }).fill("Ugo");
    await page.getByLabel("Codice fiscale").fill(newFiscalCode("Bianchi", "Ugo", "M"));
    await page.getByLabel("Email").fill(`e2e.ugo.${randomBytes(4).toString("hex")}@example.test`);
    await page.getByRole("button", { name: "Salva e inizia la richiesta" }).click();
    await expect(page).toHaveURL(/\/tipo$/, { timeout: 30_000 });
  });
});
