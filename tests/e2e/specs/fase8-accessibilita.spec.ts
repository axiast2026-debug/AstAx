import { expect, test } from "@playwright/test";
import { expectAccessible } from "../support/accessibility.js";
import { professional } from "../support/agency.js";
import { backOffice, newPrivate } from "../support/auction.js";
import { e2eState } from "../support/auth.js";

const WEB = "http://localhost:3000";
const ADMIN = "http://localhost:3001";

// Phase 8: the main screens of each user, checked with axe (WCAG 2.1 AA).
test.describe("fase 8 — accessibilità", () => {
  test("the public pages and the private customer's area", async ({ page }) => {
    await page.goto(WEB);
    await expectAccessible(page, "home");
    await page.goto(`${WEB}/ingresso`);
    await expectAccessible(page, "ingresso");
    await newPrivate(page);
    await expectAccessible(page, "area del privato");
    await page.getByRole("button", { name: "Nuovo preventivo" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectAccessible(page, "nuovo preventivo");
    await page.goto(`${WEB}/reclami`);
    await expectAccessible(page, "reclami");
  });

  test("the agency's screens", async ({ page }) => {
    await professional(page, e2eState().users.owner);
    await expectAccessible(page, "dashboard agenzia");
    await page.goto(`${WEB}/richieste-in-arrivo`);
    await expectAccessible(page, "richieste in arrivo");
    await page.goto(`${WEB}/le-mie-offerte`);
    await expectAccessible(page, "le mie offerte");
  });

  test("the back office", async ({ page }) => {
    await page.goto(ADMIN);
    await expectAccessible(page, "accesso back office");
    await backOffice(page, "supervisor");
    await expectAccessible(page, "cruscotto");
    for (const path of ["/verifiche", "/aste", "/reclami", "/ingressi"]) {
      await page.goto(`${ADMIN}${path}`);
      await expectAccessible(page, path);
    }
  });
});
