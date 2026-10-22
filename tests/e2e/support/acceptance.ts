import { expect, type Page } from "@playwright/test";

/**
 * Phase 5: what the customer does after the closing (processes 3 and 4):
 * choose, read, sign on the fake provider's page (code 123456 in
 * development) and pay on the fake payment page. The private user comes
 * back to «Accettazione», the broker's customer to the link's page.
 */
export async function chooseOffer(page: Page, url: string, company: string): Promise<void> {
  await page.goto(url);
  const row = page.locator("li", { hasText: company });
  await row.getByRole("button", { name: "Scegli questa offerta" }).click();
  await expect(page).toHaveURL(/\/accettazione$/);
}

export async function signDocuments(page: Page, back: RegExp = /\/accettazione$/): Promise<void> {
  await page.getByLabel("Ho letto i documenti").check();
  // Proposal P6: one button signs (at the provider) and then leads to «Paga».
  await page.getByRole("button", { name: /^Firma e paga/ }).click();
  await expect(page).toHaveURL(/\/firma-di-prova\//);
  await page.getByLabel("Codice ricevuto").fill("123456");
  await page.getByRole("button", { name: "Firma", exact: true }).click();
  await expect(page).toHaveURL(back);
  await expect(page.getByText(/Documenti firmati il/)).toBeVisible();
}

/** Pays with a test card: one ending with 0002 is refused by the fake provider. */
export async function payWithCard(
  page: Page,
  total: string,
  card: string,
  back: RegExp = /\/accettazione\?esito=/,
): Promise<void> {
  await page.getByRole("button", { name: `Paga ${total}` }).click();
  await expect(page).toHaveURL(/\/pagamento-di-prova\//);
  await page.getByLabel("Numero della carta").fill(card);
  await page.getByRole("button", { name: "Paga con carta" }).click();
  await expect(page).toHaveURL(back);
}
