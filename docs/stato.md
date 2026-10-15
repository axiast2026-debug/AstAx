# Stato dello sviluppo

Claude Code aggiorna questo file alla fine di ogni sessione di lavoro e alla chiusura di ogni fase. Una sessione nuova parte sempre da qui.

## Fasi

| Fase | Stato | Chiusa il | Note |
| --- | --- | --- | --- |
| 1. Fondamenta | In corso | | Piano approvato da Dan il 2026-10-15, con le proposte sui 10 dubbi |
| 2. Richiesta e verifica | Da iniziare | | |
| 3. Motore d'asta | Da iniziare | | |
| 4. Offerte | Da iniziare | | |
| 5. Accettazione | Da iniziare | | |
| 6. Dopo l'acquisto | Da iniziare | | |
| 7. Pannelli e notifiche | Da iniziare | | |
| 8. Fornitori reali e sicurezza | Da iniziare | | |

Stati possibili: Da iniziare, In corso, In verifica (criteri controllati, in attesa della revisione di Dan), Chiusa.

## Ultima sessione

**2026-10-15 — fase 1, passi 1, 2, 3 e parti dei passi 5-7.**

- Fatto (10 commit, `pnpm check` verde, 908 test):
  - passo 1: monorepo pnpm + Turborepo, `@astax/config` con TypeScript strict, ESLint e Prettier, e regole proprie che bloccano l'orologio di sistema e i testi nei componenti;
  - passo 2: ambiente locale con Docker (`pnpm env:init`, `pnpm infra:up`): PostgreSQL, Redis, Keycloak, Temporal, storage S3 SeaweedFS (ADR 0003, al posto di MinIO), Mailpit; README con i passi da una macchina pulita;
  - passo 3: `@astax/db` con Prisma 7.10, entità «Identità e organizzazioni», sicurezza a livello di riga, registro che rifiuta UPDATE/DELETE/TRUNCATE anche al proprietario dello schema, `pnpm audit:verify`; test di integrazione su PostgreSQL vero (Testcontainers);
  - passo 5: porta `Clock`, catalogo dei parametri con lettura a una data, mappa completa dei permessi con negazione predefinita;
  - passo 6, parte senza server: logger che oscura dati personali e importi;
  - passo 7, parte senza API: catena di hash, scrittura nel registro con blocco contro le scritture concorrenti;
  - ADR 0001 (stack e versioni), ADR 0003 (storage S3 locale).
- Resta: passo 4 (seed e dati sintetici), passi 6-14 (API, Keycloak, permessi nell'API, team, parametri e documenti legali via API, frontend, E2E, CI).
- In attesa: repository GitHub (serve per la CI, passo 13).
- Come provarlo, in `C:\Users\clien\Searches\astax`, da PowerShell (Docker Desktop acceso):
  1. `pnpm install`
  2. `pnpm infra:up` → tutti i servizi «Healthy»
  3. `pnpm db:migrate` → «All migrations have been successfully applied»
  4. `pnpm check` → «12 successful»
  5. `pnpm audit:verify` → «Audit log intact»
  6. Mailpit su http://127.0.0.1:8025 e Temporal su http://127.0.0.1:8233 si aprono nel browser.
- Nota tecnica: Docker è installato nella cartella dell'utente; la shell Bash di Claude Code non lo vede nel PATH, PowerShell sì. I test di integrazione vanno lanciati da PowerShell.

## Criteri della fase in corso

| Criterio | Stato | Prova |
| --- | --- | --- |
| Da una macchina pulita, seguendo il README, ambiente e dati di prova partono con un comando ciascuno | Da fare | — |
| CI verde e obbligatoria per unire una pull request | Da fare | — |
| Utente professionale: password e TOTP, TOTP configurato al primo accesso | Da fare | — |
| Privato: accesso con codice via email o SMS | Da fare | — |
| Durate di sessione dai parametri per privati, professionisti, personale AstAx | Da fare | Parametri `session.*` validati in `packages/shared/src/settings` |
| Test a tabella dei permessi per ogni ruolo; endpoint senza permesso → 403 | In parte | Mappa: `packages/shared/src/permissions/can.test.ts`; guard dell'API da fare |
| Senza contesto o con contesto altrui → 403; Marco Rossi cambia contesto | Da fare | — |
| Sicurezza a livello di riga: Agenzia Uno non vede righe di Agenzia Due | Fatto | `packages/db/test/rls.int.test.ts` |
| Registro: azioni protette e 403 registrati; UPDATE/DELETE falliscono; `audit:verify` trova una riga alterata | In parte | `packages/db/test/audit.int.test.ts` (UPDATE/DELETE, riga alterata), `pnpm audit:verify`; registrazione delle azioni e dei 403 dall'API da fare |
| Modifica di parametro → nuova versione con autore e motivo; lettura a una data | In parte | Logica: `packages/shared/src/settings/settings.test.ts`; API da fare |
| Documenti legali: accettazione al primo accesso e a ogni nuova versione, con versione, data e IP | Da fare | — |
| Il logger oscura codice fiscale, telefono, email, IBAN e importi delle offerte | Fatto | `packages/shared/src/logging/logger.test.ts` |
| Il lint blocca `Date.now()`/`new Date()` nel dominio e i testi nei componenti | Fatto | `packages/config/src/eslint/rules.test.js` |

## Debiti tecnici

| Debito | Perché | Quando chiuderlo |
| --- | --- | --- |
| TypeScript 6.0 invece di 7.0 | typescript-eslint non supporta ancora la 7 | Quando esce il supporto |
| Copie del registro in un archivio non modificabile (S3 Object Lock) | Serve l'infrastruttura AWS | Fase 8 |
| `RuiRecord.linkedNumber` da trasformare in elenco | Un sub-agente può lavorare per più agenzie (dubbio 10) | Fasi 3-4 |

## Decisioni (ADR)

| Numero | Titolo | Data |
| --- | --- | --- |
| 0001 | [Stack e versioni](adr/0001-stack-e-versioni.md) | 2026-10-15 |
| 0003 | [Storage S3 locale: SeaweedFS invece di MinIO](adr/0003-storage-s3-locale.md) | 2026-10-15 |
