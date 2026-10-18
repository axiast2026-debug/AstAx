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
 * S08 (phase 6), with Dan's answer 18 (2026-10-18): the policy bought and
 * issued (Agenzia Uno, Alfa, 520,00 €, fee 30,00 €). With
 * `withdrawal.onPlatform` off (the starting value) the customer withdraws
 * outside the platform: the policy page has no withdrawal button and points
 * to the agency. The withdrawal flow itself (497,00 € indicated by the
 * agency, the supervisor's approval, the recovery in the remittance) is in
 * the integration tests, with the parameter on.
 */
test.describe.serial("S08 — recesso fuori dal portale", () => {
  test.describe.configure({ timeout: 480_000 });

  test("PAG-04 S08: after the issuance the customer is sent to the agency for withdrawal", async ({
    browser,
  }) => {
    const customer = await browser.newPage();
    const email = await newPrivate(customer);
    const { code, url } = await submittedRequest(customer, email);
    const operator = await browser.newPage();
    await backOffice(operator);
    await approve(operator, code);
    await inviteByHand(operator, await auctionCard(operator, code), "Agenzia Uno");

    const { users } = e2eState();
    const uno = await browser.newPage();
    await professional(uno, users.owner);
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
    await payWithCard(customer, "550,00 €", "4242 4242 4242 4242");
    const policyNumber = `REC-${code.slice(-6)}`;
    await issuePolicy(uno, code, policyNumber);

    // Question 18: no withdrawal through AstAx; the page names the agency.
    await customer.goto(`${WEB}/polizze`);
    const policy = customer.locator("li", { hasText: policyNumber });
    await expect(policy).toContainText("emessa: Agenzia Uno");
    await expect(policy.getByRole("button", { name: "Chiedi il recesso" })).toHaveCount(0);
    // The fee's invoice is there as usual.
    await expect(policy.getByRole("link", { name: "Fattura del compenso" })).toBeVisible();
  });
});
