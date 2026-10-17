import { expect, test } from "@playwright/test";
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
 * S06 (fase 4, end to end): Agenzia Tre and Agenzia Cinque offer Beta at the
 * same price; Cinque guarantees it longer, so Cinque's is the Beta row shown
 * to the customer (PRES-01, CLA-01). The variant with the same date is in the
 * domain and closing tests (auction-rules.test.ts, activities.int.test.ts).
 */
test.describe.serial("S06 — due offerte allo stesso prezzo", () => {
  test.describe.configure({ timeout: 360_000 });

  test("PRES-01 CLA-01 S06: same premium, the longer guarantee wins and is the Beta row the customer sees", async ({
    browser,
  }) => {
    const customer = await browser.newPage();
    const email = await newPrivate(customer);
    const { code, url } = await submittedRequest(customer, email);
    const operator = await browser.newPage();
    await backOffice(operator);
    await approve(operator, code);
    for (const agency of ["Agenzia Tre", "Agenzia Cinque"]) {
      await inviteByHand(operator, await auctionCard(operator, code), agency);
    }

    const { users } = e2eState();
    const sofia = await browser.newPage();
    await professional(sofia, users.sofia);
    await openIncoming(sofia, code);
    await sofia.getByRole("button", { name: "Prendi in carico" }).click();
    await sendOffer(sofia, "Compagnia Beta", "505,00");

    const cinque = await browser.newPage();
    await professional(cinque, users.cinque);
    await openIncoming(cinque, code);
    await cinque.getByRole("button", { name: "Prendi in carico" }).click();
    await sendOffer(cinque, "Compagnia Beta", "505,00", 3);
    const longer = await cinque.getByLabel("Prezzo garantito fino al").inputValue();

    await fireUntil(operator, code, "Chiusa");
    // The customer reads the date in words, as «21 novembre 2026».
    const longerText = new Intl.DateTimeFormat("it-IT", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Rome",
    }).format(new Date(`${longer}T12:00:00Z`));
    await expect(async () => {
      await customer.goto(url);
      const beta = customer.locator("li", { hasText: "Compagnia Beta" });
      await expect(beta).toHaveCount(1, { timeout: 1000 });
      await expect(beta).toContainText("505,00");
      await expect(beta).toContainText(`Garantito fino al ${longerText}`);
    }).toPass({ timeout: 60_000 });
  });
});
