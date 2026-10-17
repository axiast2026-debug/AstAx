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
 * PAG-03 (fase 5): the card is refused, the request goes back to «Offerte
 * disponibili», the signature stays and the customer pays again.
 */
test.describe.serial("Fase 5 — pagamento rifiutato", () => {
  test.describe.configure({ timeout: 420_000 });

  test("PAG-03: a refused card, back to «Offerte disponibili», a new attempt without signing again", async ({
    browser,
  }) => {
    const customer = await browser.newPage();
    const email = await newPrivate(customer);
    const { code, url } = await submittedRequest(customer, email);
    const operator = await browser.newPage();
    await backOffice(operator);
    await approve(operator, code);
    await inviteByHand(operator, await auctionCard(operator, code), "Agenzia Uno");

    const uno = await browser.newPage();
    await professional(uno, e2eState().users.owner);
    await openIncoming(uno, code);
    await uno.getByRole("button", { name: "Prendi in carico" }).click();
    await sendOffer(uno, "Compagnia Alfa", "520,00");
    await fireUntil(operator, code, "Chiusa");

    await expect(async () => {
      await customer.goto(url);
      await expect(customer.locator("#offerte li", { hasText: "Compagnia Alfa" })).toBeVisible({
        timeout: 1000,
      });
    }).toPass({ timeout: 60_000 });
    await chooseOffer(customer, url, "Compagnia Alfa");
    await signDocuments(customer);

    await payWithCard(customer, "550,00 €", "4000 0000 0000 0002");
    await expect(customer.getByText("Il pagamento non è andato a buon fine")).toBeVisible();
    await customer.goto(url);
    await expect(customer.getByText("Offerte disponibili").first()).toBeVisible();

    await customer.goto(`${url}/accettazione`);
    await expect(customer.getByText(/Documenti firmati il/)).toBeVisible();
    await payWithCard(customer, "550,00 €", "4242 4242 4242 4242");
    await expect(customer.getByRole("heading", { name: "Pagato" })).toBeVisible();
  });
});
