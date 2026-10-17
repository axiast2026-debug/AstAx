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
} from "../support/auction.js";
import { inviteByHand, openIncoming, professional, sendOffer } from "../support/agency.js";

/**
 * S09 (FEE-01, FEE-02): offers of Alfa 180,00 € and Beta 195,00 €; the
 * customer buys Alfa without the AI comparison and pays 195,00 € (fee 15,00 €
 * under the 200,00 € threshold). The variants (20,00 € with the AI, the full
 * fee at exactly 200,00 €, 30,00 € owed by a broker) are in the unit tests of
 * the fee and in the broker's monthly invoice.
 */
test.describe.serial("S09 — premio sotto i 200 €", () => {
  test.describe.configure({ timeout: 480_000 });

  test("FEE-01 FEE-02 S09: Alfa 180,00 € bought without AI, 195,00 € paid with the fee of 15,00 €", async ({
    browser,
  }) => {
    const customer = await browser.newPage();
    const email = await newPrivate(customer);
    const { code, url } = await submittedRequest(customer, email);
    const operator = await browser.newPage();
    await backOffice(operator);
    await approve(operator, code);
    for (const agency of ["Agenzia Uno", "Agenzia Tre"]) {
      await inviteByHand(operator, await auctionCard(operator, code), agency);
    }
    const { users } = e2eState();
    const uno = await browser.newPage();
    await professional(uno, users.owner);
    const tre = await browser.newPage();
    await professional(tre, users.sofia);
    for (const [page, company, premium] of [
      [uno, "Compagnia Alfa", "180,00"],
      [tre, "Compagnia Beta", "195,00"],
    ] as const) {
      await openIncoming(page, code);
      await page.getByRole("button", { name: "Prendi in carico" }).click();
      await sendOffer(page, company, premium);
    }
    await fireUntil(operator, code, "Chiusa");

    await expect(async () => {
      await customer.goto(url);
      await expect(customer.locator("#offerte li", { hasText: /Compagnia/ })).toHaveCount(2, {
        timeout: 1000,
      });
    }).toPass({ timeout: 60_000 });
    // FEE-02: the reduced fee is shown before the choice.
    await expect(
      customer
        .locator("#offerte")
        .getByText(/Il nostro compenso: 15,00/)
        .first(),
    ).toBeVisible();

    await chooseOffer(customer, url, "Compagnia Alfa");
    await expect(customer.locator("dd", { hasText: "195,00" })).toBeVisible();
    await signDocuments(customer);
    await payWithCard(customer, "195,00 €", "4242 4242 4242 4242");
    await expect(customer.getByRole("heading", { name: "Pagato" })).toBeVisible();
  });
});
