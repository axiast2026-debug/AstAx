import { SystemClock } from "@astax/adapters/clock";
import { romeCalendarDate } from "@astax/shared/format";
import { expect, test } from "@playwright/test";
import { payWithCard, signDocuments } from "../support/acceptance.js";
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
 * S02 (phases 5 and 6): Paolo sees the offers without «Confronta
 * con AI», sends Alfa to Anna; Anna opens the link, confirms with the code,
 * signs and pays the premium only (FEE-03). Phase 6: Agenzia Uno issues, the
 * back office issues the monthly invoices B and the broker's owner sees the
 * policy with the 30,00 € due and its invoice (CONT-03, CONT-05). The ten
 * days of waiting and the link's end with the guarantee (GAR-02) are in the
 * integration tests.
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

    // Question 15A: the email names company, product and the premium.
    const mail = await latestMail(email, /la tua offerta RC auto/, sentAt);
    expect(mail.text).toContain("610,00");
    const link = /http:\/\/localhost:3000\/offerta\/[A-Za-z0-9_-]+/.exec(mail.text)?.[0] ?? "";
    const anna = await browser.newPage();
    // Decision 42: the code leaves with the opening, with no tap; the page asks for it at once.
    const codeAt = clock.now().getTime() - 1000;
    await anna.goto(link);
    // Before the code the page shows no price.
    await expect(anna.getByText("610,00")).toHaveCount(0);
    await expect(anna.getByRole("button", { name: "Mandami il codice" })).toHaveCount(0);
    await expect(anna.getByRole("button", { name: "Mandami un altro codice" })).toBeDisabled();
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
