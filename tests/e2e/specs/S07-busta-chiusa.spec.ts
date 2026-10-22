import { expect, test } from "@playwright/test";
import {
  approve,
  auctionCard,
  backOffice,
  fireUntil,
  newPrivate,
  submittedRequest,
} from "../support/auction.js";

/** S07 (fase 3): nobody reads the offers before the closing, then the best per company. */
test.describe.serial("S07 — busta chiusa", () => {
  test.describe.configure({ timeout: 300_000 });

  test("ASTA-01 VIS-03 BC-01 S07: the approval opens the auction; offers arrive and nobody sees a price until the closing; then the best per company", async ({
    browser,
  }) => {
    const customer = await browser.newPage();
    const email = await newPrivate(customer);
    const { code, url } = await submittedRequest(customer, email);

    const operator = await browser.newPage();
    await backOffice(operator);
    await approve(operator, code);
    const card = await auctionCard(operator, code);
    await expect(card.getByText("Aperta", { exact: true })).toBeVisible();

    // The requester: countdown and number of offers (VIS-03).
    await customer.goto(url);
    await expect(customer.getByRole("heading", { name: "Asta in corso" })).toBeVisible();
    await expect(customer.getByText(/^Chiude .+ alle \d{2}:\d{2}$/)).toBeVisible();

    // Three invited synthetic agencies send their offers.
    await card.getByRole("button", { name: "Invia 3 offerte di prova" }).click();
    await expect(operator.getByText("Richiesta inviata")).toBeVisible();
    const after = await auctionCard(operator, code);
    await expect(after.getByText("3", { exact: true })).toBeVisible();
    // BC-01: counters only, no price, also for the back office.
    expect(await after.innerText()).not.toContain("€");

    await expect(async () => {
      await customer.reload();
      await expect(customer.getByText("3 buste arrivate", { exact: true })).toBeAttached({
        timeout: 1000,
      });
    }).toPass({ timeout: 30_000 });
    expect(await customer.locator("main").innerText()).not.toContain("€");

    // Top-up, reminder, closing: at once with the development tool.
    await fireUntil(operator, code, "Chiusa");

    // PRES-02: per company the best offer still guaranteed, with the cheapest marked.
    await expect(async () => {
      await customer.reload();
      await expect(customer.getByText("Più conveniente")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    await expect(customer.getByText(/Garantito fino al/).first()).toBeVisible();
    expect(await customer.locator("main").innerText()).toContain("€");
    await expect(customer.getByText("Offerte disponibili").first()).toBeVisible();
  });
});
