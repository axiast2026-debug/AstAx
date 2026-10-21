import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { WEB } from "../support/auction.js";
import { brokerLogin, newFiscalCode } from "../support/broker.js";

/**
 * The broker's work area for the computer (Dan, 2026-10-21, docs/piano-broker.md
 * G): short menu, one table of the requests with filters and what to do now.
 */
test.describe("area di lavoro del broker", () => {
  test.describe.configure({ timeout: 180_000 });

  test("Paolo trova la bozza con i filtri e la riprende dal pulsante «Completa e invia»", async ({
    browser,
  }) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await brokerLogin(page);

    // Short menu: the other pages at the bottom of the page.
    const menu = page.getByRole("navigation", { name: "Menu principale" });
    for (const name of ["Richieste", "Clienti", "Polizze"]) {
      await expect(menu.getByRole("link", { name, exact: true })).toBeVisible();
    }
    await expect(menu.getByRole("link", { name: "Rinnovi" })).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Altre pagine" }).getByRole("link", { name: "Rinnovi" }),
    ).toBeVisible();

    // A draft for a new customer, left at the first screen.
    const surname = `Lavoro${randomBytes(3).toString("hex")}`;
    await page.goto(`${WEB}/richieste/nuova`);
    await page.getByRole("link", { name: "Nuovo cliente" }).click();
    await page.getByLabel("Cognome").fill(surname);
    await page.getByLabel("Nome", { exact: true }).fill("Carla");
    await page.getByLabel("Codice fiscale").fill(newFiscalCode("Rossi", "Carla", "F"));
    await page.getByLabel("Email").fill(`e2e.carla.${randomBytes(4).toString("hex")}@example.test`);
    await page.getByRole("button", { name: "Salva e inizia la richiesta" }).click();
    await expect(page).toHaveURL(/\/tipo$/, { timeout: 30_000 });

    await page
      .getByRole("navigation", { name: "Menu principale" })
      .getByRole("link", { name: "Richieste", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "Richieste", level: 1 })).toBeVisible();
    await expect(page.getByText(/aspett(a|ano) te/)).toBeVisible();
    await page.getByLabel("Stato").selectOption({ label: "Da fare" });
    await page.getByRole("textbox", { name: "Cliente", exact: true }).fill(surname);
    await page.getByRole("button", { name: "Filtra" }).click();
    const row = page.getByRole("row", { name: new RegExp(surname) });
    // The table shows only the filtered request.
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(row).toHaveCount(1);
    await expect(row.getByText("Bozza")).toBeVisible();
    // Rule 8: the customer searched for is never in the address.
    expect(page.url()).not.toContain(surname);
    await page.screenshot({ path: "test-results/area-broker.png" });

    await row.getByRole("link", { name: /Completa e invia/ }).click();
    await expect(page).toHaveURL(/\/tipo$/);
  });
});
