import { randomBytes } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  e2eState,
  acceptLegalIfAsked,
  savedSecret,
  saveSecret,
  loginProfessional,
  loginProfessionalAgain,
} from "../support/auth.js";
import {
  ADMIN,
  approve,
  auctionCard,
  backOffice,
  fireUntil,
  newPrivate,
  submittedRequest,
  WEB,
} from "../support/auction.js";
import { issuePolicy, openIncoming, professional, sendOffer } from "../support/agency.js";
import { birthDateOf, newFiscalCode, ownerSignedDeclaration } from "../support/broker.js";
import { codeFromMail, latestMail, requestCode } from "../support/requests.js";
import { DESKTOP, Meter, PHONE } from "./meter.js";
import { SystemClock } from "@astax/adapters/clock";

const clock = new SystemClock();

/** A value a previous flow of this run must have set. */
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("A previous flow of this run did not run");
  return value;
}

/**
 * UX review, measurement of the flows (docs/ux-review/2026-10-23). Each test
 * walks one flow as a person does, counting screens, taps, fields, choices
 * and files, and shoots every screen at 390 and 1440 px. The flows share
 * the same requests, in order, like a real day: the private customer asks,
 * the back office verifies, the agencies offer, the customer buys, the
 * agency issues; then the broker; then the integrations and the reconfirmation.
 */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PDF = Buffer.from("%PDF-1.4 ux");

const state: {
  customer?: Page;
  email?: string;
  code?: string;
  url?: string;
  uno?: Page;
  operator?: Page;
} = {};

/** axe wants a page of its own context (browser.newPage() is refused). */
async function newPage(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport });
  return context.newPage();
}

/** Picks a photo of the request: the card turns green when received. */
async function photo(page: Page, m: Meter, title: string, fileName: string): Promise<void> {
  const form = page.locator("form", {
    has: page.getByRole("heading", { name: title, exact: true }),
  });
  const t0 = clock.now().getTime();
  m.tap(); // «Scatta una foto»
  m.file();
  const received = () =>
    page
      .locator("form", { has: page.getByRole("heading", { name: title, exact: true }) })
      .getByText(`Ricevuto: ${fileName}`);
  // On this slow PC the page may not be hydrated yet when the file is picked
  // (the change event then sends nothing): a second pick after 30 s.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await form.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: fileName.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
      buffer: fileName.endsWith(".pdf") ? PDF : JPEG,
    });
    const ok = await received()
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (ok) break;
  }
  await expect(received()).toBeVisible({ timeout: 60_000 });
  m.wait((clock.now().getTime() - t0) / 1000);
}

/** The back office operator of this run, logged in once. */
async function operatorPage(browser: Browser): Promise<Page> {
  if (!state.operator) {
    state.operator = await newPage(browser, DESKTOP);
    await backOffice(state.operator);
  }
  return state.operator;
}

/** The five screens, measured; `broker` skips the consent tick. */
async function fiveScreens(
  page: Page,
  m: Meter,
  files: { libretto: string; patente: string; attestato: string },
  birthDate: string,
  broker: boolean,
): Promise<void> {
  await expect(page).toHaveURL(/\/tipo$/, { timeout: 60_000 });
  await m.screen(page, "tipo-veicolo");
  m.tap();
  await page.getByRole("link", { name: /Già assicurato/ }).click();
  await expect(page).toHaveURL(/\/dati\?stato=INSURED/);
  await m.screen(page, "dati-e-foto-vuoto");
  await photo(page, m, "Libretto di circolazione", files.libretto);
  await photo(page, m, "Patente", files.patente);
  await photo(page, m, "Attestato di rischio (facoltativo)", files.attestato);
  await expect(page.getByLabel("Targa")).not.toHaveValue("");
  await m.screen(page, "dati-e-foto-letti");
  // Typed only when the app could not propose it (licence read by the bot, customer card).
  const birth = page.getByLabel("Data di nascita del proprietario");
  if ((await birth.inputValue()) === "") {
    m.type();
    await birth.fill(birthDate);
  }
  m.tap();
  await page.getByRole("button", { name: "Continua" }).click();
  await expect(page).toHaveURL(/\/guida$/);
  await m.screen(page, "guida");
  m.choose();
  await page.getByLabel(/Guida libera/).check();
  m.tap();
  await page.getByRole("button", { name: "Continua" }).click();
  await expect(page).toHaveURL(/\/copertura$/);
  await m.screen(page, "copertura");
  m.tap();
  await page.getByRole("button", { name: "Salva e continua" }).click();
  await expect(page).toHaveURL(/\/conferma$/);
  await m.screen(page, "conferma");
  if (!broker) {
    m.choose();
    await page.getByLabel(/Ho letto e accetto il trattamento/).check();
  }
  m.tap();
  const t0 = clock.now().getTime();
  await page.getByRole("button", { name: "Invia la richiesta" }).click();
  await expect(page.getByText("Richiesta inviata. La verifichiamo")).toBeVisible();
  m.wait((clock.now().getTime() - t0) / 1000);
  await m.screen(page, "richiesta-inviata");
}

/** Professional login, measured (password, then the TOTP code). */
async function proLogin(page: Page, m: Meter, email: string, where = `${WEB}/auth/login?as=pro`) {
  const { password } = e2eState();
  await page.goto(where);
  await m.screen(page, "accesso-keycloak");
  m.type(2);
  m.tap();
  const secret = savedSecret(email);
  if (secret) await loginProfessionalAgain(page, email, password, secret);
  else saveSecret(email, await loginProfessional(page, email, password));
  m.type(); // the TOTP code
  m.tap();
  await acceptLegalIfAsked(page);
}

/** Development tool (rule 13): three synthetic offers, then the closing. */
async function testOffersAndClose(operator: Page, code: string): Promise<void> {
  const card = await auctionCard(operator, code);
  await card.getByRole("button", { name: "Invia 3 offerte di prova" }).click();
  // The status message may vanish at once with the live refresh: the closing checks the offers.
  await operator.waitForLoadState("networkidle").catch(() => undefined);
  await fireUntil(operator, code, "Chiusa");
}

test.describe.serial("misura UX", () => {
  test("privato: dalla prima visita alla richiesta inviata", async ({ browser }) => {
    const m = new Meter("privato-richiesta", "privato", PHONE.width);
    const page = await newPage(browser, PHONE);
    state.customer = page;
    const email = `ux.privato.${randomBytes(4).toString("hex")}@example.test`;
    state.email = email;
    await page.goto(WEB);
    await m.screen(page, "home-pubblica");
    m.tap();
    // The hero button leads straight to the code login (Keycloak), not to «Accedi».
    await page.getByRole("link", { name: "Chiedi il preventivo" }).first().click();
    await expect(page.getByLabel("Email")).toBeVisible();
    await m.screen(page, "email");
    m.type();
    m.tap();
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Inviami il codice" }).click();
    await expect(page.getByText("Scrivi il codice")).toBeVisible();
    await m.screen(page, "codice");
    m.type();
    m.tap();
    const code6 = await (async () => {
      for (let i = 0; i < 40; i += 1) {
        const list = (await (
          await fetch(
            `http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`,
          )
        ).json()) as { messages: { ID: string }[] };
        const latest = list.messages[0];
        if (latest) {
          const msg = (await (
            await fetch(`http://127.0.0.1:8025/api/v1/message/${latest.ID}`)
          ).json()) as { Text: string };
          const c = /\b(\d{6})\b/.exec(msg.Text)?.[1];
          if (c) return c;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error("no code");
    })();
    await page.getByLabel("Codice").fill(code6);
    await page.getByRole("button", { name: "Accedi" }).click();
    if (/\/documenti-legali$/.test(page.url())) {
      await m.screen(page, "documenti-da-accettare");
      m.tap();
      await page.getByRole("button", { name: /accetto/ }).click();
    }
    await expect(page).toHaveURL(`${WEB}/`);
    await m.screen(page, "home-privato-vuota");
    m.tap();
    await page.getByRole("button", { name: "Nuovo preventivo" }).click();
    await fiveScreens(
      page,
      m,
      {
        libretto: "libretto-giulia-neri.jpg",
        patente: "patente-giulia-neri.jpg",
        attestato: "attestato-giulia-neri.pdf",
      },
      "1990-05-12",
      false,
    );
    state.code = await requestCode(page);
    state.url = page.url().split("?")[0];
    await page.goto(WEB);
    await m.screen(page, "home-privato-in-verifica");
    m.save();
  });

  test("back office: verifica, completamento dei dati e approvazione", async ({ browser }) => {
    const m = new Meter("backoffice-verifica", "verificatore", DESKTOP.width);
    const page = await newPage(browser, DESKTOP);
    state.operator = page;
    const code = required(state.code);
    await page.goto(ADMIN);
    await m.screen(page, "accesso-back-office");
    m.tap();
    await page.getByRole("link", { name: "Accedi" }).click();
    const { users, password } = e2eState();
    await m.screen(page, "accesso-keycloak");
    m.type(3);
    m.tap(2);
    const secret = savedSecret(users.verifier);
    if (secret) await loginProfessionalAgain(page, users.verifier, password, secret);
    else saveSecret(users.verifier, await loginProfessional(page, users.verifier, password));
    await acceptLegalIfAsked(page);
    await expect(page).toHaveURL(`${ADMIN}/`);
    await m.screen(page, "cruscotto");
    m.tap();
    await page.getByRole("link", { name: "Coda verifiche" }).first().click();
    await expect(page).toHaveURL(/\/verifiche/);
    await m.screen(page, "coda-verifiche");
    m.tap();
    await page.getByRole("link", { name: code }).click();
    await expect(page.getByRole("heading", { name: `Verifica ${code}` })).toBeVisible();
    await m.screen(page, "scheda-verifica");
    const completion = page.getByRole("heading", { name: "Completa i dati" });
    if (await completion.isVisible()) {
      m.type();
      await page.getByLabel(/Data di acquisto/).fill("2020-04-01");
      m.tap();
      const t0 = clock.now().getTime();
      await page.getByRole("button", { name: "Salva i dati completati" }).click();
      await expect(page.getByText("Dati completati")).toBeVisible();
      m.wait((clock.now().getTime() - t0) / 1000);
      await m.screen(page, "dati-completati");
    }
    await expect(page.getByRole("heading", { name: "Agenzie da invitare" })).toBeVisible();
    m.tap();
    await page.getByRole("button", { name: "Approva e apri l'asta" }).click();
    await expect(page.getByText("Richiesta approvata")).toBeVisible();
    await m.screen(page, "approvata");
    m.save();
    // Setup for the agencies: Uno and Tre invited whatever the automatic choice.
    for (const agency of ["Agenzia Uno", "Agenzia Tre"]) {
      await invite(page, code, agency);
    }
    // The customer's side of the auction (Momento 2).
    const customer = required(state.customer);
    const mc = new Meter("privato-asta-in-corso", "privato", PHONE.width);
    await customer.goto(required(state.url));
    await expect(customer.getByText("Asta in corso")).toBeVisible({ timeout: 60_000 });
    await mc.screen(customer, "asta-in-corso");
    await customer.goto(WEB);
    await mc.screen(customer, "home-con-asta");
    mc.save();
  });

  test("agenzia: dall'avviso all'offerta in busta chiusa", async ({ browser }) => {
    const m = new Meter("agenzia-offerta", "agenzia (titolare)", DESKTOP.width);
    const { users } = e2eState();
    const uno = await newPage(browser, DESKTOP);
    state.uno = uno;
    const code = required(state.code);
    await proLogin(uno, m, users.owner);
    await m.screen(uno, "dashboard-agenzia");
    m.tap();
    await uno.getByRole("link", { name: "Notifiche" }).first().click();
    await m.screen(uno, "notifiche");
    m.tap();
    await uno.getByRole("link", { name: "Partecipa all'asta" }).first().click();
    await expect(async () => {
      await uno.goto(`${WEB}/richieste-in-arrivo`);
      await expect(uno.getByRole("link", { name: code }).first()).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 60_000 });
    await m.screen(uno, "partecipa-all-asta");
    m.tap();
    await uno.getByRole("link", { name: code }).first().click();
    await expect(uno.getByText("Ogni apertura di questa richiesta")).toBeVisible();
    await m.screen(uno, "dettaglio-richiesta");
    m.tap();
    await uno.getByRole("button", { name: "Prendi in carico" }).click();
    await expect(uno.getByRole("heading", { name: "La tua offerta" })).toBeVisible();
    await m.screen(uno, "modulo-offerta");
    // The offer: premium, company, product, limit, capital, PDF, confirmation.
    m.type(); // premio
    m.choose(2); // compagnia, prodotto
    m.type(2); // massimale, capitale
    m.file(); // PDF
    m.choose(); // vincolante
    m.tap();
    const t0 = clock.now().getTime();
    await sendOffer(uno, "Compagnia Alfa", "520,00", 4);
    m.wait((clock.now().getTime() - t0) / 1000);
    await m.screen(uno, "ricevuta-busta-chiusa");
    m.save();
    // Tre offers too (not measured), then the closing by the development tool.
    const tre = await newPage(browser, DESKTOP);
    await professional(tre, users.sofia);
    await openIncoming(tre, code);
    await tre.getByRole("button", { name: "Prendi in carico" }).click();
    await sendOffer(tre, "Compagnia Beta", "505,00", 2);
    await tre.close();
    await fireUntil(required(state.operator), code, "Chiusa");
  });

  test("privato: apertura, confronto AI, scelta, firma e pagamento", async () => {
    const m = new Meter("privato-acquisto", "privato", PHONE.width);
    const page = required(state.customer);
    const url = required(state.url);
    await expect(async () => {
      await page.goto(url);
      await expect(page.locator("#offerte li", { hasText: /Compagnia/ })).toHaveCount(2, {
        timeout: 1000,
      });
    }).toPass({ timeout: 60_000 });
    await m.screen(page, "offerte-aperte");
    m.tap();
    await page.getByRole("link", { name: "Confronta con AI" }).click();
    await m.screen(page, "confronto-ai-proposta");
    m.tap();
    const t0 = clock.now().getTime();
    await page.getByRole("button", { name: "Confronta con AI" }).click();
    await expect(page.getByRole("heading", { name: "Suggerimento generato con AI" })).toBeVisible();
    m.wait((clock.now().getTime() - t0) / 1000);
    await m.screen(page, "suggerimento-ai");
    await page.goto(url);
    m.tap();
    const t1 = clock.now().getTime();
    await page
      .locator("li", { hasText: "Compagnia Alfa" })
      .getByRole("button", { name: "Scegli questa offerta" })
      .click();
    await expect(page).toHaveURL(/\/accettazione$/, { timeout: 90_000 });
    m.wait((clock.now().getTime() - t1) / 1000);
    await m.screen(page, "firma-e-paga");
    m.choose();
    await page.getByLabel("Ho letto i documenti").check();
    m.tap();
    await page.getByRole("button", { name: /^Firma e paga/ }).click();
    await expect(page).toHaveURL(/\/firma-di-prova\//);
    await m.screen(page, "firma-fornitore");
    m.type();
    m.tap();
    await page.getByLabel("Codice ricevuto").fill("123456");
    const t2 = clock.now().getTime();
    await page.getByRole("button", { name: "Firma", exact: true }).click();
    await expect(page).toHaveURL(/\/accettazione$/);
    await expect(page.getByText(/Documenti firmati il/)).toBeVisible();
    m.wait((clock.now().getTime() - t2) / 1000);
    await m.screen(page, "firmato-paga");
    m.tap();
    await page.getByRole("button", { name: /^Paga 555,00/ }).click();
    await expect(page).toHaveURL(/\/pagamento-di-prova\//);
    await m.screen(page, "pagamento-fornitore");
    m.type();
    m.tap();
    await page.getByLabel("Numero della carta").fill("4242 4242 4242 4242");
    const t3 = clock.now().getTime();
    await page.getByRole("button", { name: "Paga con carta" }).click();
    await expect(page).toHaveURL(/\/accettazione\?esito=/);
    m.wait((clock.now().getTime() - t3) / 1000);
    await expect(page.getByRole("heading", { name: "Pagato" })).toBeVisible();
    await m.screen(page, "pagato");
    m.save();
  });

  test("agenzia: esito ed emissione; privato: polizza emessa", async () => {
    const m = new Meter("agenzia-emissione", "agenzia (titolare)", DESKTOP.width);
    const uno = required(state.uno);
    const code = required(state.code);
    await uno.goto(`${WEB}/risultati`);
    await m.screen(uno, "risultati");
    m.tap();
    await uno.goto(`${WEB}/da-emettere`);
    await m.screen(uno, "polizze-da-emettere");
    m.tap();
    await uno.locator("tr", { hasText: code }).getByRole("link").first().click();
    await m.screen(uno, "dettaglio-da-emettere");
    const t0 = clock.now().getTime();
    m.file(3);
    // One tap per file when the file leaves by itself; two with a «Carica» button.
    m.tap((await uno.locator("form button", { hasText: /^Carica$/ }).count()) > 0 ? 6 : 3);
    m.type(); // numero di polizza
    m.tap(); // «Segna come emessa»
    await issuePolicy(uno, code, `ALFA-${code.slice(-6)}`);
    m.wait((clock.now().getTime() - t0) / 1000);
    await m.screen(uno, "polizza-emessa");
    m.save();

    const mc = new Meter("privato-polizza", "privato", PHONE.width);
    const page = required(state.customer);
    await page.goto(`${WEB}/polizze`);
    await mc.screen(page, "le-mie-polizze");
    await page.goto(WEB);
    await mc.screen(page, "home-con-polizza");
    mc.save();
  });

  test("sub-agente: due agenzie, passaggio dall'una all'altra", async ({ browser }) => {
    const m = new Meter("subagente-cambio-agenzia", "sub-agente", DESKTOP.width);
    const { users } = e2eState();
    const marco = await newPage(browser, DESKTOP);
    await proLogin(marco, m, users.marco);
    await expect(marco).toHaveURL(`${WEB}/contesto`);
    await m.screen(marco, "scelta-contesto");
    m.tap();
    await marco
      .locator("div", { hasText: "Agenzia Uno" })
      .getByRole("button", { name: "Lavora per questa" })
      .first()
      .click();
    await m.screen(marco, "dashboard-sub-agente");
    m.choose();
    m.tap();
    await marco.getByLabel("Passa a").selectOption({ label: "Agenzia Tre" });
    await marco.getByRole("button", { name: "Vai", exact: true }).click();
    await expect(marco.getByRole("banner").locator("span", { hasText: /^Agenzia / })).toHaveText(
      "Agenzia Tre",
    );
    await m.screen(marco, "dopo-il-cambio");
    m.save();
    await marco.close();
  });

  test("broker: richiesta per un cliente nuovo", async ({ browser }) => {
    const m = new Meter("broker-richiesta", "broker", DESKTOP.width);
    await ownerSignedDeclaration(() => browser.newPage());
    const paolo = await newPage(browser, DESKTOP);
    const { users } = e2eState();
    await proLogin(paolo, m, users.broker);
    await expect(paolo).toHaveURL(`${WEB}/`);
    await m.screen(paolo, "richieste-del-broker");
    m.tap();
    await paolo.goto(`${WEB}/richieste/nuova`);
    await m.screen(paolo, "scegli-il-cliente");
    m.tap();
    await paolo.getByRole("link", { name: "Nuovo cliente" }).click();
    await m.screen(paolo, "nuovo-cliente");
    const email = `ux.anna.${randomBytes(4).toString("hex")}@example.test`;
    const fiscalCode = newFiscalCode("Riva", "Anna", "F");
    m.type(4);
    m.tap();
    await paolo.getByLabel("Cognome").fill("Riva");
    await paolo.getByLabel("Nome", { exact: true }).fill("Anna");
    await paolo.getByLabel("Codice fiscale").fill(fiscalCode);
    await paolo.getByLabel("Email").fill(email);
    await paolo.getByRole("button", { name: "Salva e inizia la richiesta" }).click();
    await fiveScreens(
      paolo,
      m,
      {
        libretto: "libretto-anna-riva.jpg",
        patente: "patente-anna-riva.jpg",
        attestato: "attestato-anna-riva.pdf",
      },
      birthDateOf(fiscalCode),
      true,
    );
    const code = await requestCode(paolo);
    const url = paolo.url().split("?")[0] ?? "";
    await paolo.goto(`${WEB}/richieste`);
    await m.screen(paolo, "tabella-dopo-invio");
    m.save();
    // Setup: approval, test offers, closing.
    const operator = await operatorPage(browser);
    await approve(operator, code);
    await testOffersAndClose(operator, code);

    const mb = new Meter("broker-acquisto", "broker e suo cliente", DESKTOP.width);
    await expect(async () => {
      await paolo.goto(url);
      await expect(paolo.locator("#offerte li", { hasText: /Compagnia/ }).first()).toBeVisible({
        timeout: 1000,
      });
    }).toPass({ timeout: 60_000 });
    await mb.screen(paolo, "confronto-offerte");
    mb.choose();
    mb.tap();
    const sentAt = clock.now().getTime() - 1000;
    await paolo.locator("#offerte input[type=checkbox]").first().check();
    await paolo.getByRole("button", { name: "Invia al cliente" }).click();
    await expect(paolo.getByText(/Link inviato: vale fino al/)).toBeVisible();
    await mb.screen(paolo, "link-inviato");
    const mail = await latestMail(email, /la tua offerta RC auto/, sentAt);
    const link = /http:\/\/localhost:3000\/offerta\/[A-Za-z0-9_-]+/.exec(mail.text)?.[0] ?? "";
    const anna = await newPage(browser, PHONE);
    const ma = new Meter("cliente-del-broker", "cliente del broker", PHONE.width);
    // Decision 42: the code leaves with the opening; one tap and one screen less.
    const codeAt = clock.now().getTime() - 1000;
    await anna.goto(link);
    await ma.screen(anna, "link-offerta");
    ma.type();
    ma.tap();
    await anna.getByLabel("Codice ricevuto").fill(await codeFromMail(email, codeAt));
    await anna.getByRole("button", { name: "Vedi l'offerta" }).click();
    await expect(anna.locator("li", { hasText: /Compagnia/ })).toHaveCount(1);
    await ma.screen(anna, "offerta");
    ma.tap();
    const t0 = clock.now().getTime();
    await anna.getByRole("button", { name: "Scegli questa offerta" }).click();
    await expect(anna.getByText("Nessun compenso")).toBeVisible({ timeout: 90_000 });
    ma.wait((clock.now().getTime() - t0) / 1000);
    await ma.screen(anna, "firma-e-paga");
    ma.choose();
    ma.tap();
    await anna.getByLabel("Ho letto i documenti").check();
    await anna.getByRole("button", { name: /^Firma e paga/ }).click();
    await expect(anna).toHaveURL(/\/firma-di-prova\//);
    ma.type();
    ma.tap();
    await anna.getByLabel("Codice ricevuto").fill("123456");
    await anna.getByRole("button", { name: "Firma", exact: true }).click();
    await expect(anna).toHaveURL(/\/offerta\/[A-Za-z0-9_-]+$/);
    await expect(anna.getByText(/Documenti firmati il/)).toBeVisible();
    await ma.screen(anna, "firmato-paga");
    ma.tap();
    await anna.getByRole("button", { name: /^Paga / }).click();
    await expect(anna).toHaveURL(/\/pagamento-di-prova\//);
    ma.type();
    ma.tap();
    await anna.getByLabel("Numero della carta").fill("4242 4242 4242 4242");
    await anna.getByRole("button", { name: "Paga con carta" }).click();
    await expect(anna).toHaveURL(/\/offerta\/[A-Za-z0-9_-]+\?esito=/);
    await expect(anna.getByRole("heading", { name: "Pagato" })).toBeVisible();
    await ma.screen(anna, "pagato");
    ma.save();
    await anna.close();
    await paolo.goto(url);
    await expect(paolo.getByText(/Il cliente ha pagato/)).toBeVisible();
    await mb.screen(paolo, "cliente-ha-pagato");
    mb.save();
    await paolo.close();
  });

  test("back office: richiesta di integrazioni; privato: completa", async ({ browser }) => {
    const customer = await newPage(browser, PHONE);
    const email = await newPrivate(customer);
    const { code, url } = await submittedRequest(customer, email);
    const m = new Meter("backoffice-integrazione", "verificatore", DESKTOP.width);
    const operator = await operatorPage(browser);
    await operator.goto(`${ADMIN}/verifiche`);
    m.tap();
    await operator.getByRole("link", { name: code }).click();
    await expect(operator.getByRole("heading", { name: `Verifica ${code}` })).toBeVisible();
    await m.screen(operator, "scheda-verifica");
    // ADR 0013: an integration can be asked once the data are completed.
    m.type();
    await operator.getByLabel(/Data di acquisto/).fill("2020-04-01");
    m.tap();
    await operator.getByRole("button", { name: "Salva i dati completati" }).click();
    await expect(operator.getByText("Dati completati")).toBeVisible();
    await m.screen(operator, "dati-completati");
    const form = operator.locator("form", {
      has: operator.getByRole("button", { name: "Chiedi l'integrazione" }),
    });
    m.choose(3);
    await form.locator('input[name="reasonCodes"]').first().check();
    await form.locator('input[name="sections"]').first().check();
    await form.locator('input[name="documents"]').first().check();
    m.type();
    await form.getByLabel(/Messaggio/).fill("La foto del libretto è tagliata: rifalla intera.");
    m.tap();
    await form.getByRole("button", { name: "Chiedi l'integrazione" }).click();
    await expect(operator.getByText("Integrazione chiesta")).toBeVisible();
    await m.screen(operator, "integrazione-chiesta");
    m.save();

    const mc = new Meter("privato-integrazione", "privato", PHONE.width);
    await customer.goto(WEB);
    await mc.screen(customer, "home-con-integrazione");
    mc.tap();
    await customer.goto(url);
    await mc.screen(customer, "richiesta-da-integrare");
    mc.tap();
    await customer.getByRole("link", { name: "Completa" }).first().click();
    await mc.screen(customer, "schermata-da-correggere");
    mc.save();
    await customer.close();
  });

  test("privato: prezzi scaduti e riconferma", async ({ browser }) => {
    const customer = await newPage(browser, PHONE);
    const email = await newPrivate(customer);
    const { code, url } = await submittedRequest(customer, email);
    const operator = await operatorPage(browser);
    await approve(operator, code);
    await testOffersAndClose(operator, code);
    const m = new Meter("privato-riconferma", "privato", PHONE.width);
    try {
      await moveClockQuietly(operator, 45 * 24 * 60);
      await expect(async () => {
        await customer.goto(url);
        if (await customer.getByRole("button", { name: "Chiedi riconferma" }).isVisible()) return;
        await operator.goto(`${ADMIN}/aste?codice=${code}`);
        const fire = operator
          .getByRole("region", { name: code })
          .last()
          .getByRole("button", { name: "Fai scattare il prossimo passo" });
        if (await fire.isVisible()) await fire.click();
        await expect(customer.getByRole("button", { name: "Chiedi riconferma" })).toBeVisible({
          timeout: 2000,
        });
      }).toPass({ timeout: 120_000, intervals: [2000, 3000] });
      await m.screen(customer, "prezzi-scaduti");
      m.tap();
      await customer.getByRole("button", { name: "Chiedi riconferma" }).click();
      await expect(async () => {
        await customer.goto(url);
        await expect(customer.getByText("Riconferma in corso")).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 60_000 });
      await m.screen(customer, "riconferma-in-corso");
      m.save();
    } finally {
      await moveClockQuietly(operator, "reset");
    }
    await customer.close();
  });
});

/**
 * The back office invites an agency by hand (ASTA-06). The status message can
 * vanish at once when the live refresh of the page follows the invitation, so
 * only the sending is awaited: if the invitation did not reach the agency,
 * its flow fails at «Partecipa all'asta» with a clear message.
 */
async function invite(operator: Page, code: string, agency: string): Promise<void> {
  const card = await auctionCard(operator, code);
  const form = card.locator("form", { has: operator.getByRole("button", { name: "Invita" }) });
  await form.getByLabel("Agenzia", { exact: true }).selectOption({ label: agency });
  await form.getByLabel("Motivo").fill("Misura UX");
  await form.getByRole("button", { name: "Invita" }).click();
  await operator.waitForLoadState("networkidle").catch(() => undefined);
}

/** The development clock (rule 13), without waiting for a status message the live refresh may hide. */
async function moveClockQuietly(operator: Page, minutes: number | "reset"): Promise<void> {
  await operator.goto(`${ADMIN}/aste`);
  if (minutes === "reset") {
    await operator.getByRole("button", { name: "Riporta l'orologio a oggi" }).click();
  } else {
    await operator.getByLabel("Minuti").fill(String(minutes));
    await operator.getByRole("button", { name: /Sposta avanti l'orologio/ }).click();
  }
  await operator.waitForLoadState("networkidle").catch(() => undefined);
}
