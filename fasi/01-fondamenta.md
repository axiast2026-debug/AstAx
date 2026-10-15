# Fase 1 — Fondamenta

**Obiettivo.** Un monorepo che si avvia con un comando, con accesso sicuro per ogni ruolo, permessi controllati nell'API, registro attività immutabile, parametri e documenti legali con versioni.

**Si chiude quando:** login con secondo fattore e permessi testati per ogni ruolo.

## Prima di iniziare

- Da leggere: `CLAUDE.md`, `docs/architettura-codice.md`, `docs/permessi.md`, `docs/modello-dati.md` (sezione «Identità e organizzazioni»), regole SIC e LEG in `docs/regole-di-dominio.md`, `docs/decisioni-aggiunte.md` (36-38).
- Serve da Dan: il repository GitHub privato e un computer con Docker per l'ambiente locale.

## Cosa comprende

- Monorepo, ambiente locale, CI.
- Autenticazione con Keycloak, organizzazioni, appartenenze, ruoli, abilitazioni, contesto attivo.
- Mappa dei permessi con negazione predefinita.
- Registro attività, eventi di dominio, outbox.
- Parametri, elenchi, festività, documenti legali con accettazione.
- Scheletri di `apps/web` e `apps/admin` con accesso, menu per ruolo, profilo.

Non comprende: richieste, aste, offerte, pagamenti; pannello di amministrazione completo (fase 7).

## Passi

1. **Monorepo.** pnpm workspaces e Turborepo; `packages/config` con TypeScript strict, ESLint, Prettier; Vitest; Node LTS indicato in `.nvmrc`. Script: `dev`, `build`, `lint`, `typecheck`, `test`, `test:int`, `test:e2e`, `check`, `db:migrate`, `db:seed`, `db:reset`. Regole di lint: niente `any` esplicito, niente `Date.now()` o `new Date()` fuori dall'adattatore `Clock`, niente testi dell'interfaccia scritti nei componenti.
2. **Ambiente locale.** `infra/docker-compose.yml` con PostgreSQL, Redis, Keycloak (realm importato da `infra/keycloak/realm-astax.json`), server di sviluppo Temporal, MinIO, Mailpit. File `.env.example` completo; `README.md` con i passi da una macchina pulita.
3. **Database.** `packages/db` con Prisma: entità della sezione «Identità e organizzazioni» di `docs/modello-dati.md`. Migrazione SQL per la sicurezza a livello di riga sulle tabelle con `organizationId` e per il blocco di `UPDATE` e `DELETE` su `AuditLog`.
4. **Seed.** Caricamento di `seed/parametri.json`, `seed/elenchi.json`, `seed/festivita.json` e dei documenti legali segnaposto. Generatore di dati sintetici con le organizzazioni e gli utenti degli scenari (`docs/scenari-accettazione.md`, «Dati comuni»): AstAx con un utente per ogni ruolo di back office e un amministratore; Agenzie Uno-Dieci con titolare, supervisore e operatori; Marco Rossi operatore in Agenzia Uno e Agenzia Tre; Broker Demo Srl; i cinque privati.
5. **API.** NestJS con configurazione validata da Zod, logger con oscuramento dei campi sensibili (SIC-06), errori `problem+json`, documento OpenAPI, controllo di salute, provider `Clock`.
6. **Autenticazione.** Realm `astax` con i client di `web`, `admin` e `api`. Utenze professionali: password e TOTP obbligatori. Privati: accesso senza password con codice via email o SMS (decisione 37: autenticatore aggiuntivo di Keycloak; in sviluppo SMS e email finiscono in Mailpit). Durata delle sessioni dai parametri `session.*`, applicata a Keycloak tramite la sua API di amministrazione quando il parametro cambia. L'API valida i token e crea l'utente privato al primo accesso.
7. **Permessi.** Mappa delle azioni da `docs/permessi.md` in `packages/shared` (tutte le azioni, anche quelle che le fasi successive implementeranno); guard dell'API con negazione predefinita; intestazione `X-AstAx-Context` obbligatoria per gli utenti professionali; contesto applicato alla sicurezza a livello di riga in ogni transazione.
8. **Team.** Il titolare invita un utente via email (`TeamInvite`), sceglie ruolo e abilitazioni, sospende e rimuove. Selettore del contesto per chi ha più appartenenze.
9. **Registro e eventi.** `AuditService` con catena di hash e script `pnpm audit:verify`; `DomainEvent` e `OutboxEvent` scritti nella stessa transazione; dispatcher dell'outbox con nuovi tentativi.
10. **Parametri ed elenchi.** Servizi di lettura con storico (valore in vigore a una data); API di modifica solo per `ADMIN`, con motivo; l'interfaccia arriva in fase 7.
11. **Documenti legali.** `LegalDocument`, versioni e accettazioni; blocco all'accesso finché l'utente non accetta le versioni in vigore per il suo profilo; testi segnaposto con «[DA VALIDARE — LEGALE]»; script `pnpm legal:check` che fallisce se un testo in uso non è validato (servirà al rilascio in produzione).
12. **Frontend.** `packages/ui` con token di design e componenti base; `apps/web` e `apps/admin` con accesso, menu per ruolo dalle specifiche (pagine vuote dove la funzione arriva dopo), profilo con dati, sessioni attive e disconnessione, centro notifiche vuoto, traduzioni (`it`; `apps/admin` anche `sq`, con selettore). Pagina minima di sola lettura del registro attività in `apps/admin`.
13. **CI.** GitHub Actions su ogni pull request: installazione, lint, tipi, test unitari e di integrazione (Testcontainers), build.
14. **Documentazione.** ADR 0001 (stack e versioni scelte), ADR 0002 (autenticazione e accesso dei privati), aggiornamento di `docs/stato.md`.

## Criteri di accettazione

- [ ] Da una macchina pulita, seguendo il `README.md`, l'ambiente parte e i dati di prova si caricano con un comando ciascuno.
- [ ] La CI è verde ed è obbligatoria per unire una pull request.
- [ ] Un utente professionale non entra senza password e TOTP; al primo accesso deve configurare il TOTP.
- [ ] Un privato entra con un codice ricevuto via email o SMS, senza password.
- [ ] Le durate di sessione rispettano i parametri per privati, professionisti e personale di AstAx.
- [ ] Per ogni ruolo un test a tabella prova le azioni consentite e vietate disponibili in questa fase; un endpoint senza permesso esplicito risponde 403.
- [ ] Una chiamata senza contesto, o con il contesto di un altro utente, risponde 403. Marco Rossi passa da Agenzia Uno ad Agenzia Tre e vede solo i dati del contesto attivo.
- [ ] Un test di integrazione dimostra che, con il contesto di Agenzia Uno, una query senza filtro non restituisce righe di Agenzia Due (sicurezza a livello di riga).
- [ ] Il registro contiene le azioni protette e i 403; `UPDATE` e `DELETE` sul registro falliscono; `pnpm audit:verify` scopre una riga alterata.
- [ ] Una modifica di parametro crea una nuova versione con autore e motivo; la lettura a una data restituisce la versione giusta.
- [ ] Al primo accesso l'utente accetta i documenti segnaposto; una nuova versione ne chiede di nuovo l'accettazione; versione, data e IP sono registrati.
- [ ] Un test dimostra che il logger oscura codice fiscale, telefono, email, IBAN e importi delle offerte.
- [ ] Il lint blocca `Date.now()` e `new Date()` nel codice di dominio e i testi scritti nei componenti.

## Test richiesti

- Unità: mappa dei permessi, catena di hash, lettura dei parametri a una data, oscuramento del logger.
- Integrazione: guard e contesto, sicurezza a livello di riga, blocco del registro, accettazione dei documenti legali, inviti al team.
- End-to-end: accesso di un privato con codice; accesso di un titolare d'agenzia con TOTP; cambio di contesto di Marco Rossi.

## Demo per Dan

Accedere con alcuni utenti di prova (credenziali di sviluppo nel `README.md`): un privato, il titolare di Agenzia Uno, Marco Rossi, un operatore di back office in albanese, l'amministratore. Per ciascuno: menu corretti, profilo, sessioni. Come amministratore: registro attività con gli accessi appena fatti.
