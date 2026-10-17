import { randomBytes } from "node:crypto";
import { SystemClock } from "@astax/adapters/clock";
import { buildFiscalCode } from "@astax/shared/domain";
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
import {
  codeFromMail,
  coverageAndAuctionSteps,
  driversStep,
  latestMail,
  requestCode,
  vehicleStep,
} from "./requests.js";

const clock = new SystemClock();

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

/**
 * Paolo creates the request for a new customer Anna Riva, who gives the
 * consent from her link; the request is sent to the back office.
 */
export async function submittedBrokerRequest(
  page: Page,
  browserPage: () => Promise<Page>,
): Promise<{ code: string; url: string; email: string }> {
  const email = `e2e.anna.${randomBytes(4).toString("hex")}@example.test`;
  const fiscalCode = newFiscalCode("Riva", "Anna", "F");
  await page.goto(`${WEB}/richieste/nuova`);
  await page.getByRole("link", { name: "Nuovo cliente" }).click();
  await page.getByLabel("Cognome").fill("Riva");
  await page.getByLabel("Nome", { exact: true }).fill("Anna");
  await page.getByLabel("Codice fiscale").fill(fiscalCode);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Salva e inizia la richiesta" }).click();
  await expect(page.getByRole("heading", { name: "Il veicolo" })).toBeVisible();
  await vehicleStep(page, {
    libretto: "libretto-anna-riva.jpg",
    attestato: "attestato-anna-riva.pdf",
  });
  await driversStep(page, "patente-anna-riva.jpg", { holderFiscalCode: fiscalCode });
  await coverageAndAuctionSteps(page);

  const sentAt = clock.now().getTime() - 1000;
  await page.getByRole("button", { name: "Manda il link" }).click();
  await expect(page.getByText("Link inviato al cliente.")).toBeVisible();
  const mail = await latestMail(email, /ti chiede il consenso/, sentAt);
  const link = /http:\/\/localhost:3000\/consenso\/[A-Za-z0-9_-]+/.exec(mail.text)?.[0] ?? "";
  const customer = await browserPage();
  await customer.goto(link);
  const codeAt = clock.now().getTime() - 1000;
  await customer.getByRole("button", { name: "Mandami il codice" }).click();
  await customer.getByLabel("Codice ricevuto").fill(await codeFromMail(email, codeAt));
  await customer.getByRole("button", { name: "Confermo il consenso" }).click();
  await expect(customer.getByText("Grazie, consenso confermato")).toBeVisible();
  await customer.close();

  await page.reload();
  await page.getByRole("link", { name: "Riepilogo" }).click();
  await page.getByRole("button", { name: "Invia la richiesta" }).click();
  await expect(page.getByText("Richiesta inviata. La verifichiamo")).toBeVisible();
  return { code: await requestCode(page), url: page.url().split("?")[0] ?? "", email };
}
