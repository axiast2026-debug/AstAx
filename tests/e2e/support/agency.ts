import { expect, type Page } from "@playwright/test";
import {
  acceptLegalIfAsked,
  e2eState,
  loginProfessional,
  loginProfessionalAgain,
  savedSecret,
  saveSecret,
} from "./auth.js";
import { ADMIN, WEB } from "./auction.js";

/** Phase 4: what an agency user does in the web app (spec 04, spec 05). */
export async function professional(page: Page, email: string): Promise<void> {
  const { password } = e2eState();
  await page.goto(`${WEB}/auth/login?as=pro`);
  const secret = savedSecret(email);
  if (secret) await loginProfessionalAgain(page, email, password, secret);
  else saveSecret(email, await loginProfessional(page, email, password));
  await acceptLegalIfAsked(page);
}

export async function switchTo(page: Page, agency: string): Promise<void> {
  await page.getByLabel("Passa a").selectOption({ label: agency });
  await page.getByRole("button", { name: "Vai", exact: true }).click();
  await expect(page.getByRole("banner").locator("span", { hasText: /^Agenzia / })).toHaveText(
    agency,
  );
}

/** Opens the request from «Richieste in arrivo», once the invitation has arrived (latest round). */
export async function openIncoming(page: Page, code: string): Promise<void> {
  await expect(async () => {
    await page.goto(`${WEB}/richieste-in-arrivo`);
    await expect(page.getByRole("link", { name: code }).first()).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 60_000 });
  await page.getByRole("link", { name: code }).first().click();
  await expect(page.getByText("Ogni apertura di questa richiesta")).toBeVisible();
}

/** The offer form (OFF-04); `guaranteeDays` moves the guarantee past the minimum. */
export async function sendOffer(
  page: Page,
  company: string,
  premium: string,
  guaranteeDays = 0,
): Promise<void> {
  await page.getByLabel("Premio annuo lordo (€)").fill(premium);
  await page.getByLabel("Compagnia", { exact: true }).selectOption({ label: company });
  const product = page.getByLabel("Prodotto", { exact: true });
  const first = product.locator(`optgroup[label="${company}"] option`).first();
  await product.selectOption((await first.getAttribute("value")) ?? "");
  await page.getByLabel("Massimale unico (€)").fill("10000000");
  if (guaranteeDays > 0) {
    const field = page.getByLabel("Prezzo garantito fino al");
    const minimum = await field.inputValue();
    const later = new Date(`${minimum}T12:00:00Z`);
    later.setUTCDate(later.getUTCDate() + guaranteeDays);
    await field.fill(later.toISOString().slice(0, 10));
  }
  await page.getByLabel("PDF del preventivo").setInputFiles({
    name: "preventivo.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(`%PDF-1.4 e2e\nCompagnia: ${company}\nPremio: ${premium}\n`),
  });
  await page.getByLabel(/Confermo che l'offerta è vincolante/).check();
  await page.getByRole("button", { name: "Invia l'offerta" }).click();
  await expect(page.getByText("Offerta registrata")).toBeVisible();
}

/** The back office invites an agency by hand (ASTA-06), so a test does not depend on the choice. */
export async function inviteByHand(
  operator: Page,
  card: ReturnType<Page["locator"]>,
  agency: string,
) {
  const form = card.locator("form", { has: operator.getByRole("button", { name: "Invita" }) });
  await form.getByLabel("Agenzia", { exact: true }).selectOption({ label: agency });
  await form.getByLabel("Motivo").fill("Prova end-to-end");
  await form.getByRole("button", { name: "Invita" }).click();
  await expect(operator.getByText("Richiesta inviata")).toBeVisible();
}

/** Development tool (rule 13): the application clock forward, or back to the real time. */
export async function moveClock(operator: Page, minutes: number | "reset"): Promise<void> {
  await operator.goto(`${ADMIN}/aste`);
  if (minutes === "reset") {
    await operator.getByRole("button", { name: "Riporta l'orologio a oggi" }).click();
  } else {
    await operator.getByLabel("Minuti").fill(String(minutes));
    await operator.getByRole("button", { name: /Sposta avanti l'orologio/ }).click();
  }
  await expect(operator.getByText("Richiesta inviata")).toBeVisible();
}
