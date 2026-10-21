import { expect, test } from "@playwright/test";
import { chooseOffer, payWithCard, signDocuments } from "../support/acceptance.js";
import { e2eState } from "../support/auth.js";
import {
  approve,
  auctionCard,
  backOffice,
  fireUntil,
  newPrivate,
  submittedRequest,
  WEB,
} from "../support/auction.js";
import {
  inviteByHand,
  issuePolicy,
  openIncoming,
  professional,
  sendOffer,
} from "../support/agency.js";

/**
 * S01 up to the payment (fase 5): the best offer per company without agency
 * names, the AI comparison with the fee going from 30 to 35 €, the free choice
 * of Alfa (not the cheapest), the signature and the card payment of
 * 520 + 35 = 555 €; then Agenzia Uno finds the request in «Da emettere» with
 * the customer's contacts (VIS-02). Phase 6: Agenzia Uno issues (EMI-02), the
 * customer finds the policy and the fee invoice in «Polizze», and «Risultati»
 * shows Uno third of three (CLA-02, CLA-03), without agencies nor companies.
 * The remittance of the next Monday is in the integration tests.
 */
test.describe.serial("S01 — privato con confronto AI", () => {
  test.describe.configure({ timeout: 480_000 });

  test("PRES-02 PRES-06 FEE-01 PAG-02 VIS-02 S01: offers, AI comparison, Alfa chosen, signed, 555,00 € paid, contacts to Agenzia Uno", async ({
    browser,
  }) => {
    const customer = await browser.newPage();
    const email = await newPrivate(customer);
    const { code, url } = await submittedRequest(customer, email);
    const operator = await browser.newPage();
    await backOffice(operator);
    await approve(operator, code);
    for (const agency of ["Agenzia Uno", "Agenzia Tre", "Agenzia Cinque"]) {
      await inviteByHand(operator, await auctionCard(operator, code), agency);
    }

    const { users } = e2eState();
    const uno = await browser.newPage();
    await professional(uno, users.owner);
    const tre = await browser.newPage();
    await professional(tre, users.sofia);
    const cinque = await browser.newPage();
    await professional(cinque, users.cinque);
    for (const [page, company, premium, days] of [
      [uno, "Compagnia Alfa", "520,00", 4],
      [tre, "Compagnia Beta", "505,00", 2],
      [cinque, "Compagnia Beta", "505,00", 5],
    ] as const) {
      await openIncoming(page, code);
      await page.getByRole("button", { name: "Prendi in carico" }).click();
      await sendOffer(page, company, premium, days);
    }
    await fireUntil(operator, code, "Chiusa");

    // PRES-02, PRES-04: one row per company, the cheapest marked, no agency name.
    await expect(async () => {
      await customer.goto(url);
      await expect(customer.locator("#offerte li", { hasText: /Compagnia/ })).toHaveCount(2, {
        timeout: 1000,
      });
    }).toPass({ timeout: 60_000 });
    const offers = customer.locator("#offerte");
    await expect(offers.locator("li", { hasText: "Compagnia Beta" })).toContainText(
      "Più conveniente",
    );
    await expect(offers.locator("li", { hasText: "Compagnia Alfa" })).toContainText("520,00");
    expect(await offers.innerText()).not.toMatch(/Agenzia (Uno|Tre|Cinque)/);
    await expect(offers.getByText(/Il nostro compenso: 30,00/)).toBeVisible();

    // PRES-06, FEE-01: the fee goes from 30 to 35 € before the comparison.
    await customer.getByRole("link", { name: "Confronta con AI" }).click();
    await expect(customer.getByText(/passa da 30,00\s€ a 35,00\s€/)).toBeVisible();
    await customer.getByRole("button", { name: "Confronta con AI" }).click();
    await expect(
      customer.getByRole("heading", { name: "Suggerimento generato con AI" }),
    ).toBeVisible();
    await expect(offers.getByText(/Il nostro compenso: 35,00/)).toBeVisible();

    // PRES-05: the free choice of Alfa, the documents, the signature.
    await chooseOffer(customer, url, "Compagnia Alfa");
    await expect(customer.getByText("Totale da pagare")).toBeVisible();
    await expect(customer.locator("dd", { hasText: "555,00" })).toBeVisible();
    await expect(customer.getByRole("link", { name: "Informativa precontrattuale" })).toBeVisible();
    await expect(customer.getByRole("link", { name: "Lettera di incarico" })).toBeVisible();
    await signDocuments(customer);

    // PAG-01, PAG-02: the card payment; the issuing agency and the deadline.
    await payWithCard(customer, "555,00 €", "4242 4242 4242 4242");
    await expect(customer.getByRole("heading", { name: "Pagato" })).toBeVisible();
    await expect(customer.getByText(/Emissione entro il/)).toBeVisible();
    await customer.goto(url);
    await expect(customer.getByText("In emissione").first()).toBeVisible();

    // EMI-01, VIS-02: Agenzia Uno has the contacts only now, in «Da emettere».
    await uno.goto(`${WEB}/da-emettere`);
    const row = uno.locator("tr", { hasText: code });
    await expect(row).toBeVisible();
    await expect(row).toContainText(email);
    await expect(row).toContainText("520,00");

    // EMI-02: issued with the three documents; the customer is told.
    const policyNumber = `ALFA-${code.slice(-6)}`;
    await issuePolicy(uno, code, policyNumber);
    await customer.goto(`${WEB}/polizze`);
    const policy = customer.locator("li", { hasText: policyNumber });
    await expect(policy).toBeVisible();
    await expect(policy.getByRole("link", { name: "Fattura del compenso" })).toBeVisible();
    await expect(policy.getByRole("link", { name: "Polizza", exact: true })).toBeVisible();

    // CLA-02 CLA-03: published at the signature; Uno is third of three, 3,0 % from the first.
    // Won and paid: in the tab «Vinte» (Dan, 2026-10-21).
    await uno.goto(`${WEB}/risultati?scheda=vinte`);
    const ranking = uno.locator("li", { hasText: code });
    await expect(ranking).toContainText("3ª su 3");
    await expect(ranking).toContainText("Prima 505,00");
    expect(await ranking.innerText()).not.toMatch(/Agenzia|Compagnia/);
  });
});
