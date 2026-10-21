import { expect, type Locator, type Page } from "@playwright/test";
import { MAILPIT_URL } from "./auth.js";

/**
 * Steps of the request wizards (fase 2), as a user does them: the fake
 * document reader picks the synthetic data from the file name
 * (packages/adapters/fixtures/document-reader).
 */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PDF = Buffer.from("%PDF-1.4 e2e");

function uploadForm(page: Page, title: string): Locator {
  return page.locator("form", { has: page.getByRole("heading", { name: title, exact: true }) });
}

export async function upload(page: Page, title: string, fileName: string): Promise<void> {
  const form = uploadForm(page, title);
  await form.getByLabel("Foto o PDF").setInputFiles({
    name: fileName,
    mimeType: fileName.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
    buffer: fileName.endsWith(".pdf") ? PDF : JPEG,
  });
  await form.getByRole("button", { name: /Carica|Sostituisci/ }).click();
  await expect(form.getByText(`Caricato: ${fileName}`)).toBeVisible();
}

/**
 * The simplified request of the private customer (Dan, 2026-10-21, ADR 0013):
 * a photo is sent as soon as it is chosen; the card turns green when received.
 */
export async function photo(page: Page, title: string, fileName: string): Promise<void> {
  const form = uploadForm(page, title);
  await form.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: fileName.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
    buffer: fileName.endsWith(".pdf") ? PDF : JPEG,
  });
  await expect(uploadForm(page, title).getByText(`Ricevuto: ${fileName}`)).toBeVisible();
}

/**
 * The five screens of the private customer: vehicle already insured, photos
 * (registration, licence, risk certificate) and the owner's birth date, type
 * of driving, coverages («Consigliato» by default) and start, one tick, send.
 */
export async function privateRequestSteps(
  page: Page,
  options: { libretto: string; patente: string; attestato?: string } = {
    libretto: "libretto-giulia-neri.jpg",
    patente: "patente-giulia-neri.jpg",
    attestato: "attestato-giulia-neri.pdf",
  },
): Promise<void> {
  await expect(page).toHaveURL(/\/tipo$/);
  await page.getByRole("link", { name: /Già assicurato/ }).click();
  await expect(page).toHaveURL(/\/dati\?stato=INSURED/);
  await photo(page, "Libretto di circolazione", options.libretto);
  await photo(page, "Patente", options.patente);
  if (options.attestato) await photo(page, "Attestato di rischio (facoltativo)", options.attestato);
  // The bot proposes plate and address from the registration.
  await expect(page.getByLabel("Targa")).not.toHaveValue("");
  await page.getByLabel("Data di nascita del proprietario").fill("1990-05-12");
  await page.getByRole("button", { name: "Continua" }).click();
  await expect(page).toHaveURL(/\/guida$/);
  await page.getByLabel(/Guida libera/).check();
  await page.getByRole("button", { name: "Continua" }).click();
  await expect(page).toHaveURL(/\/copertura$/);
  await expect(page.getByLabel("Data di decorrenza")).not.toHaveValue("");
  await saveAndContinue(page);
  await expect(page).toHaveURL(/\/conferma$/);
  await page.getByLabel(/Ho letto e accetto il trattamento/).check();
  await page.getByRole("button", { name: "Invia la richiesta" }).click();
}

/** Saves the step and waits for the next page (or the same one with errors). */
export async function saveAndContinue(page: Page): Promise<void> {
  const before = page.url();
  await page.getByRole("button", { name: "Salva e continua" }).click();
  await page.waitForURL((url) => url.toString() !== before);
}

/** Step «Veicolo»: libretto and attestato read automatically, the rest typed. */
export async function vehicleStep(
  page: Page,
  options: { libretto: string; attestato?: string; specialUse?: string },
): Promise<void> {
  await upload(page, "Libretto di circolazione", options.libretto);
  await expect(page.getByLabel("Marca", { exact: true })).not.toHaveValue("");
  if (options.attestato) {
    await upload(page, "Attestato di rischio", options.attestato);
    await expect(page.getByLabel("Classe CU")).not.toHaveValue("");
  }
  await page.getByLabel("Data di acquisto").fill("2020-04-01");
  await page.getByLabel("Provenienza").selectOption("FROM_OTHER_COMPANY");
  if (options.specialUse) await page.getByLabel(options.specialUse, { exact: true }).check();
  await saveAndContinue(page);
}

/** Step «Conducenti»: the holder comes from the libretto, the licence from its photo. */
export async function driversStep(
  page: Page,
  licence: string,
  options: { holderFiscalCode?: string } = {},
): Promise<void> {
  await expect(page).toHaveURL(/\/conducenti$/);
  await upload(page, "Patente del conducente abituale", licence);
  await expect(page.getByLabel("Codice fiscale").first()).not.toHaveValue("");
  // The holder must be the customer (LEG-04): a broker's customer of this run.
  if (options.holderFiscalCode) {
    await page.getByLabel("Codice fiscale").first().fill(options.holderFiscalCode);
  }
  await page.getByLabel(/Guida libera/).check();
  await saveAndContinue(page);
}

export async function coverageAndAuctionSteps(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/copertura$/);
  await expect(page.getByLabel("Data di decorrenza")).not.toHaveValue("");
  await page.getByLabel("Plus").check();
  await saveAndContinue(page);
  await expect(page).toHaveURL(/\/asta$/);
  // Options from the parameters in force (rule 7).
  await expect(page.getByLabel("1 ora", { exact: true })).toBeVisible();
  await expect(page.getByLabel("24 ore", { exact: true })).toBeVisible();
  await page.getByLabel("5 ore", { exact: true }).check();
  await page.getByLabel("30 giorni").check();
  await saveAndContinue(page);
}

/** The latest message of Mailpit for an address, waiting for it to arrive. */
export async function latestMail(
  to: string,
  matching: RegExp,
  after = 0,
): Promise<{ subject: string; text: string }> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const list = (await (
      await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}&limit=5`)
    ).json()) as { messages: { ID: string; Subject: string; Created: string }[] };
    for (const m of list.messages) {
      if (new Date(m.Created).getTime() < after || !matching.test(m.Subject)) continue;
      const message = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${m.ID}`)).json()) as {
        Text: string;
      };
      return { subject: m.Subject, text: message.Text };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No email matching ${matching} arrived for ${to}`);
}

export async function codeFromMail(to: string, after: number): Promise<string> {
  const mail = await latestMail(to, /codice AstAx/, after);
  const code = /\b(\d{6})\b/.exec(mail.text)?.[1];
  if (!code) throw new Error("No code in the email");
  return code;
}

/** The code of the request shown in the page title, e.g. AX-2026-000012. */
export async function requestCode(page: Page): Promise<string> {
  const heading = await page.getByRole("heading", { name: /^Richiesta AX-/ }).textContent();
  const code = /AX-\d{4}-\d{6}/.exec(heading ?? "")?.[0];
  if (!code) throw new Error("No request code on the page");
  return code;
}
