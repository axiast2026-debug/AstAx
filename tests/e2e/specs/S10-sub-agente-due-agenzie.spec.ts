import { expect, test } from "@playwright/test";
import { e2eState } from "../support/auth.js";
import {
  approve,
  auctionCard,
  backOffice,
  newPrivate,
  submittedRequest,
  WEB,
} from "../support/auction.js";
import {
  inviteByHand,
  openIncoming,
  professional,
  sendOffer,
  switchTo,
} from "../support/agency.js";

/**
 * S10 (fase 4): Marco Rossi works for Agenzia Uno and Agenzia Tre, both
 * invited to the same auction. One person works on it for one agency only,
 * and makes one offer only (OFF-02, OFF-03); his colleague Sofia offers for Tre.
 */
test.describe.serial("S10 — sub-agente di due agenzie", () => {
  test.describe.configure({ timeout: 360_000 });

  test("OFF-01 OFF-02 OFF-03 VIS-06 S10: Marco works on the request for one agency only; Sofia offers for Tre", async ({
    browser,
  }) => {
    const customer = await browser.newPage();
    const email = await newPrivate(customer);
    const { code } = await submittedRequest(customer, email);
    const operator = await browser.newPage();
    await backOffice(operator);
    await approve(operator, code);
    // Both agencies invited, whatever the automatic choice (ASTA-06).
    for (const agency of ["Agenzia Uno", "Agenzia Tre"]) {
      await inviteByHand(operator, await auctionCard(operator, code), agency);
    }

    const { users } = e2eState();
    const marco = await browser.newPage();
    await professional(marco, users.marco);
    await expect(marco).toHaveURL(`${WEB}/contesto`);
    await marco
      .locator("div", { hasText: "Agenzia Uno" })
      .getByRole("button", { name: "Lavora per questa" })
      .first()
      .click();

    // Marco claims for Agenzia Uno.
    await openIncoming(marco, code);
    await marco.getByRole("button", { name: "Prendi in carico" }).click();
    await expect(marco.getByRole("heading", { name: "La tua offerta" })).toBeVisible();

    // In Agenzia Tre the request says so, and claim and offer are blocked.
    await switchTo(marco, "Agenzia Tre");
    await openIncoming(marco, code);
    await expect(
      marco.getByText("Hai già preso in carico questa richiesta per Agenzia Uno"),
    ).toBeVisible();
    await expect(marco.getByRole("button", { name: "Prendi in carico" })).toHaveCount(0);
    await expect(marco.getByRole("heading", { name: "La tua offerta" })).toHaveCount(0);

    // Released in Uno without an offer: he may claim for Tre.
    await switchTo(marco, "Agenzia Uno");
    await openIncoming(marco, code);
    await marco.getByRole("button", { name: "Rilascia" }).click();
    await switchTo(marco, "Agenzia Tre");
    await openIncoming(marco, code);
    await marco.getByRole("button", { name: "Prendi in carico" }).click();
    await expect(marco.getByRole("heading", { name: "La tua offerta" })).toBeVisible();
    await marco.getByRole("button", { name: "Rilascia" }).click();

    // Sofia, colleague in Agenzia Tre, claims and offers for Tre.
    const sofia = await browser.newPage();
    await professional(sofia, users.sofia);
    await openIncoming(sofia, code);
    await sofia.getByRole("button", { name: "Prendi in carico" }).click();
    await sendOffer(sofia, "Compagnia Beta", "480,00");

    // Marco offers for Agenzia Uno; then Tre stays closed to him (one offer per person).
    await switchTo(marco, "Agenzia Uno");
    await openIncoming(marco, code);
    await marco.getByRole("button", { name: "Prendi in carico" }).click();
    await sendOffer(marco, "Compagnia Alfa", "470,00");
    await switchTo(marco, "Agenzia Tre");
    await openIncoming(marco, code);
    await expect(
      marco.getByText("Hai già fatto un'offerta su questa richiesta per Agenzia Uno"),
    ).toBeVisible();
    await expect(marco.getByRole("heading", { name: /La tua offerta|Modifica/ })).toHaveCount(0);
  });
});
