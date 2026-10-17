import { SystemClock } from "@astax/adapters/clock";
import { expect, test } from "@playwright/test";
import { payWithCard, signDocuments } from "../support/acceptance.js";
import { e2eState } from "../support/auth.js";
import { approve, auctionCard, backOffice, fireUntil, WEB } from "../support/auction.js";
import { inviteByHand, openIncoming, professional, sendOffer } from "../support/agency.js";
import { brokerLogin, submittedBrokerRequest } from "../support/broker.js";
import { codeFromMail, latestMail } from "../support/requests.js";

const clock = new SystemClock();

/**
 * S02 up to the payment (fase 5): Paolo sees the offers without «Confronta
 * con AI», sends Alfa to Anna; Anna opens the link, confirms with the code,
 * signs and pays the premium only (FEE-03). The ten days of waiting and the
 * broker's invoice are phase 6; the link's end with the guarantee (GAR-02) is
 * in the integration tests.
 */
test.describe.serial("S02 — broker: il cliente compra dal link", () => {
  test.describe.configure({ timeout: 480_000 });

  test("PRES-06 FEE-03 GAR-04 S02: «Invia al cliente», code, signature and 610,00 € paid, no fee", async ({
    browser,
  }) => {
    const paolo = await browser.newPage();
    await brokerLogin(paolo);
    const { code, url, email } = await submittedBrokerRequest(paolo, () => browser.newPage());
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
      [uno, "Compagnia Alfa", "610,00"],
      [tre, "Compagnia Beta", "640,00"],
    ] as const) {
      await openIncoming(page, code);
      await page.getByRole("button", { name: "Prendi in carico" }).click();
      await sendOffer(page, company, premium);
    }
    await fireUntil(operator, code, "Chiusa");

    // PRES-06: the broker sees the offers, without the AI comparison.
    await expect(async () => {
      await paolo.goto(url);
      await expect(paolo.locator("#offerte li", { hasText: /Compagnia/ })).toHaveCount(2, {
        timeout: 1000,
      });
    }).toPass({ timeout: 60_000 });
    await expect(paolo.getByRole("link", { name: "Confronta con AI" })).toHaveCount(0);
    const sentAt = clock.now().getTime() - 1000;
    await paolo.getByLabel(/Compagnia Alfa/).check();
    await paolo.getByRole("button", { name: "Invia al cliente" }).click();
    await expect(paolo.getByText(/Link inviato: vale fino al/)).toBeVisible();

    // Rule 8: the email names company and product, never the price.
    const mail = await latestMail(email, /la tua offerta RC auto/, sentAt);
    expect(mail.text).not.toMatch(/610,00|€/);
    const link = /http:\/\/localhost:3000\/offerta\/[A-Za-z0-9_-]+/.exec(mail.text)?.[0] ?? "";
    const anna = await browser.newPage();
    await anna.goto(link);
    await expect(anna.getByText("610,00")).toHaveCount(0);
    const codeAt = clock.now().getTime() - 1000;
    await anna.getByRole("button", { name: "Mandami il codice" }).click();
    await anna.getByLabel("Codice ricevuto").fill(await codeFromMail(email, codeAt));
    await anna.getByRole("button", { name: "Vedi l'offerta" }).click();

    // Only the offer sent; Anna chooses, signs and pays the premium only.
    await expect(anna.locator("li", { hasText: /Compagnia/ })).toHaveCount(1);
    await anna.getByRole("button", { name: "Scegli questa offerta" }).click();
    await expect(anna.getByText("Nessun compenso")).toBeVisible();
    await expect(anna.getByRole("link", { name: "Lettera di incarico" })).toHaveCount(0);
    await signDocuments(anna, /\/offerta\/[A-Za-z0-9_-]+$/);
    await payWithCard(anna, "610,00 €", "4242 4242 4242 4242", /\/offerta\/[A-Za-z0-9_-]+\?esito=/);
    await expect(anna.getByRole("heading", { name: "Pagato" })).toBeVisible();

    await paolo.goto(url);
    await expect(paolo.getByText(/Il cliente ha pagato/)).toBeVisible();
    await uno.goto(`${WEB}/da-emettere`);
    await expect(uno.locator("tr", { hasText: code })).toContainText(email);
  });
});
