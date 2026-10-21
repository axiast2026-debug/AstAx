import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  acceptLegalIfAsked,
  e2eState,
  loginPrivate,
  loginProfessional,
  loginProfessionalAgain,
  mailCount,
  saveSecret,
} from "../support/auth.js";

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
    // Dan, 2026-10-21: four items; documents, help and complaints at the bottom of the page.
    await expect(menu.getByRole("link")).toHaveText(["Home", "Preventivi", "Polizze", "Profilo"]);
    const footer = page.getByRole("navigation", { name: "Altre pagine" });
    await expect(footer.getByRole("link")).toHaveText(["Documenti", "Assistenza", "Reclami"]);

    await page.getByRole("link", { name: "Profilo" }).first().click();
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText("Accessi attivi")).toBeVisible();

    // «Assistenza» in the top bar: the page arrives in a later phase, it is not a 404.
    await page.getByRole("link", { name: "Assistenza" }).first().click();
    await expect(page.getByRole("heading", { name: "Assistenza" })).toBeVisible();
  });

  test("l'email di un professionista nella pagina dei privati non riceve codici e non entra", async ({
    page,
  }) => {
    const { users } = e2eState();
    const before = await mailCount(users.admin);
    await page.goto(`${WEB}/auth/login?as=private`);
    await page.getByLabel("Email").fill(users.admin);
    await page.getByRole("button", { name: "Inviami il codice" }).click();
    // Same page as anybody else: the form does not reveal professional addresses.
    await expect(page.getByText("Scrivi il codice")).toBeVisible();
    await page.getByLabel("Codice").fill("123456");
    await page.getByRole("button", { name: "Accedi" }).click();
    await expect(page.getByText("Il codice non è corretto.")).toBeVisible();
    expect(await mailCount(users.admin)).toBe(before);
  });

  test("il titolare entra con password e TOTP: configurato al primo accesso, chiesto di nuovo dopo, un codice sbagliato non basta", async ({
    page,
  }) => {
    const { users, password } = e2eState();
    await page.goto(WEB);
    await page.getByRole("link", { name: "Accesso professionisti" }).click();
    const secret = await loginProfessional(page, users.owner, password, { wrongCodeFirst: true });
    // Later specs of the same run log in again with this secret.
    saveSecret(users.owner, secret);
    await acceptLegalIfAsked(page);

    await expect(page).toHaveURL(`${WEB}/`);
    await expect(page.getByText("Agenzia Uno")).toBeVisible();
    // Dan, 2026-10-21 (docs/piano-agenzie.md B): team and accounting at the bottom of the page.
    const more = page.getByRole("navigation", { name: "Altre pagine" });
    await expect(more.getByRole("link", { name: "Team" })).toBeVisible();
    await expect(more.getByRole("link", { name: "Contabilità" })).toBeVisible();

    // Log out and back in: password alone is not enough, the TOTP code is asked again.
    await page.getByRole("button", { name: "Esci" }).click();
    await page.getByRole("link", { name: "Accesso professionisti" }).click();
    await loginProfessionalAgain(page, users.owner, password, secret);
    await expect(page).toHaveURL(`${WEB}/`);
    await expect(page.getByText("Agenzia Uno")).toBeVisible();
  });

  test("Marco Rossi passa da Agenzia Uno ad Agenzia Tre e vede solo il contesto attivo", async ({
    page,
  }) => {
    const { users, password } = e2eState();
    await page.goto(`${WEB}/auth/login?as=pro`);
    saveSecret(users.marco, await loginProfessional(page, users.marco, password));
    await acceptLegalIfAsked(page);

    await expect(page).toHaveURL(`${WEB}/contesto`);
    await page
      .locator("div", { hasText: "Agenzia Uno" })
      .getByRole("button", { name: "Lavora per questa" })
      .first()
      .click();
    const current = page.getByRole("banner").locator("span", { hasText: /^Agenzia / });
    await expect(current).toHaveText("Agenzia Uno");
    // Sub-agent menu (spec 05): no team, no accounting; its other pages at the bottom.
    const menu = page.getByRole("navigation", { name: "Menu principale" });
    const more = page.getByRole("navigation", { name: "Altre pagine" });
    await expect(menu.getByRole("link", { name: "Partecipa all'asta" })).toBeVisible();
    await expect(more.getByRole("link", { name: "Dashboard personale" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Team", exact: true })).toHaveCount(0);

    // Spec 05 «Più agenzie»: the selector at the top switches the context.
    await page.getByLabel("Passa a").selectOption({ label: "Agenzia Tre" });
    await page.getByRole("button", { name: "Vai", exact: true }).click();
    await expect(current).toHaveText("Agenzia Tre");
  });

  test("l'amministratore entra nel back office, passa all'albanese e vede il registro", async ({
    page,
  }) => {
    const { users, password } = e2eState();
    await page.goto(ADMIN);
    await page.getByRole("link", { name: "Accedi" }).click();
    // Saved: the phase 7 spec logs in again as the administrator.
    saveSecret(users.admin, await loginProfessional(page, users.admin, password));
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
