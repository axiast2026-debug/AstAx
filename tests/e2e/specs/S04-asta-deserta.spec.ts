import { expect, test } from "@playwright/test";
import {
  ADMIN,
  approve,
  auctionCard,
  backOffice,
  newPrivate,
  submittedRequest,
} from "../support/auction.js";

/** S04 (fase 3), variant: no offer and no agency left for the reopening. The exact times are in apps/worker/test/int. */
test.describe.serial("S04 — asta deserta", () => {
  test.describe.configure({ timeout: 300_000 });

  test("ASTA-08 S04 variant: no offer and no agency left for the reopening: the request is «Deserta»", async ({
    browser,
  }) => {
    const customer = await browser.newPage();
    const email = await newPrivate(customer);
    const { code, url } = await submittedRequest(customer, email);
    const operator = await browser.newPage();
    await backOffice(operator);
    await approve(operator, code);
    await auctionCard(operator, code);
    // Nobody offers: the top-up and the reopening invite the compatible agencies left, then deserted.
    await expect(async () => {
      await customer.goto(url);
      if (await customer.getByText("Deserta").first().isVisible()) return;
      await operator.goto(`${ADMIN}/aste`);
      const fire = operator
        .getByRole("region", { name: code })
        .last()
        .getByRole("button", { name: "Fai scattare il prossimo passo" });
      if (await fire.isVisible()) await fire.click();
      await expect(customer.getByText("Deserta").first()).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 180_000, intervals: [2000, 3000] });
    await expect(customer.getByText("Nessuna offerta valida").first()).toBeVisible();
  });
});
