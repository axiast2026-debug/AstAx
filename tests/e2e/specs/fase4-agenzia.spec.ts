import { expect, test } from "@playwright/test";
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
 * Fase 4: the agency area (spec 04). The owner of Agenzia Uno finds the
 * request in «Richieste in arrivo», opens it (logged, never a contact),
 * claims it and sends a binding offer with its PDF; the offer stays sealed.
 */
test.describe.serial("fase 4 — area agenzia", () => {
  test.describe.configure({ timeout: 300_000 });

  test("OFF-03 OFF-04 VIS-01 VIS-09: the agency claims the request and sends a sealed, binding offer", async ({
    browser,
  }) => {
    const customer = await browser.newPage();
    const email = await newPrivate(customer);
    const { code } = await submittedRequest(customer, email);
    const operator = await browser.newPage();
    await backOffice(operator);
    await approve(operator, code);
    await auctionCard(operator, code);

    const { users, password } = e2eState();
    const agency = await browser.newPage();
    await agency.goto(`${WEB}/auth/login?as=pro`);
    const secret = savedSecret(users.owner);
    if (secret) await loginProfessionalAgain(agency, users.owner, password, secret);
    else saveSecret(users.owner, await loginProfessional(agency, users.owner, password));
    await acceptLegalIfAsked(agency);
    await expect(agency.getByRole("heading", { name: "La tua agenzia" })).toBeVisible();

    await agency
      .getByRole("navigation", { name: "Menu principale" })
      .getByRole("link", { name: "Richieste in arrivo" })
      .click();
    await agency.getByRole("link", { name: code }).click();
    await expect(agency.getByText("Ogni apertura di questa richiesta")).toBeVisible();
    // VIS-01: the customer's email never reaches the agency.
    expect(await agency.locator("main").innerText()).not.toContain(email);

    await agency.getByRole("button", { name: "Prendi in carico" }).click();
    await expect(agency.getByRole("heading", { name: "La tua offerta" })).toBeVisible();
    await agency.getByLabel("Premio annuo lordo (€)").fill("505,00");
    await agency.getByLabel("Compagnia", { exact: true }).selectOption({ label: "Compagnia Alfa" });
    const product = agency.getByLabel("Prodotto", { exact: true });
    const alfa = product.locator('optgroup[label="Compagnia Alfa"] option').first();
    await product.selectOption((await alfa.getAttribute("value")) ?? "");
    await agency.getByLabel("Massimale unico (€)").fill("10000000");
    await agency.getByLabel("PDF del preventivo").setInputFiles({
      name: "preventivo.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 e2e offerta"),
    });
    await agency.getByLabel(/Confermo che l'offerta è vincolante/).check();
    await agency.getByRole("button", { name: "Invia l'offerta" }).click();
    await expect(agency.getByText("Offerta registrata")).toBeVisible();
    await expect(agency.getByRole("heading", { name: "Modifica la tua offerta" })).toBeVisible();

    await agency.goto(`${WEB}/le-mie-offerte`);
    const row = agency.getByRole("row", { name: new RegExp(code) });
    await expect(row.getByText("In corso")).toBeVisible();
    // The agency reads its own premium from its owner copy (BC-04).
    await expect(row.getByText(/505,00/)).toBeVisible();

    // ASTA-05 VIS-06: filters and capacity; saving the capacity as it is changes nothing.
    await agency.goto(`${WEB}/filtri`);
    await expect(agency.getByRole("heading", { name: "Filtri dell'agenzia" })).toBeVisible();
    await expect(agency.getByRole("heading", { name: "I miei filtri personali" })).toBeVisible();
    await agency.getByRole("button", { name: "Salva capacità e orari" }).click();
    await expect(agency.getByText("Modifiche salvate.")).toBeVisible();

    // Decision 17: the product library with its information set.
    await agency.goto(`${WEB}/agenzia`);
    await expect(agency.getByRole("heading", { name: "Libreria prodotti" })).toBeVisible();
    const first = agency.locator("section", { hasText: "RC Auto Alfa" }).first();
    await first.getByLabel(/^DIP per/).setInputFiles({
      name: "dip.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 e2e dip"),
    });
    await first
      .getByRole("button", { name: /Carica|Sostituisci/ })
      .first()
      .click();
    await expect(agency.getByText("Modifiche salvate.")).toBeVisible();

    // VIS-08: the owner sees the opening of the request in the access log.
    await agency.goto(`${WEB}/team`);
    await expect(agency.getByRole("heading", { name: "Team", exact: true })).toBeVisible();
    await agency.getByRole("link", { name: "Registro degli accessi" }).click();
    await expect(
      agency
        .getByRole("row", { name: new RegExp(`Ha aperto i dati della richiesta ${code}`) })
        .first(),
    ).toBeVisible();
  });
});
