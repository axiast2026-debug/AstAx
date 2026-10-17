import { expect, test } from "@playwright/test";
import { chooseOffer, payWithCard, signDocuments } from "../support/acceptance.js";
import { e2eState } from "../support/auth.js";
import {
  ADMIN,
  approve,
  auctionCard,
  backOffice,
  fireUntil,
  newPrivate,
  submittedRequest,
  WEB,
} from "../support/auction.js";
import { inviteByHand, openIncoming, professional, sendOffer } from "../support/agency.js";

/**
 * S05 (phase 6, EMI-04, EMI-05): the customer pays Agenzia Uno's Alfa
 * 500,00 € (530,00 € with the fee); Uno reports «Impossibile emettere»; the
 * back office finds the agency at fault. Uno loses the request; the customer
 * gets the best offer still guaranteed of another agency (Agenzia Tre, Beta
 * 520,00 €), confirms, signs and pays the difference of 20,00 €; Agenzia Tre
 * has it to issue. The reminder, the delay with the penalty of 25,00 € and the
 * 24 hours are in the workflow and integration tests.
 */
test.describe.serial("S05 — mancata emissione per colpa dell'agenzia", () => {
  test.describe.configure({ timeout: 480_000 });

  test("EMI-04 EMI-05 S05: Uno cannot issue, at fault; second offer of Tre, 20,00 € paid", async ({
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
      [uno, "Compagnia Alfa", "500,00", 4],
      [tre, "Compagnia Beta", "520,00", 4],
      [cinque, "Compagnia Beta", "530,00", 4],
    ] as const) {
      await openIncoming(page, code);
      await page.getByRole("button", { name: "Prendi in carico" }).click();
      await sendOffer(page, company, premium, days);
    }
    await fireUntil(operator, code, "Chiusa");

    await expect(async () => {
      await customer.goto(url);
      await expect(customer.locator("#offerte li", { hasText: /Compagnia/ })).toHaveCount(2, {
        timeout: 1000,
      });
    }).toPass({ timeout: 60_000 });
    await chooseOffer(customer, url, "Compagnia Alfa");
    await signDocuments(customer);
    await payWithCard(customer, "530,00 €", "4242 4242 4242 4242");

    // Uno cannot issue and says so.
    await uno.goto(`${WEB}/da-emettere`);
    await uno.locator("tr", { hasText: code }).getByRole("link").first().click();
    await uno.getByLabel("Impossibile emettere").check();
    await uno.getByLabel("Descrizione").fill("La compagnia non accetta il rischio");
    await uno.getByRole("button", { name: "Invia la segnalazione" }).click();
    await expect(uno.getByRole("status")).toContainText("Segnalazione inviata");

    // The back office: the agency's fault.
    await operator.goto(`${ADMIN}/eccezioni`);
    const problem = operator.getByRole("region", { name: code });
    await expect(problem).toContainText("Impossibile emettere");
    await problem.getByRole("radio", { name: "Dell'agenzia", exact: true }).check();
    await problem.getByLabel("Motivo").fill("Rifiuto della compagnia non motivato");
    await problem.getByRole("button", { name: "Decidi" }).click();
    await expect(operator.getByRole("status")).toContainText("Decisione registrata");

    // EMI-04: Uno has lost the request.
    await uno.goto(`${WEB}/da-emettere`);
    await expect(uno.locator("tr", { hasText: code })).toHaveCount(0);

    // The second offer: Tre's Beta 520,00 €, 20,00 € to pay, the fee unchanged.
    await customer.goto(url);
    await expect(customer.getByText("L'agenzia non ha potuto emettere la polizza")).toBeVisible();
    await expect(customer.getByText("Differenza da pagare")).toBeVisible();
    await expect(customer.locator("dd", { hasText: "20,00" }).first()).toBeVisible();
    await customer.getByRole("button", { name: "Confermo questa offerta" }).click();
    await expect(customer).toHaveURL(/\/accettazione$/);
    await signDocuments(customer);
    await payWithCard(customer, "20,00 €", "4242 4242 4242 4242");
    await expect(customer.getByRole("heading", { name: "Pagato" })).toBeVisible();

    // Agenzia Tre (its owner, who issues) has it to issue, with the customer's contacts.
    const treOwner = await browser.newPage();
    await professional(treOwner, users.tre);
    await treOwner.goto(`${WEB}/da-emettere`);
    await expect(treOwner.locator("tr", { hasText: code })).toContainText(email);
  });
});
