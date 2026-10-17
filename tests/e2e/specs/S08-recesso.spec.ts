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
import {
  inviteByHand,
  issuePolicy,
  openIncoming,
  professional,
  sendOffer,
} from "../support/agency.js";

/**
 * S08 (phase 6): the policy bought and issued (Agenzia Uno, Alfa, 520,00 €,
 * fee 30,00 €); the customer asks for the withdrawal within the term; Agenzia
 * Uno indicates 497,00 € under the company's terms; the supervisor approves
 * the refund. The customer gets 497,00 €, the fee stays; the policy is
 * «Receduta». The recovery in the next remittance is in the integration tests.
 */
test.describe.serial("S08 — recesso nei termini", () => {
  test.describe.configure({ timeout: 480_000 });

  test("PAG-04 PAG-05 S08: withdrawal asked, 497,00 € indicated by the agency, approved by the supervisor", async ({
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

    // The customer asks, within withdrawal.days of the issuance.
    await customer.goto(`${WEB}/polizze`);
    const policy = customer.locator("li", { hasText: policyNumber });
    await policy.getByRole("button", { name: "Chiedi il recesso" }).click();
    await expect(customer.getByRole("status")).toContainText("Recesso chiesto");

    // PAG-04: the agency indicates the refundable premium.
    await uno.goto(`${WEB}/polizze`);
    const toPrice = uno.getByRole("region", { name: policyNumber });
    await toPrice.getByLabel(/Premio rimborsabile/).fill("497,00");
    await toPrice.getByRole("button", { name: "Indica il premio rimborsabile" }).click();
    await expect(uno.getByRole("status")).toContainText("Premio rimborsabile indicato");

    // PAG-05: only the supervisor approves.
    const supervisor = await browser.newPage();
    await backOffice(supervisor, "supervisor");
    await supervisor.goto(`${ADMIN}/pagamenti`);
    const refund = supervisor.getByRole("region", { name: code });
    await expect(refund).toContainText("Recesso");
    await expect(refund).toContainText("497,00");
    await refund.getByRole("button", { name: "Approva ed esegui" }).click();
    await expect(supervisor.getByRole("status")).toContainText("Fatto");

    await customer.goto(`${WEB}/polizze`);
    const after = customer.locator("li", { hasText: policyNumber });
    await expect(after).toContainText("Receduta");
    await expect(after).toContainText("Recesso eseguito");
    // The fee stays: the invoice is still there, no credit note.
    await expect(after.getByRole("link", { name: "Fattura del compenso" })).toBeVisible();
  });
});
