import { randomBytes } from "node:crypto";
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
import { completeData, fiveChecks } from "../support/auction.js";
import { birthDateOf, ownerSignedDeclaration } from "../support/broker.js";
import { latestMail, photo, privateRequestSteps, requestCode } from "../support/requests.js";

const WEB = "http://localhost:3000";
const ADMIN = "http://localhost:3001";

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

  /** A private request with the five screens, submitted; returns its code and URL. */
  async function privateRequest(page: Page): Promise<{ code: string; url: string }> {
    await page.getByRole("button", { name: "Nuovo preventivo" }).click();
    await expect(page.getByRole("heading", { name: "Che veicolo vuoi assicurare?" })).toBeVisible();
    await privateRequestSteps(page);
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

  test("Giulia invia foto e pochi dati; l'operatore completa i dati letti dal bot e approva", async ({
    browser,
  }) => {
    const customer = await browser.newPage();
    await newPrivate(customer);
    const { code, url } = await privateRequest(customer);

    const operator = await browser.newPage();
    await backOffice(operator);
    await operator.goto(`${ADMIN}/verifiche`);
    // ADR 0013: with the essential data only the request waits, yellow, to complete.
    await expect(
      operator.getByRole("row", { name: new RegExp(code) }).getByText("Giallo"),
    ).toBeVisible();
    await openCard(operator, code);
    await expect(operator.getByRole("heading", { name: "Completa i dati" })).toBeVisible();
    // The bot read the registration and the ID card; the purchase date is asked by phone.
    await expect(operator.getByLabel(/Cognome/).first()).toHaveValue("Neri");
    await completeData(operator);
    await expect(operator.getByText("Controllo automatico")).toBeVisible();
    await fiveChecks(operator);
    await operator.getByRole("button", { name: "Approva e apri l'asta" }).click();
    await expect(operator.getByText("Richiesta approvata")).toBeVisible();

    // The timeline shows every step.
    await customer.goto(url);
    for (const step of ["Richiesta creata", "Consenso confermato", "Richiesta inviata"]) {
      await expect(customer.locator("ol").getByText(step, { exact: true }).first()).toBeVisible();
    }
    // Phase 3: the worker opens the auction right after the approval.
    await expect(
      customer
        .getByText("La richiesta è pronta")
        .or(customer.getByRole("heading", { name: "Asta in corso" })),
    ).toBeVisible();
  });

  test("una foto che non si legge è segnalata subito e l'invio resta bloccato finché non si rifà", async ({
    page,
  }) => {
    await newPrivate(page);
    await page.getByRole("button", { name: "Nuovo preventivo" }).click();
    await page.getByRole("link", { name: /Già assicurato/ }).click();
    await photo(page, "Libretto di circolazione", "libretto-giulia-neri.jpg");
    // Dan, 2026-10-28: the ID card instead of the licence.
    const card = page.locator("form", {
      has: page.getByRole("heading", { name: "Carta d'identità", exact: true }),
    });
    await card.locator('input[type="file"]').setInputFiles({
      name: "identita-giulia-neri-low-confidence.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]),
    });
    await expect(card.getByRole("alert")).toContainText("non si legge bene");
    await photo(page, "Carta d'identità", "identita-giulia-neri.jpg");
    await expect(card.getByRole("alert")).toHaveCount(0);
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
    await expect(page.getByRole("heading", { name: "Che veicolo vuoi assicurare?" })).toBeVisible();
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

  test("Paolo crea una richiesta per Anna Riva con le 5 schermate; il consenso è coperto dalla dichiarazione; il back office completa e approva", async ({
    browser,
  }) => {
    await ownerSignedDeclaration(() => browser.newPage());
    const page = await browser.newPage();
    await broker(page);
    const anna = `e2e.anna.${randomBytes(4).toString("hex")}@example.test`;
    const fiscalCode = newPerson("Riva", "Anna", "F", "H501");
    await brokerCustomer(page, { surname: "Riva", givenName: "Anna", fiscalCode, email: anna });
    await privateRequestSteps(page, {
      libretto: "libretto-anna-riva.jpg",
      identita: "identita-anna-riva.jpg",
      plate: "AR456CD",
      ownerBirthDate: birthDateOf(fiscalCode),
      broker: true,
    });
    await expect(page.getByText("Richiesta inviata. La verifichiamo")).toBeVisible();
    const code = await requestCode(page);

    const operator = await browser.newPage();
    await backOffice(operator);
    await openCard(operator, code);
    await expect(operator.getByRole("heading", { name: "Completa i dati" })).toBeVisible();
    // LEG-04: the holder is the customer Anna, with her fiscal code.
    await expect(operator.getByLabel(/Cognome/).first()).toHaveValue("Riva");
    await completeData(operator);
    await fiveChecks(operator);
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

  test("il back office esclude una richiesta ancora da completare e il cliente lo vede", async ({
    browser,
  }) => {
    const customer = await browser.newPage();
    const email = await newPrivate(customer);
    const { code, url } = await privateRequest(customer);

    const operator = await browser.newPage();
    await backOffice(operator);
    await openCard(operator, code);
    await expect(operator.getByRole("heading", { name: "Completa i dati" })).toBeVisible();
    // Dan, 2026-10-28: the decisions are in the bar at the bottom of the page.
    await operator.getByText("Escludi la richiesta", { exact: true }).click();
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
    await expect(page.getByRole("heading", { name: "Che veicolo vuoi assicurare?" })).toBeVisible();
    const id = /\/preventivi\/([0-9a-f-]{36})\//.exec(page.url())?.[1] ?? "";
    // Dan, 2026-10-21: the five screens of the private customer.
    for (const step of [
      "tipo",
      "dati?stato=INSURED",
      "dati?stato=NEW",
      "guida",
      "copertura",
      "conferma",
    ]) {
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
