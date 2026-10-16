import { randomBytes } from "node:crypto";
import { SystemClock } from "@astax/adapters/clock";
import { buildFiscalCode } from "@astax/shared/domain";
import { expect, test, type Page } from "@playwright/test";
import {
  acceptLegalIfAsked,
  e2eState,
  loginPrivate,
  loginProfessional,
  loginProfessionalAgain,
  savedSecret,
  saveSecret,
} from "../support/auth.js";
import {
  codeFromMail,
  coverageAndAuctionSteps,
  driversStep,
  latestMail,
  requestCode,
  saveAndContinue,
  upload,
  vehicleStep,
} from "../support/requests.js";

const WEB = "http://localhost:3000";
const ADMIN = "http://localhost:3001";
/** Real time: codes and links are compared with the emails Mailpit received. */
const clock = new SystemClock();

/**
 * Fase 2: requests from the wizard to the verification queue. Every private
 * customer is new (random address) and uses the synthetic documents of
 * Giulia Neri; the professionals are the dedicated E2E users.
 */
test.describe.serial("fase 2: richiesta e verifica", () => {
  // Each test goes through the whole wizard and one or two logins.
  test.describe.configure({ timeout: 240_000 });

  async function newPrivate(page: Page): Promise<string> {
    const email = `e2e.giulia.${randomBytes(4).toString("hex")}@example.test`;
    await page.goto(`${WEB}/auth/login?as=private`);
    await loginPrivate(page, email);
    await acceptLegalIfAsked(page);
    await expect(page).toHaveURL(`${WEB}/`);
    return email;
  }

  /** A private request filled in and submitted; returns its code and URL. */
  async function privateRequest(page: Page, email: string): Promise<{ code: string; url: string }> {
    await page.getByRole("button", { name: "Nuovo preventivo" }).click();
    await expect(page.getByRole("heading", { name: "Il veicolo" })).toBeVisible();
    await vehicleStep(page, {
      libretto: "libretto-giulia-neri.jpg",
      attestato: "attestato-giulia-neri.pdf",
    });
    await driversStep(page, "patente-giulia-neri.jpg");
    await coverageAndAuctionSteps(page);

    await expect(page.getByRole("heading", { name: "I consensi" })).toBeVisible();
    await expect(page.getByText("[DA VALIDARE — LEGALE]").first()).toBeVisible();
    const sentAt = clock.now().getTime() - 1000;
    await page.getByRole("button", { name: "Mandami il codice" }).click();
    await page.getByLabel("Codice ricevuto").fill(await codeFromMail(email, sentAt));
    await page.getByRole("button", { name: "Confermo" }).click();

    await expect(page.getByRole("heading", { name: "Riepilogo e invio" })).toBeVisible();
    await expect(page.getByText("Confermato")).toBeVisible();
    await page.getByRole("button", { name: "Invia la richiesta" }).click();
    await expect(page.getByText("Richiesta inviata. La verifichiamo")).toBeVisible();
    return { code: await requestCode(page), url: page.url().split("?")[0] ?? "" };
  }

  async function backOffice(page: Page): Promise<void> {
    const { users, password } = e2eState();
    await page.goto(ADMIN);
    await page.getByRole("link", { name: "Accedi" }).click();
    const secret = savedSecret(users.verifier);
    if (secret) await loginProfessionalAgain(page, users.verifier, password, secret);
    else saveSecret(users.verifier, await loginProfessional(page, users.verifier, password));
    await acceptLegalIfAsked(page);
    await expect(page).toHaveURL(`${ADMIN}/`);
  }

  async function openCard(page: Page, code: string): Promise<void> {
    await page.goto(`${ADMIN}/verifiche`);
    await page.getByRole("link", { name: code }).click();
    await expect(page.getByRole("heading", { name: `Verifica ${code}` })).toBeVisible();
  }

  test("Giulia completa la procedura e invia; l'operatore la trova verde, apre la scheda e approva", async ({
    browser,
  }) => {
    const customer = await browser.newPage();
    const email = await newPrivate(customer);
    const { code, url } = await privateRequest(customer, email);
    await expect(customer.getByText("Controllo automatico fatto")).toBeVisible();

    const operator = await browser.newPage();
    await backOffice(operator);
    await operator.goto(`${ADMIN}/verifiche`);
    const row = operator.getByRole("row", { name: new RegExp(code) });
    await expect(row.getByText("Verde")).toBeVisible();
    await openCard(operator, code);
    await expect(
      operator.getByRole("heading", { name: "Dati dichiarati e documenti" }),
    ).toBeVisible();
    await expect(operator.getByRole("heading", { name: "Checklist" })).toBeVisible();
    await operator.getByRole("button", { name: "Approva e apri l'asta" }).click();
    await expect(operator.getByText("Richiesta approvata")).toBeVisible();

    // The timeline shows every step.
    await customer.goto(url);
    for (const step of [
      "Richiesta creata",
      "Consenso confermato",
      "Richiesta inviata",
      "Verifica superata",
    ]) {
      await expect(customer.locator("ol").getByText(step, { exact: true }).first()).toBeVisible();
    }
    await expect(customer.getByText("La richiesta è pronta")).toBeVisible();
  });

  test("un caso escluso dichiarato nella procedura (taxi) blocca l'invio con un messaggio chiaro", async ({
    page,
  }) => {
    await newPrivate(page);
    await page.getByRole("button", { name: "Nuovo preventivo" }).click();
    await vehicleStep(page, { libretto: "libretto-giulia-neri.jpg", specialUse: "Taxi" });
    await page.getByRole("link", { name: "Riepilogo" }).click();
    await expect(page.getByText("Hai indicato un uso particolare")).toBeVisible();
    await page.getByRole("button", { name: "Invia la richiesta" }).click();
    await expect(page.getByRole("alert").first()).toContainText(
      "non può andare all'asta (caso escluso)",
    );
  });

  test("integrazione: il back office chiede la patente, il cliente la ricarica e la richiesta torna in coda", async ({
    browser,
  }) => {
    const customer = await browser.newPage();
    const email = await newPrivate(customer);
    const { code, url } = await privateRequest(customer, email);

    const operator = await browser.newPage();
    await backOffice(operator);
    await openCard(operator, code);
    await operator.getByLabel("Documento non leggibile").check();
    await operator.getByLabel("Conducenti", { exact: true }).check();
    await operator.getByLabel("Patente", { exact: true }).check();
    await operator
      .getByLabel("Messaggio al richiedente")
      .first()
      .fill("La foto della patente è sfocata.");
    await operator.getByRole("button", { name: "Chiedi l'integrazione" }).click();
    await expect(operator.getByText("Integrazione chiesta")).toBeVisible();

    const mail = await latestMail(email, /serve un'integrazione/);
    expect(mail.text).toContain("documento non leggibile");
    await customer.goto(url);
    await expect(customer.getByText("Serve un'integrazione")).toBeVisible();
    await customer.getByRole("link", { name: "Completa ora" }).click();
    await expect(customer).toHaveURL(/\/conducenti$/);
    await expect(customer.getByText("La foto della patente è sfocata.")).toBeVisible();
    await upload(customer, "Patente del conducente abituale", "patente-giulia-neri.jpg");
    await saveAndContinue(customer);
    await expect(customer).toHaveURL(/\/copertura$/);
    await customer.getByRole("link", { name: "Riepilogo" }).click();
    await customer.getByRole("button", { name: "Invia la richiesta" }).click();
    await expect(customer.getByText("In verifica").first()).toBeVisible();
    await expect(
      customer.locator("ol").getByText("Integrazione inviata", { exact: true }),
    ).toBeVisible();

    await openCard(operator, code);
    await expect(
      operator.locator("ol").getByText("Integrazione inviata", { exact: true }),
    ).toBeVisible();
    await expect(operator.getByRole("button", { name: "Approva e apri l'asta" })).toBeVisible();
  });

  async function broker(page: Page): Promise<void> {
    const { users, password } = e2eState();
    await page.goto(`${WEB}/auth/login?as=pro`);
    const secret = savedSecret(users.broker);
    if (secret) await loginProfessionalAgain(page, users.broker, password, secret);
    else saveSecret(users.broker, await loginProfessional(page, users.broker, password));
    await acceptLegalIfAsked(page);
    await expect(page).toHaveURL(`${WEB}/`);
  }

  async function brokerCustomer(
    page: Page,
    data: { surname: string; givenName: string; fiscalCode: string; email: string },
  ) {
    await page.goto(`${WEB}/richieste/nuova`);
    await page.getByRole("link", { name: "Nuovo cliente" }).click();
    await page.getByLabel("Cognome").fill(data.surname);
    await page.getByLabel("Nome", { exact: true }).fill(data.givenName);
    await page.getByLabel("Codice fiscale").fill(data.fiscalCode);
    await page.getByLabel("Email").fill(data.email);
    await page.getByRole("button", { name: "Salva e inizia la richiesta" }).click();
    await expect(page.getByRole("heading", { name: "Il veicolo" })).toBeVisible();
  }

  /**
   * A synthetic person new at every run: a random birth date (about 13,000
   * possible) changes the fiscal code, so two runs almost never collide.
   */
  function newPerson(surname: string, givenName: string, sex: "M" | "F", place: string) {
    const [a = 0, b = 0, c = 0] = randomBytes(3);
    const month = String(1 + (b % 12)).padStart(2, "0");
    const day = String(1 + (c % 28)).padStart(2, "0");
    return buildFiscalCode({
      surname,
      givenName,
      birthDate: `${1960 + (a % 40)}-${month}-${day}`,
      sex,
      birthPlaceCadastralCode: place,
    });
  }

  test("Paolo crea una richiesta per Anna Riva e le manda il link di consenso; Anna conferma con il codice; il back office approva", async ({
    browser,
  }) => {
    const page = await browser.newPage();
    await broker(page);
    const anna = `e2e.anna.${randomBytes(4).toString("hex")}@example.test`;
    const fiscalCode = newPerson("Riva", "Anna", "F", "H501");
    await brokerCustomer(page, { surname: "Riva", givenName: "Anna", fiscalCode, email: anna });
    await vehicleStep(page, {
      libretto: "libretto-anna-riva.jpg",
      attestato: "attestato-anna-riva.pdf",
    });
    await driversStep(page, "patente-anna-riva.jpg", { holderFiscalCode: fiscalCode });
    await coverageAndAuctionSteps(page);
    await expect(page.getByRole("heading", { name: "Il consenso del cliente" })).toBeVisible();

    const sentAt = clock.now().getTime() - 1000;
    await page.getByRole("button", { name: "Manda il link" }).click();
    await expect(page.getByText("Link inviato al cliente.")).toBeVisible();
    const mail = await latestMail(anna, /ti chiede il consenso/, sentAt);
    const link = /http:\/\/localhost:3000\/consenso\/[A-Za-z0-9_-]+/.exec(mail.text)?.[0] ?? "";

    const customer = await browser.newPage();
    await customer.goto(link);
    await expect(customer.getByRole("heading", { name: /ti chiede il consenso/ })).toBeVisible();
    await expect(customer.getByText(anna)).toHaveCount(0);
    const codeAt = clock.now().getTime() - 1000;
    await customer.getByRole("button", { name: "Mandami il codice" }).click();
    await customer.getByLabel("Codice ricevuto").fill(await codeFromMail(anna, codeAt));
    await customer.getByRole("button", { name: "Confermo il consenso" }).click();
    await expect(customer.getByText("Grazie, consenso confermato")).toBeVisible();

    await page.reload();
    await expect(page.getByText(/Consenso registrato il/)).toBeVisible();
    await page.getByRole("link", { name: "Riepilogo" }).click();
    await page.getByRole("button", { name: "Invia la richiesta" }).click();
    await expect(page.getByText("Richiesta inviata. La verifichiamo")).toBeVisible();
    const code = await requestCode(page);

    const operator = await browser.newPage();
    await backOffice(operator);
    await openCard(operator, code);
    await operator.getByRole("button", { name: "Approva e apri l'asta" }).click();
    await expect(operator.getByText("Richiesta approvata")).toBeVisible();
    await page.reload();
    await expect(page.locator("ol").getByText("Verifica superata", { exact: true })).toBeVisible();

    // Exact search by fiscal code, with nothing in the address of the page (rule 8).
    await page.goto(`${WEB}/clienti`);
    await page.getByLabel("Cerca").fill(fiscalCode);
    await page.getByRole("button", { name: "Cerca" }).click();
    // Waits for the results of the search: one customer, the new Anna.
    await expect(page.getByRole("link", { name: "Anna Riva" })).toHaveCount(1);
    expect(page.url()).not.toContain(fiscalCode);
  });

  test("Paolo crea un'altra richiesta caricando il consenso già raccolto: il back office lo controlla e approva", async ({
    browser,
  }) => {
    const page = await browser.newPage();
    await broker(page);
    const fiscalCode = newPerson("Prova", "Mario", "M", "L219");
    await brokerCustomer(page, {
      surname: "Prova",
      givenName: "Mario",
      fiscalCode,
      email: `e2e.mario.${randomBytes(4).toString("hex")}@example.test`,
    });
    await vehicleStep(page, { libretto: "libretto-mario.jpg", attestato: "attestato-mario.pdf" });
    await driversStep(page, "patente-mario.jpg", { holderFiscalCode: fiscalCode });
    await coverageAndAuctionSteps(page);
    const form = page.locator("form", {
      has: page.getByRole("heading", { name: "Ho già il consenso firmato" }),
    });
    await form.getByLabel("Consenso firmato (PDF o foto)").setInputFiles({
      name: "consenso-firmato.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 consenso"),
    });
    await form.getByRole("button", { name: "Carica il consenso" }).click();
    await expect(page.getByRole("heading", { name: "Riepilogo e invio" })).toBeVisible();
    await page.getByRole("button", { name: "Invia la richiesta" }).click();
    await expect(page.getByText("Richiesta inviata. La verifichiamo")).toBeVisible();
    const code = await requestCode(page);

    const operator = await browser.newPage();
    await backOffice(operator);
    await openCard(operator, code);
    await expect(
      operator.getByText("Consenso caricato dal broker: controlla firma e data"),
    ).toBeVisible();
    await operator.getByRole("button", { name: "Approva e apri l'asta" }).click();
    await expect(operator.getByText("Richiesta approvata")).toBeVisible();
  });

  test("un documento poco leggibile arriva giallo con i campi evidenziati; il back office esclude la richiesta e il cliente lo vede", async ({
    browser,
  }) => {
    const customer = await browser.newPage();
    const email = await newPrivate(customer);
    await customer.getByRole("button", { name: "Nuovo preventivo" }).click();
    await vehicleStep(customer, {
      libretto: "libretto-giulia-neri.jpg",
      attestato: "attestato-giulia-neri.pdf",
    });
    await driversStep(customer, "patente-giulia-neri-low-confidence.jpg");
    await coverageAndAuctionSteps(customer);
    const sentAt = clock.now().getTime() - 1000;
    await customer.getByRole("button", { name: "Mandami il codice" }).click();
    await customer.getByLabel("Codice ricevuto").fill(await codeFromMail(email, sentAt));
    await customer.getByRole("button", { name: "Confermo" }).click();
    await customer.getByRole("button", { name: "Invia la richiesta" }).click();
    await expect(customer.getByText("Richiesta inviata. La verifichiamo")).toBeVisible();
    const code = await requestCode(customer);
    const url = customer.url().split("?")[0] ?? "";

    const operator = await browser.newPage();
    await backOffice(operator);
    await operator.goto(`${ADMIN}/verifiche`);
    await expect(
      operator.getByRole("row", { name: new RegExp(code) }).getByText("Giallo"),
    ).toBeVisible();
    await openCard(operator, code);
    await expect(
      operator.getByText("Campi letti con bassa confidenza (evidenziati)"),
    ).toBeVisible();
    // The fields below the threshold are marked in the document column.
    await expect(operator.locator("dl .text-red-700").first()).toBeVisible();
    await operator.getByLabel("Motivo", { exact: true }).selectOption("VINTAGE");
    await operator
      .getByLabel("Messaggio al richiedente")
      .last()
      .fill("Il veicolo risulta storico.");
    await operator.getByRole("button", { name: "Escludi", exact: true }).click();
    await expect(operator.getByText("Richiesta esclusa")).toBeVisible();

    await customer.goto(url);
    await expect(customer.getByText("Questa richiesta non può andare all'asta")).toBeVisible();
    await expect(customer.getByText("Il veicolo risulta storico.")).toBeVisible();
    const mail = await latestMail(email, /non può andare all'asta/);
    expect(mail.text).toContain("veicolo d'epoca o storico");
  });

  test("sul telefono la procedura non scorre di lato, ha la barra in basso e ogni campo ha un'etichetta", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await newPrivate(page);
    await page.getByRole("button", { name: "Nuovo preventivo" }).click();
    await expect(page.getByRole("heading", { name: "Il veicolo" })).toBeVisible();
    const id = /\/preventivi\/([0-9a-f-]{36})\//.exec(page.url())?.[1] ?? "";
    for (const step of ["veicolo", "conducenti", "copertura", "asta", "consensi", "riepilogo"]) {
      await page.goto(`${WEB}/preventivi/${id}/${step}`);
      const report = await page.evaluate(() => {
        const fields = [...document.querySelectorAll("input:not([type=hidden]), select, textarea")];
        const unlabeled = fields.filter((el) => {
          const input = el as HTMLInputElement;
          return !(input.labels && input.labels.length > 0) && !el.getAttribute("aria-label");
        });
        const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
        return {
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          unlabeled: unlabeled.map((el) => (el as HTMLInputElement).name),
          duplicateIds: ids.filter((x, i) => ids.indexOf(x) !== i),
        };
      });
      expect(report, step).toEqual({ overflow: 0, unlabeled: [], duplicateIds: [] });
    }
    const bottomBar = page.getByRole("navigation", { name: "Menu principale" });
    await expect(bottomBar.getByRole("link", { name: "Preventivi" })).toBeVisible();
    // Keyboard: the first Tab reaches the link that skips to the content.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Vai al contenuto" })).toBeFocused();
    await context.close();
  });
});
