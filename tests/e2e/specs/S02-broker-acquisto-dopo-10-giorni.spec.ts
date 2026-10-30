import { SystemClock } from "@astax/adapters/clock";
import { romeCalendarDate } from "@astax/shared/format";
import { expect, test } from "@playwright/test";
import { e2eState } from "../support/auth.js";
import { ADMIN, approve, auctionCard, backOffice, fireUntil, WEB } from "../support/auction.js";
import {
  inviteByHand,
  issuePolicy,
  openIncoming,
  professional,
  sendOffer,
} from "../support/agency.js";
import { brokerLogin, submittedBrokerRequest } from "../support/broker.js";
import { codeFromMail, latestMail } from "../support/requests.js";

const clock = new SystemClock();

/**
 * S02 (phases 5 and 6; ADR 0027, Dan 2026-10-30): Paolo sees the offers
 * without «Confronta con AI», chooses Alfa and pays the premium only
 * (FEE-03); then gives Anna's email and Anna signs on the link with the code.
 * Phase 6: Agenzia Uno issues, the back office issues the monthly invoices B
 * and the broker's owner sees the policy with the 30,00 € due and its invoice
 * (CONT-03, CONT-05).
 */
test.describe.serial("S02 — broker: acquista l'offerta, il cliente firma dal link", () => {
  test.describe.configure({ timeout: 480_000 });

  test("PRES-06 FEE-03 GAR-04 S02: «Scegli e acquista», 610,00 € paid, then the customer signs", async ({
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
    // ADR 0027: Paolo buys Alfa and pays the premium only.
    await paolo.getByRole("button", { name: /Scegli e acquista Compagnia Alfa/ }).click();
    await expect(paolo).toHaveURL(/\/pagamento-di-prova\//);
    await expect(paolo.getByText("610,00 €").first()).toBeVisible();
    await paolo.getByLabel("Numero della carta").fill("4242 4242 4242 4242");
    await paolo.getByRole("button", { name: "Paga con carta" }).click();
    await expect(paolo).toHaveURL(/\/richieste\/[0-9a-f-]{36}/);
    await expect(async () => {
      await paolo.goto(url);
      await expect(paolo.getByRole("heading", { name: /Offerta acquistata/ })).toBeVisible({
        timeout: 1000,
      });
    }).toPass({ timeout: 30_000 });
    // VIS-02: nothing to the agency before the customer's signature.
    await uno.goto(`${WEB}/da-emettere`);
    await expect(uno.locator("tr", { hasText: code })).toHaveCount(0);

    // Then Anna's email and the link to sign.
    const sentAt = clock.now().getTime() - 1000;
    await paolo.getByLabel("Email del cliente").fill(email);
    await paolo.getByRole("button", { name: "Invia il link per la firma" }).click();
    await expect(paolo.getByText(/Link per la firma inviato: vale fino al/)).toBeVisible();

    // Question 15A: the email names company, product and the premium.
    const mail = await latestMail(email, /firma la tua polizza RC auto/, sentAt);
    expect(mail.text).toContain("610,00");
    const link = /http:\/\/localhost:3000\/offerta\/[A-Za-z0-9_-]+/.exec(mail.text)?.[0] ?? "";
    const anna = await browser.newPage();
    await anna.goto(link);
    // Before the code the page shows no price.
    await expect(anna.getByText("610,00")).toHaveCount(0);
    const codeAt = clock.now().getTime() - 1000;
    await anna.getByRole("button", { name: "Mandami il codice" }).click();
    await anna.getByLabel("Codice ricevuto").fill(await codeFromMail(email, codeAt));
    await anna.getByRole("button", { name: "Vedi la polizza" }).click();

    // Only the offer bought; Anna reads and signs, nothing to pay.
    await expect(anna.locator("li", { hasText: /Compagnia/ })).toHaveCount(1);
    await expect(anna.getByRole("link", { name: "Lettera di incarico" })).toHaveCount(0);
    await expect(anna.getByRole("button", { name: /^Paga/ })).toHaveCount(0);
    await anna.getByLabel("Ho letto i documenti").check();
    await anna.getByRole("button", { name: "Firma", exact: true }).click();
    await expect(anna).toHaveURL(/\/firma-di-prova\//);
    await anna.getByLabel("Codice ricevuto").fill("123456");
    await anna.getByRole("button", { name: "Firma", exact: true }).click();
    await expect(anna).toHaveURL(/\/offerta\/firmato$/);
    await expect(anna.getByRole("heading", { name: "Hai firmato" })).toBeVisible();

    await paolo.goto(url);
    await expect(paolo.getByText(/Il cliente ha firmato/)).toBeVisible();
    await uno.goto(`${WEB}/da-emettere`);
    await expect(uno.locator("tr", { hasText: code })).toContainText(email);

    // Phase 6, CONT-03 CONT-05: Agenzia Uno issues; the monthly invoice B bills
    // the broker 30,00 € for this policy; the owner's statement shows it as due.
    const policyNumber = `BRK-${code.slice(-6)}`;
    await issuePolicy(uno, code, policyNumber);
    const supervisor = await browser.newPage();
    await backOffice(supervisor, "supervisor");
    await supervisor.goto(`${ADMIN}/fatturazione`);
    await supervisor
      .getByLabel("Mese delle fatture ai broker")
      .fill(romeCalendarDate(clock.now()).slice(0, 7));
    await supervisor.getByRole("button", { name: "Emetti le fatture mensili ai broker" }).click();
    await expect(supervisor.getByRole("status")).toBeVisible();
    const owner = await browser.newPage();
    await brokerLogin(owner, "brokerOwner");
    await owner.goto(`${WEB}/contabilita`);
    const row = owner.locator("tr", { hasText: code });
    await expect(row).toContainText(policyNumber);
    await expect(row).toContainText("30,00");
    await expect(row).toContainText(/B-\d{4}-\d{6}/);
    await expect(owner.getByRole("link", { name: "Esporta in CSV" })).toBeVisible();
  });
});
