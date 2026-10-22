import { buildSyntheticIban, buildVatNumber } from "@astax/shared/domain";
import { SystemClock } from "@astax/adapters/clock";
import { romeCalendarDate } from "@astax/shared/format";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ONBOARDING } from "../global-setup.js";
import { ADMIN, backOffice, WEB } from "../support/auction.js";
import { latestMail } from "../support/requests.js";

/**
 * Phase 7 (fasi/07, «Test richiesti», end-to-end): the administrator changes
 * the default duration of the auction and the private's fee (and puts them
 * back); a new agency enters from the site and the back office approves it;
 * the back office registers and answers a complaint. The missed issuance
 * is in S05.
 */
const PDF = Buffer.from("%PDF-1.4 polizza RC professionale e2e");
/** Real time: the servers of the local environment run on it. */
const clock = new SystemClock();
const today = romeCalendarDate(clock.now());

async function changeSetting(
  page: Page,
  path: string,
  label: string,
  value: string,
  reason: string,
) {
  await page.goto(`${ADMIN}${path}`);
  const row = page.getByRole("region", { name: label, exact: true });
  await row.getByLabel(/^Nuovo valore/).fill(value);
  await row.getByLabel("Motivo della modifica").fill(reason);
  await row.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("status")).toContainText("Parametro salvato");
  return page.getByRole("region", { name: label, exact: true });
}

test.describe.serial("fase 7 — pannelli", () => {
  test.describe.configure({ timeout: 240_000 });

  test("the administrator changes the default duration and the private's fee, with a reason and the history", async ({
    page,
  }) => {
    await backOffice(page, "admin");
    let row = await changeSetting(
      page,
      "/regole-asta",
      "Durata predefinita dell'asta (ore lavorative)",
      "5",
      "Prova E2E: aste più lunghe",
    );
    await expect(row).toContainText("Valore attuale: 5");
    await row.getByRole("link", { name: "Storico" }).click();
    row = page.getByRole("region", {
      name: "Durata predefinita dell'asta (ore lavorative)",
      exact: true,
    });
    await expect(row).toContainText("Prova E2E: aste più lunghe");
    await changeSetting(
      page,
      "/regole-asta",
      "Durata predefinita dell'asta (ore lavorative)",
      "2",
      "Fine della prova E2E",
    );

    row = await changeSetting(page, "/economia", "Fee del privato", "31,00", "Prova E2E del fee");
    await expect(row).toContainText("31,00");
    row = await changeSetting(
      page,
      "/economia",
      "Fee del privato",
      "30,00",
      "Fine della prova E2E del fee",
    );
    await expect(row).toContainText("30,00");
  });

  test("a new agency enters from the site; the back office approves it after the RUI check", async ({
    browser,
  }) => {
    const applicant = await browser.newPage();
    await applicant.goto(`${WEB}/ingresso`);
    await applicant.getByLabel("Ragione sociale").fill(E2E_ONBOARDING.legalName);
    await applicant.getByLabel("Partita IVA").fill(buildVatNumber(9103, 1));
    await applicant.getByLabel("Numero RUI (sezione A)").fill(E2E_ONBOARDING.ruiNumber);
    await applicant.getByLabel("PEC").fill("agenzia.tredici@pec.test");
    await applicant.getByLabel("Indirizzo", { exact: true }).fill("Via delle Prove 13");
    await applicant.getByLabel("CAP").fill("00184");
    await applicant.getByLabel("Provincia (sigla)").fill("RM");
    await applicant.getByLabel("Codice ISTAT del comune").fill("058091");
    await applicant.getByLabel("Nome", { exact: true }).fill("Tiziana");
    await applicant.getByLabel("Cognome").fill("Tredici");
    await applicant.getByLabel("Email", { exact: true }).fill(E2E_ONBOARDING.ownerEmail);
    await applicant.getByLabel("Cellulare").fill(E2E_ONBOARDING.ownerPhone);
    await applicant.getByLabel("IBAN", { exact: true }).fill(buildSyntheticIban(9103));
    await applicant.getByLabel("Compagnia Delta").check();
    await applicant.getByRole("button", { name: "Continua" }).click();
    await expect(applicant.getByRole("status")).toContainText("Dati salvati");

    // The IBAN with the code by SMS (in Mailpit, as every fake SMS).
    const before = clock.now().getTime();
    await applicant.getByRole("button", { name: "Mandami il codice" }).click();
    const sms = await latestMail(
      `${E2E_ONBOARDING.ownerPhone.replace(/\D/g, "")}@sms.astax.test`,
      /SMS AstAx/,
      before,
    );
    const code = /\b(\d{6})\b/.exec(sms.text)?.[1] ?? "";
    await applicant.getByLabel("Codice").fill(code);
    await applicant.getByRole("button", { name: "Conferma" }).click();
    await expect(applicant.getByRole("status")).toContainText("IBAN confermato");

    await applicant.getByLabel("Polizza in PDF").setInputFiles({
      name: "rc-professionale.pdf",
      mimeType: "application/pdf",
      buffer: PDF,
    });
    await applicant.getByLabel("Scadenza della polizza").fill("2030-12-31");
    await applicant.getByRole("button", { name: "Carica la polizza" }).click();
    await expect(applicant.getByRole("status")).toContainText("Polizza caricata");

    for (const box of await applicant
      .getByRole("checkbox", { name: /^Ho letto e accetto/ })
      .all()) {
      await box.check();
    }
    await applicant.getByRole("button", { name: "Invia la richiesta" }).click();
    await expect(applicant.getByRole("status")).toContainText("Richiesta inviata");

    // The supervisor: the RUI check, then the approval.
    const supervisor = await browser.newPage();
    await backOffice(supervisor, "supervisor");
    await supervisor.goto(`${ADMIN}/ingressi`);
    await supervisor.getByRole("link", { name: E2E_ONBOARDING.legalName }).click();
    await expect(supervisor.getByText("Numero presente")).toBeVisible();
    await supervisor.getByRole("radio", { name: "Approva" }).check();
    await supervisor.getByLabel(/^Motivo/).fill("RUI, mandato e polizza in ordine");
    await supervisor.getByRole("button", { name: "Conferma" }).click();
    await expect(supervisor.getByRole("status")).toContainText("Approvata");

    // The first invitation reaches the owner.
    const welcome = await latestMail(E2E_ONBOARDING.ownerEmail, /attiva su AstAx/, before);
    expect(welcome.text).toContain(E2E_ONBOARDING.legalName);
  });

  test("the back office registers a complaint and answers it", async ({ page }) => {
    await backOffice(page, "supervisor");
    await page.goto(`${ADMIN}/reclami`);
    await page.getByLabel("Canale").selectOption("PEC");
    await page.getByLabel("Ricevuto il").fill(today);
    await page.getByLabel("Reclamante", { exact: true }).fill("Reclamante E2E");
    await page.getByLabel("Email del reclamante").fill("reclamante.e2e@example.test");
    await page.getByLabel("Oggetto").fill("Ritardo nella risposta");
    await page.getByLabel("Testo del reclamo").fill("Nessuno mi ha risposto per due settimane.");
    await page.getByRole("button", { name: "Registra", exact: true }).click();
    const status = page.getByRole("status");
    await expect(status).toContainText("Reclamo registrato");
    const protocol = /R-\d{4}-\d{6}/.exec((await status.textContent()) ?? "")?.[0] ?? "";
    expect(protocol).not.toBe("");

    await page.getByRole("link", { name: new RegExp(protocol) }).click();
    await page.getByLabel("Esito").selectOption("ACCEPTED");
    await page
      .getByLabel("Testo della risposta")
      .fill("Ci scusiamo: la risposta è stata data oggi.");
    await page.getByRole("button", { name: "Registra e invia la risposta" }).click();
    await expect(page.getByRole("status")).toContainText("Risposta registrata");
    const mail = await latestMail("reclamante.e2e@example.test", new RegExp(protocol));
    expect(mail.text).toContain("Ci scusiamo");
  });
});
