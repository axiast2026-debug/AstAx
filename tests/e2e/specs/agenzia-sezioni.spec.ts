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

/** The agency's sections (Dan, 2026-10-21, docs/piano-agenzie.md): Metriche and Profilo. */
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
});
