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
  // Dan, 2026-10-28: the files of a document are listed, each with «Togli».
  await expect(uploadForm(page, title).getByText(fileName, { exact: true })).toBeVisible();
}

/**
 * Dan, 2026-10-28: «Comune» from the suggestions; the province fills itself,
 * the CAP too, or is chosen when the municipality has several.
 */
export async function chooseMunicipality(page: Page, name: string, province: string) {
  await page.getByRole("combobox", { name: "Comune" }).fill(name);
  await page.getByRole("option", { name: `${name} (${province})` }).click();
  await expect(page.getByLabel("Provincia (sigla)")).toHaveValue(province);
  const cap = page.getByLabel("CAP");
  if ((await cap.evaluate((el) => el.tagName)) === "SELECT") {
    await cap.selectOption({ index: 1 });
  }
}

/**
 * The five screens of the private customer: vehicle already insured, the
 * registration and the ID card (Dan, 2026-10-28: no licence, no risk
 * certificate), the data typed by the customer (nothing is filled from the
 * documents), type of driving, coverages («Consigliate» by default), one
 * tick, send. The broker has the same screens without the tick
 * (docs/piano-broker.md, B), and still chooses when the cover starts.
 */
export async function privateRequestSteps(
  page: Page,
  options: {
    libretto: string;
    identita: string;
    plate: string;
    ownerBirthDate?: string;
    broker?: boolean;
  } = {
    libretto: "libretto-giulia-neri.jpg",
    identita: "identita-giulia-neri.jpg",
    plate: "GN123AB",
  },
): Promise<void> {
  // In development the first page of the request may be compiled on first use.
  await expect(page).toHaveURL(/\/tipo$/, { timeout: 30_000 });
  await page.getByRole("link", { name: /Già assicurato/ }).click();
  await expect(page).toHaveURL(/\/dati\?stato=INSURED/);
  await photo(page, "Libretto di circolazione", options.libretto);
  await photo(page, "Carta d'identità", options.identita);
  // Nothing is filled from the documents: the customer writes the data.
  await expect(page.getByLabel("Targa")).toHaveValue("");
  await page.getByLabel("Targa").fill(options.plate);
  // Typed as Italians write it, or pasted.
  await page
    .getByLabel("Data di nascita del proprietario")
    .fill(options.ownerBirthDate ?? "12/05/1990");
  await page.getByLabel("Indirizzo di residenza").fill("Via Roma 1");
  await chooseMunicipality(page, "Milano", "MI");
  await page.getByRole("button", { name: "Continua" }).click();
  await expect(page).toHaveURL(/\/guida$/);
  await page.getByLabel(/Guida libera/).check();
  await page.getByRole("button", { name: "Continua" }).click();
  await expect(page).toHaveURL(/\/copertura$/);
  if (options.broker) {
    await page.getByLabel(/Subito, appena l'agenzia emette la polizza/).check();
  } else {
    await expect(page.getByText("Da quando vuoi essere assicurato")).toBeHidden();
  }
  await saveAndContinue(page);
  await expect(page).toHaveURL(/\/conferma$/);
  if (options.broker) {
    await expect(page.getByText(/coperto dalla dichiarazione/)).toBeVisible();
  } else {
    await page.getByLabel(/Ho letto e accetto il trattamento/).check();
  }
  await page.getByRole("button", { name: "Invia la richiesta" }).click();
}

/** Saves the step and waits for the next page (or the same one with errors). */
export async function saveAndContinue(page: Page): Promise<void> {
  const before = page.url();
  await page.getByRole("button", { name: "Salva e continua" }).click();
  await page.waitForURL((url) => url.toString() !== before);
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
