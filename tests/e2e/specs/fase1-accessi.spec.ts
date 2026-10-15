import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { acceptLegalIfAsked, e2eState, loginPrivate, loginProfessional } from "../support/auth.js";

const WEB = "http://localhost:3000";
const ADMIN = "http://localhost:3001";

test.describe("fase 1: accessi", () => {
  test("un privato entra con un codice ricevuto via email, senza password", async ({ page }) => {
    const email = `e2e.privato.${randomBytes(4).toString("hex")}@example.test`;
    await page.goto(WEB);
    await page.getByRole("link", { name: "Entra con il codice" }).click();
    await loginPrivate(page, email);

    // First access: the account is created and the legal texts must be accepted (LEG-02).
    await expect(page).toHaveURL(`${WEB}/documenti-legali`);
    await expect(page.getByText("[DA VALIDARE — LEGALE]").first()).toBeVisible();
    await acceptLegalIfAsked(page);

    await expect(page).toHaveURL(`${WEB}/`);
    const menu = page.getByRole("navigation", { name: "Menu principale" });
    await expect(menu.getByRole("link")).toHaveText([
      "Home",
      "Preventivi",
      "Polizze",
      "Documenti",
      "Profilo",
    ]);

    await page.getByRole("link", { name: "Profilo" }).first().click();
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText("Accessi attivi")).toBeVisible();
  });

  test("il titolare di un'agenzia entra con password e TOTP, configurato al primo accesso", async ({
    page,
  }) => {
    const { users, password } = e2eState();
    await page.goto(WEB);
    await page.getByRole("link", { name: "Accesso professionisti" }).click();
    await loginProfessional(page, users.owner, password);
    await acceptLegalIfAsked(page);

    await expect(page).toHaveURL(`${WEB}/`);
    await expect(page.getByText("Agenzia Uno")).toBeVisible();
    const menu = page.getByRole("navigation", { name: "Menu principale" });
    await expect(menu.getByRole("link", { name: "Team" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Contabilità" })).toBeVisible();
  });

  test("Marco Rossi passa da Agenzia Uno ad Agenzia Tre e vede solo il contesto attivo", async ({
    page,
  }) => {
    const { users, password } = e2eState();
    await page.goto(`${WEB}/auth/login?as=pro`);
    await loginProfessional(page, users.marco, password);
    await acceptLegalIfAsked(page);

    await expect(page).toHaveURL(`${WEB}/contesto`);
    await page
      .locator("div", { hasText: "Agenzia Uno" })
      .getByRole("button", { name: "Lavora per questa" })
      .first()
      .click();
    await expect(page.getByRole("banner").getByText("Agenzia Uno")).toBeVisible();
    // Sub-agent menu (spec 05): no team, no accounting.
    const menu = page.getByRole("navigation", { name: "Menu principale" });
    await expect(menu.getByRole("link", { name: "Dashboard personale" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Team" })).toHaveCount(0);

    await page.getByRole("link", { name: "Cambia" }).click();
    await page
      .locator("div", { hasText: "Agenzia Tre" })
      .getByRole("button", { name: "Lavora per questa" })
      .last()
      .click();
    await expect(page.getByRole("banner").getByText("Agenzia Tre")).toBeVisible();
    await expect(page.getByRole("banner").getByText("Agenzia Uno")).toHaveCount(0);
  });

  test("l'amministratore entra nel back office, passa all'albanese e vede il registro", async ({
    page,
  }) => {
    const { users, password } = e2eState();
    await page.goto(ADMIN);
    await page.getByRole("link", { name: "Accedi" }).click();
    await loginProfessional(page, users.admin, password);
    await acceptLegalIfAsked(page);

    await expect(page).toHaveURL(`${ADMIN}/`);
    await page.getByRole("button", { name: "Shqip" }).click();
    await expect(page.getByRole("link", { name: "Regjistri i aktiviteteve" })).toBeVisible();
    await page.getByRole("link", { name: "Regjistri i aktiviteteve" }).click();
    await expect(page.getByRole("heading", { name: "Regjistri i aktiviteteve" })).toBeVisible();
    await expect(page.getByText("LEGAL_ACCEPTED").first()).toBeVisible();

    await page.getByRole("button", { name: "Italiano" }).click();
    await expect(page.getByRole("heading", { name: "Registro delle attività" })).toBeVisible();
  });
});
