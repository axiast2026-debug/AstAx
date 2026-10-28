import { randomBytes } from "node:crypto";
import { buildFiscalCode, decodeFiscalCode } from "@astax/shared/domain";
import { expect, type Page } from "@playwright/test";
import {
  acceptLegalIfAsked,
  e2eState,
  loginProfessional,
  loginProfessionalAgain,
  savedSecret,
  saveSecret,
} from "./auth.js";
import { WEB } from "./auction.js";
import { privateRequestSteps, requestCode } from "./requests.js";

/** Paolo Verdi of Broker Demo Srl (spec 02). */
export async function brokerLogin(
  page: Page,
  as: "broker" | "brokerOwner" = "broker",
): Promise<void> {
  const { users, password } = e2eState();
  const email = users[as];
  await page.goto(`${WEB}/auth/login?as=pro`);
  const secret = savedSecret(email);
  if (secret) await loginProfessionalAgain(page, email, password, secret);
  else saveSecret(email, await loginProfessional(page, email, password));
  await acceptLegalIfAsked(page);
  await expect(page).toHaveURL(`${WEB}/`);
}

/** A synthetic person new at every run: the random birth date changes the fiscal code. */
export function newFiscalCode(surname: string, givenName: string, sex: "M" | "F"): string {
  const [a = 0, b = 0, c = 0] = randomBytes(3);
  return buildFiscalCode({
    surname,
    givenName,
    birthDate: `${1960 + (a % 40)}-${String(1 + (b % 12)).padStart(2, "0")}-${String(1 + (c % 28)).padStart(2, "0")}`,
    sex,
    birthPlaceCadastralCode: "H501",
  });
}

/** The birth date in a synthetic fiscal code, for the owner's birth date of the request. */
export function birthDateOf(fiscalCode: string): string {
  return decodeFiscalCode(fiscalCode, "2026-01-01")?.birthDate ?? "1980-01-01";
}

/**
 * Laura, the owner of Broker Demo, signs the declaration on her customers'
 * consent at her first access (Dan, 2026-10-21, docs/piano-broker.md answer 3).
 */
export async function ownerSignedDeclaration(browserPage: () => Promise<Page>): Promise<void> {
  const owner = await browserPage();
  await brokerLogin(owner, "brokerOwner");
  await owner.close();
}

/**
 * Paolo creates the request for a new customer Anna Riva with the five
 * screens; the consent is covered by the declaration of his firm. The
 * request is sent to the back office.
 */
export async function submittedBrokerRequest(
  page: Page,
  browserPage: () => Promise<Page>,
): Promise<{ code: string; url: string; email: string }> {
  await ownerSignedDeclaration(browserPage);
  const email = `e2e.anna.${randomBytes(4).toString("hex")}@example.test`;
  const fiscalCode = newFiscalCode("Riva", "Anna", "F");
  await page.goto(`${WEB}/richieste/nuova`);
  await page.getByRole("link", { name: "Nuovo cliente" }).click();
  await page.getByLabel("Cognome").fill("Riva");
  await page.getByLabel("Nome", { exact: true }).fill("Anna");
  await page.getByLabel("Codice fiscale").fill(fiscalCode);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Salva e inizia la richiesta" }).click();
  await privateRequestSteps(page, {
    libretto: "libretto-anna-riva.jpg",
    identita: "identita-anna-riva.jpg",
    plate: "AR456CD",
    ownerBirthDate: birthDateOf(fiscalCode),
    broker: true,
  });
  await expect(page.getByText("Richiesta inviata. La verifichiamo")).toBeVisible();
  return { code: await requestCode(page), url: page.url().split("?")[0] ?? "", email };
}
