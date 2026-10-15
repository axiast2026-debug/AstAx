# Stato dello sviluppo

Claude Code aggiorna questo file alla fine di ogni sessione di lavoro e alla chiusura di ogni fase. Una sessione nuova parte sempre da qui.

## Fasi

| Fase | Stato | Chiusa il | Note |
| --- | --- | --- | --- |
| 1. Fondamenta | In corso | | Tutti i passi fatti; demo provata da Dan il 2026-10-15 con esito positivo. CI verde e obbligatoria su GitHub; manca `/chiudi-fase 1` |
| 2. Richiesta e verifica | Da iniziare | | |
| 3. Motore d'asta | Da iniziare | | |
| 4. Offerte | Da iniziare | | |
| 5. Accettazione | Da iniziare | | |
| 6. Dopo l'acquisto | Da iniziare | | |
| 7. Pannelli e notifiche | Da iniziare | | |
| 8. Fornitori reali e sicurezza | Da iniziare | | |

Stati possibili: Da iniziare, In corso, In verifica (criteri controllati, in attesa della revisione di Dan), Chiusa.

## Ultima sessione

**2026-10-15 — fase 1, passi da 1 a 14.**

- Fatto (commit locali, nessun push; `pnpm check` verde con 1.220 test; 4 test end-to-end verdi):
  - ambiente locale con Docker; database con sicurezza a livello di riga, registro immutabile con catena di hash, eventi di dominio e outbox con nuovi tentativi;
  - seed dei parametri, degli elenchi, delle festività, dei testi legali segnaposto e dei dati sintetici degli scenari, con un comando (`pnpm db:seed`);
  - Keycloak con estensione «codice via email» per i privati e password più TOTP obbligatorio per professionisti e personale, durate di sessione dai parametri (ADR 0002);
  - API: guardia unica (token, tipo di utente, contesto, permesso, testi legali), profilo e sessioni, team, parametri con storico, testi legali, registro;
  - sito e back office in Next.js: accesso, menu per ruolo, selettore di contesto, profilo con sessioni, centro notifiche vuoto, back office in italiano e albanese, pagina del registro (ADR 0004);
  - CI di GitHub Actions scritta (non ancora eseguita);
  - ADR 0001-0004.
- Demo: Dan l'ha provata il 2026-10-15 (privato con codice, titolare con TOTP, Marco Rossi con due agenzie, back office in albanese, registro): tutto funzionante.
- Resta per chiudere la fase: creare il repository GitHub, far girare la CI e renderla obbligatoria; poi `/chiudi-fase 1` (verifica indipendente e demo).
- Incidente di questa sessione: un comando scritto male ha eseguito per errore alcuni comandi di sviluppo (build, migrazioni, seed, sincronizzazione Keycloak, `pnpm dev`). Erano tutti ripetibili; servizi, volumi Docker e `.env` sono intatti. Il comando che cancella i dati locali non è partito.

## Criteri della fase in corso

| Criterio | Stato | Prova |
| --- | --- | --- |
| Da una macchina pulita, seguendo il README, ambiente e dati di prova partono con un comando ciascuno | Fatto | `README.md`: `pnpm infra:up` e `pnpm db:seed`; provato su questo computer, non ancora su un computer nuovo |
| CI verde e obbligatoria per unire una pull request | Fatto | CI verde su GitHub (esecuzione 38727751445: check ed e2e); ruleset su `main` con i controlli obbligatori `check` ed `e2e`, impostato da Dan il 2026-10-15 |
| Utente professionale: password e TOTP, TOTP configurato al primo accesso | Fatto | `tests/e2e/specs/fase1-accessi.spec.ts` (titolare, amministratore); flusso `astax-professional-browser` in `infra/keycloak/import/realm-astax.json` |
| Privato: accesso con codice via email o SMS | Fatto (email) | `tests/e2e/specs/fase1-accessi.spec.ts` (privato); SMS con il fornitore in fase 8 |
| Durate di sessione dai parametri per privati, professionisti, personale AstAx | Fatto | `packages/adapters/src/identity/session-settings.test.ts`; `apps/api/test/int/settings.int.test.ts` («SIC-05 a session parameter is applied to Keycloak») |
| Test a tabella dei permessi per ogni ruolo; endpoint senza permesso → 403 | Fatto | `packages/shared/src/permissions/can.test.ts`; `apps/api/test/int/permissions.int.test.ts` (via HTTP); `apps/api/test/auth-guard.test.ts` |
| Senza contesto o con contesto altrui → 403; Marco Rossi cambia contesto | Fatto | `apps/api/test/int/auth.int.test.ts`; `tests/e2e/specs/fase1-accessi.spec.ts` |
| Sicurezza a livello di riga: Agenzia Uno non vede righe di Agenzia Due | Fatto | `packages/db/test/rls.int.test.ts` |
| Registro: azioni protette e 403 registrati; UPDATE/DELETE falliscono; `audit:verify` trova una riga alterata | Fatto | `packages/db/test/audit.int.test.ts`; `apps/api/test/int/auth.int.test.ts`; `pnpm audit:verify` |
| Modifica di parametro → nuova versione con autore e motivo; lettura a una data | Fatto | `apps/api/test/int/settings.int.test.ts`; `packages/shared/src/settings/settings.test.ts` |
| Documenti legali: accettazione al primo accesso e a ogni nuova versione, con versione, data e IP | Fatto | `apps/api/test/int/auth.int.test.ts` («LEG-01 LEG-02 …»); `tests/e2e/specs/fase1-accessi.spec.ts` |
| Il logger oscura codice fiscale, telefono, email, IBAN e importi delle offerte | Fatto | `packages/shared/src/logging/logger.test.ts` |
| Il lint blocca `Date.now()`/`new Date()` nel dominio e i testi nei componenti | Fatto | `packages/config/src/eslint/rules.test.js` |

## Demo per Dan

Prima: Docker Desktop acceso; in PowerShell, nella cartella `C:\Users\clien\Searches\astax`, `pnpm infra:up`, poi `pnpm dev` (lasciare la finestra aperta). Sul telefono un'app di autenticazione (Google Authenticator, Microsoft Authenticator o FreeOTP). La password dei professionisti è `DEV_USERS_PASSWORD` nel file `.env`. Per i privati il codice arriva in Mailpit, http://127.0.0.1:8025.

1. **Privato.** http://localhost:3000 → «Sono un cliente privato» → `giulia.neri@example.test` → codice da Mailpit. Si accettano i testi segnaposto; menu del privato; Profilo con dati e accessi attivi.
2. **Titolare di Agenzia Uno.** In una finestra in incognito, http://localhost:3000 → «Accesso professionisti» → `anna.moretti@agenzia-uno.test` e password. Al primo accesso Keycloak chiede di inquadrare il QR code con l'app. Menu completo dell'agenzia, con Team e Contabilità.
3. **Marco Rossi.** Nuova finestra in incognito, `marco.rossi@collaboratori.test`. Si sceglie Agenzia Uno, poi «Cambia» → Agenzia Tre. Menu da sub-agente, senza Team.
4. **Back office in albanese.** http://localhost:3001 → `arta.hoxha@astax.test` → pulsante «Shqip» in alto.
5. **Amministratore.** http://localhost:3001 → `paola.ricci@astax.test` → «Registro delle attività»: si vedono gli accessi e le accettazioni appena fatte.
6. **Controllo del registro.** In PowerShell: `pnpm audit:verify` → «Audit log intact».

## Debiti tecnici

| Debito | Perché | Quando chiuderlo |
| --- | --- | --- |
| TypeScript 6.0 invece di 7.0 | typescript-eslint non supporta ancora la 7 | Quando esce il supporto |
| Copie del registro in un archivio non modificabile (S3 Object Lock) | Serve l'infrastruttura AWS | Fase 8 |
| Codice di accesso via SMS | Serve il fornitore SMS | Fase 8 |
| `RuiRecord.linkedNumber` da trasformare in elenco | Un sub-agente può lavorare per più agenzie (dubbio 10) | Fasi 3-4 |
| Keycloak segnala «già autenticato come un altro utente» su un computer condiviso senza «Esci» | Sessione Keycloak rimasta nel browser | Con `prompt=login` nelle app, fase 2 |
| Client dell'API generato da OpenAPI per i frontend | In fase 1 le poche chiamate sono scritte a mano | Fase 2 |
| TanStack Query, React Hook Form, PWA con Serwist e Web Push | Servono con i primi moduli e le notifiche | Fasi 2 e 7 |
| Guscio delle schermate duplicato tra `apps/web` e `apps/admin` | Piccole differenze (contesto, lingua) | Quando cresce, in `packages/ui` |
| Tentativi di accesso con token non validi solo nel log (non nel registro), senza limite di frequenza | Non riempire il registro a catena (dubbio 6) | Fase 8, con il limite di frequenza |
| Dispatcher dell'outbox nell'API, senza destinatari | Notifiche e workflow non esistono ancora | Fase 3 (passa al worker) |
| Eccezione alla regola pnpm sull'età minima dei pacchetti per Next.js 16.4.1 e React 19.3.1 | Correggono vulnerabilità critiche | Da togliere appena superano l'età minima |
| Testi in albanese del back office da far rileggere a un madrelingua | Tradotti da Claude | Fase 7 |
| `pnpm db:reset` mai provato da Claude | Prisma chiede il consenso esplicito di Dan quando lo lancia un agente AI | Alla prima occasione, con il consenso di Dan |

## Decisioni (ADR)

| Numero | Titolo | Data |
| --- | --- | --- |
| 0001 | [Stack e versioni](adr/0001-stack-e-versioni.md) | 2026-10-15 |
| 0002 | [Autenticazione e accesso dei privati](adr/0002-autenticazione-e-accesso-privati.md) | 2026-10-15 |
| 0003 | [Storage S3 locale: SeaweedFS invece di MinIO](adr/0003-storage-s3-locale.md) | 2026-10-15 |
| 0004 | [Accesso dalle app web: token solo sul server](adr/0004-accesso-dalle-app-web.md) | 2026-10-15 |
