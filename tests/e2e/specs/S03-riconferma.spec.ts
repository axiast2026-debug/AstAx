import { expect, test, type Page } from "@playwright/test";
import { e2eState } from "../support/auth.js";
import {
  ADMIN,
  approve,
  auctionCard,
  backOffice,
  fireUntil,
  newPrivate,
  submittedRequest,
} from "../support/auction.js";
import {
  inviteByHand,
  moveClock,
  openIncoming,
  professional,
  sendOffer,
} from "../support/agency.js";

/**
 * S03 (fase 4): the guarantees expire, the customer asks for a reconfirmation
 * and the agencies of the last round answer from their screens: Uno confirms
 * the same premium, Tre updates it (with a new quote), Cinque declines. The
 * customer then sees only the new answers (GAR-06, GAR-07, BC-06, PRES-02).
 * The development clock (rule 13) stands in for the weeks of waiting and is
 * put back at the end. The exact deadlines are in the worker's tests.
 */
async function claimReconfirmation(page: Page, code: string): Promise<void> {
  await openIncoming(page, code);
  await expect(page.getByRole("heading", { name: "Rispondi alla riconferma" })).toBeHidden();
  await page.getByRole("button", { name: "Prendi in carico" }).click();
  await expect(page.getByRole("heading", { name: "Rispondi alla riconferma" })).toBeVisible();
}

test.describe.serial("S03 — garanzie scadute e riconferma", () => {
  test.describe.configure({ timeout: 600_000 });

  test("GAR-06 GAR-07 BC-06 PRES-02 S03: «Scaduta», «Chiedi riconferma», confirm, update and decline, new offers", async ({
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

    // The main round: three offers from the agencies' screens.
    const { users } = e2eState();
    const uno = await browser.newPage();
    await professional(uno, users.owner);
    const tre = await browser.newPage();
    await professional(tre, users.sofia);
    const cinque = await browser.newPage();
    await professional(cinque, users.cinque);
    for (const [page, company, premium] of [
      [uno, "Compagnia Alfa", "450,00"],
      [tre, "Compagnia Gamma", "480,00"],
      [cinque, "Compagnia Delta", "470,00"],
    ] as const) {
      await openIncoming(page, code);
      await page.getByRole("button", { name: "Prendi in carico" }).click();
      await sendOffer(page, company, premium);
    }
    await fireUntil(operator, code, "Chiusa");

    try {
      // 30 days of validity plus a few: every guarantee has ended.
      await moveClock(operator, 45 * 24 * 60);
      await expect(async () => {
        await customer.goto(url);
        if (await customer.getByRole("button", { name: "Chiedi riconferma" }).isVisible()) return;
        await operator.goto(`${ADMIN}/aste?codice=${code}`);
        const fire = operator
          .getByRole("region", { name: code })
          .last()
          .getByRole("button", { name: "Fai scattare il prossimo passo" });
        if (await fire.isVisible()) await fire.click();
        await expect(customer.getByRole("button", { name: "Chiedi riconferma" })).toBeVisible({
          timeout: 2000,
        });
      }).toPass({ timeout: 120_000, intervals: [2000, 3000] });
      await expect(customer.getByText("Ti restano 2 riconferme")).toBeVisible();
      await customer.getByRole("button", { name: "Chiedi riconferma" }).click();
      await expect(async () => {
        await customer.goto(url);
        await expect(customer.getByText("Riconferma in corso")).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 60_000 });

      // Uno confirms the same premium, keeping its quote, with the new guarantee date.
      await claimReconfirmation(uno, code);
      await expect(uno.getByLabel("Premio annuo lordo (€)")).toHaveValue("450,00");
      await uno.getByLabel(/Confermo che l'offerta è vincolante/).check();
      await uno.getByRole("button", { name: "Conferma lo stesso premio" }).click();
      await expect(uno.getByText("Offerta registrata")).toBeVisible();

      // Tre updates the premium: a new quote is needed.
      await claimReconfirmation(tre, code);
      await tre.getByLabel("Premio annuo lordo (€)").fill("445,00");
      await tre.getByLabel(/PDF del preventivo/).setInputFiles({
        name: "preventivo.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4 e2e\nCompagnia: Compagnia Gamma\nPremio: 445,00\n"),
      });
      await tre.getByLabel(/Confermo che l'offerta è vincolante/).check();
      await tre.getByRole("button", { name: "Invia il premio aggiornato" }).click();
      await expect(tre.getByText("Offerta registrata")).toBeVisible();

      // Cinque declines.
      await openIncoming(cinque, code);
      await cinque.getByRole("button", { name: "Rinuncia alla richiesta" }).click();
      await expect(cinque.getByText("Hai rinunciato alla richiesta.")).toBeVisible();

      // BC-06: during the round nobody sees a price, back office included.
      const round = await auctionCard(operator, code);
      await expect(round.getByText(/riconferma/)).toBeVisible();
      expect(await round.innerText()).not.toContain("€");
      await customer.goto(url);
      expect(await customer.locator("main").innerText()).not.toContain("€");

      await fireUntil(operator, code, "Chiusa");
      // PRES-02: only the answers of the reconfirmation; Delta has none and is not shown.
      await expect(async () => {
        await customer.goto(url);
        await expect(customer.getByText("Più conveniente")).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 60_000 });
      const rows = customer.locator("li", { hasText: /Compagnia (Alfa|Gamma|Delta)/ });
      await expect(rows).toHaveCount(2);
      await expect(customer.locator("li", { hasText: "Compagnia Gamma" })).toContainText("445,00");
      await expect(customer.locator("li", { hasText: "Compagnia Alfa" })).toContainText("450,00");
      await expect(customer.locator("li", { hasText: "Compagnia Delta" })).toHaveCount(0);
      await expect(
        customer
          .getByText(/Garantito fino al/)
          .locator("visible=true")
          .first(),
      ).toBeVisible();
      await expect(customer.getByRole("button", { name: "Chiedi riconferma" })).toHaveCount(0);
    } finally {
      await moveClock(operator, "reset");
    }
  });
});
