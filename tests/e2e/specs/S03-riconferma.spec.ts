import { expect, test } from "@playwright/test";
import {
  ADMIN,
  approve,
  auctionCard,
  backOffice,
  fireUntil,
  newPrivate,
  submittedRequest,
} from "../support/auction.js";
import { moveClock } from "../support/agency.js";

/**
 * S03 (fase 4): the guarantees expire, the customer asks for a reconfirmation,
 * the same agencies answer in a sealed round and the customer sees the new
 * offers (GAR-06, GAR-07, BC-06, PRES-02). The development clock (rule 13)
 * stands in for the weeks of waiting and is put back at the end.
 */
test.describe.serial("S03 — garanzie scadute e riconferma", () => {
  test.describe.configure({ timeout: 480_000 });

  test("GAR-06 GAR-07 BC-06 PRES-02 S03: «Scaduta», «Chiedi riconferma», sealed answers, new offers", async ({
    browser,
  }) => {
    const customer = await browser.newPage();
    const email = await newPrivate(customer);
    const { code, url } = await submittedRequest(customer, email);
    const operator = await browser.newPage();
    await backOffice(operator);
    await approve(operator, code);
    const card = await auctionCard(operator, code);
    await card.getByRole("button", { name: "Invia 3 offerte di prova" }).click();
    await expect(operator.getByText("Richiesta inviata")).toBeVisible();
    await fireUntil(operator, code, "Chiusa");

    try {
      // 30 days of validity plus a few: every guarantee has ended.
      await moveClock(operator, 45 * 24 * 60);
      await expect(async () => {
        await customer.goto(url);
        if (await customer.getByRole("button", { name: "Chiedi riconferma" }).isVisible()) return;
        await operator.goto(`${ADMIN}/aste`);
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

      // The worker opens the reconfirmation round: no price for the customer.
      await expect(async () => {
        await customer.goto(url);
        await expect(customer.getByText("Riconferma in corso")).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 60_000 });
      expect(await customer.locator("main").innerText()).not.toContain("€");

      // The agencies answer (test offers), the round closes, the new offers appear.
      const round = await auctionCard(operator, code);
      await expect(round.getByText(/riconferma/)).toBeVisible();
      await round.getByRole("button", { name: "Invia 3 offerte di prova" }).click();
      await expect(operator.getByText("Richiesta inviata")).toBeVisible();
      await fireUntil(operator, code, "Chiusa");
      await expect(async () => {
        await customer.goto(url);
        await expect(customer.getByText("Più conveniente")).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 60_000 });
      await expect(customer.getByText(/Garantito fino al/).first()).toBeVisible();
      await expect(customer.getByRole("button", { name: "Chiedi riconferma" })).toHaveCount(0);
    } finally {
      await moveClock(operator, "reset");
    }
  });
});
