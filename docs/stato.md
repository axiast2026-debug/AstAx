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

**2026-10-15 — fase 1, parti che non richiedono Docker.**

- Fatto (6 commit, `pnpm check` verde, 888 test):
  - passo 1: monorepo pnpm + Turborepo, `@astax/config` con TypeScript strict, ESLint e Prettier, e regole proprie che bloccano l'orologio di sistema e i testi nei componenti;
  - passo 5: porta `Clock` (`@astax/adapters/clock`), catalogo tipizzato di tutti i parametri con lettura a una data e nuova versione con autore e motivo (`@astax/shared/settings`), mappa completa dei permessi con negazione predefinita (`@astax/shared/permissions`);
  - passo 6, parte senza server: logger che oscura dati personali e importi (`@astax/shared/logging`);
  - passo 7, parte senza database: catena di hash del registro (`@astax/shared/audit`);
  - ADR 0001 (stack e versioni).
- Resta: passi 2-4 e 7-14, che richiedono Docker (ambiente locale, database, Keycloak, API, frontend, E2E, CI).
- Bloccato da: Docker Desktop non ancora installato; repository GitHub non ancora creato.
- Come provarlo: in `C:\Users\clien\Searches\astax`, `pnpm install` e poi `pnpm check`. Deve finire con «8 successful».

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
| Sicurezza a livello di riga: Agenzia Uno non vede righe di Agenzia Due | Da fare | — |
| Registro: azioni protette e 403 registrati; UPDATE/DELETE falliscono; `audit:verify` trova una riga alterata | In parte | Catena: `packages/shared/src/audit/hash-chain.test.ts`; database e comando da fare |
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
