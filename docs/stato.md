# Stato dello sviluppo

Claude Code aggiorna questo file alla fine di ogni sessione di lavoro e alla chiusura di ogni fase. Una sessione nuova parte sempre da qui.

## Fasi

| Fase | Stato | Chiusa il | Note |
| --- | --- | --- | --- |
| 1. Fondamenta | Chiusa | 2026-10-15 | Criteri soddisfatti; verifica indipendente in due giri; demo vista e chiusura confermata da Dan |
| 2. Richiesta e verifica | In corso | | Piano approvato da Dan il 2026-10-15 |
| 3. Motore d'asta | Da iniziare | | |
| 4. Offerte | Da iniziare | | |
| 5. Accettazione | Da iniziare | | |
| 6. Dopo l'acquisto | Da iniziare | | |
| 7. Pannelli e notifiche | Da iniziare | | |
| 8. Fornitori reali e sicurezza | Da iniziare | | |

Stati possibili: Da iniziare, In corso, In verifica (criteri controllati, in attesa della revisione di Dan), Chiusa.

## Ultima sessione

**2026-10-15 — fase 2, passi 1-3 di 13** (piano approvato da Dan il 2026-10-15).

- Fatto (commit su `main`, pubblicati su GitHub; `pnpm check` verde, 32 task):
  - regole di base in `packages/shared`: codice fiscale con omocodie, targhe, schema `quoteData` senza telefono ed email, casi esclusi, formula esperta, condizioni per l'invio, documenti richiesti, colonne derivate, controllo automatico verde/giallo/rosso;
  - due parametri nuovi: `vehicle.vintageAgeYears` (30) e `consent.linkValidityDays` (7), dalle risposte di Dan alle domande 6 e 7;
  - elenco dei comuni ISTAT (7.896, con codice catastale) in `seed/comuni.csv`, rigenerabile con `pnpm reference:municipalities`; tabelle dei comuni, dei casi esclusi e dei pacchetti nel database, caricate da `pnpm db:seed`;
  - fornitori finti: ricerca per targa, lettura documenti con esempi inventati (anche a bassa confidenza), storage dei file su SeaweedFS, SMS che finiscono in Mailpit.
- Prossimo passo: il 4, il database delle richieste. **Serve prima la revisione di Dan dei campi del preventivo** (tabella §3 di `docs/specifiche/09-decisioni-e-valori-predefiniti.md`).
- Da provare adesso: niente di visibile nelle app; `pnpm db:seed` mostra `municipalities: 7896`.

## Criteri della fase in corso

| Criterio | Stato | Prova |
| --- | --- | --- |
| E2E: Giulia Neri completa la procedura e invia; l'operatore la trova verde, apre la scheda e approva; la cronologia mostra ogni passaggio | Da fare | |
| E2E: Paolo Verdi crea una richiesta per Anna Riva con il link di consenso, e un'altra con il consenso caricato | Da fare | |
| Un caso escluso dichiarato blocca l'invio; un veicolo con più di trent'anni arriva rosso con il motivo | In parte | Regole: `packages/shared/src/domain/quote-rules.test.ts` («ASTA-10 …», «is RED with the reason …»); manca il percorso nelle app |
| Un documento a bassa confidenza porta la richiesta in giallo, con i campi evidenziati | In parte | Regola: `quote-rules.test.ts` («is YELLOW for fields read below …»); lettore finto: `packages/adapters/src/document-reader/document-reader.test.ts` |
| Integrazione chiesta → il richiedente completa → torna in coda | Da fare | |
| Dopo l'invio dati non modificabili (409); correzione del back office in una nuova versione registrata | Da fare | |
| `quoteData` non contiene telefono ed email | Fatto | `quote-rules.test.ts` («VIS-01 has no place for the customer's phone or email, anywhere») |
| Codice fiscale, telefono ed email cifrati; ricerca per codice fiscale con l'indice cieco | Da fare | |
| Opzioni di durata e validità dai parametri | In parte | `quote-rules.test.ts` («rule 7: duration and validity …»); mancano le schermate |
| Procedura del privato su mobile, da tastiera, con etichette | Da fare | |
| Ogni apertura di scheda o documento da parte del back office è registrata | Da fare | |

## Verifica indipendente (chiusura della fase 1)

Il comando `/chiudi-fase` non era caricato nella sessione (aperta nella cartella superiore): i suoi passi sono stati eseguiti a mano il 2026-10-15.

1. `pnpm check` (31 task) e test end-to-end (5 su 5) verdi; CI verde su GitHub.
2. Primo giro del revisore indipendente: 15 problemi. Corretti nel commit `2fdbec1`. I più importanti: un indirizzo poteva essere «prenotato» come privato bloccando un invito; testi legali nuovi senza il marchio; parametri modificabili nel passato; accessi non registrati.
3. Secondo giro: 12 punti risolti, 2 rinviati come debiti (isolamento dei dati per contesto nelle schermate, ruoli del back office nella sicurezza a livello di riga), 1 risolto in parte. Due problemi nuovi corretti nel commit successivo: l'IP del browser poteva essere falsificato (ora si usa solo dietro un proxy di fiducia) e l'ADR 0002 non era aggiornato. Nuova domanda per Dan: la 5 in `domande-aperte.md`.
4. Restano come debiti tecnici, nella tabella qui sotto, i punti rinviati dal revisore.

## Demo per Dan (fase 1)

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
| Sicurezza a livello di riga: tutto il back office è «privilegiato» (anche contabilità e assistenza possono scrivere parametri e utenti a livello di database); il registro della propria organizzazione è leggibile da ogni membro | La prima linea (API) distingue i ruoli; il database non conosce ancora il ruolo del back office né il titolare | Fase 2, aggiungendo il ruolo alle variabili di contesto |
| Blocco dei tentativi di accesso in Keycloak (10 errori, attesa massima 15 minuti) scritto nel file del realm | Valori tecnici di sicurezza, non di business; da decidere se diventano parametri | Fase 8 |
| Codici via email: al massimo 3 per tentativo di accesso (numero fisso nell'estensione); nessun limite per indirizzo o per rete | Il limite vero di frequenza serve con i fornitori reali | Fase 8 |
| Accessi registrati dalle app web (`POST /me/logins`), non da un evento di Keycloak | Un accesso fatto fuori dalle nostre app non lascerebbe traccia; oggi le uniche app sono le nostre | Fase 8, con gli eventi di Keycloak verso il registro |
| IP vero del browser solo dietro il nostro proxy (`WEB_TRUSTED_PROXY`); in locale si registra l'indirizzo dell'app web | L'intestazione X-Forwarded-For può essere falsificata dal browser | Fase 8, con il proxy in cloud |
| Isolamento dei dati per contesto provato dal database, non ancora da schermate con dati delle organizzazioni | In fase 1 non esistono ancora schermate di questo tipo | Fase 2, con le prime richieste |
| Comuni soppressi non presenti in `seed/comuni.csv` (solo i comuni attuali) | Il codice fiscale di chi è nato in un comune poi soppresso non trova il comune: il luogo di nascita non viene confrontato (nessun falso rosso) | Fase 8, con l'elenco ISTAT dei comuni soppressi |
| Etichetta della formula esperta in `seed/elenchi.json` con «26 anni» scritto nel testo | Se cambia `drivingFormula.expertMinAge` il testo va aggiornato a mano | Fase 2, quando le schermate useranno l'elenco |
| `S3_REGION` e `S3_BUCKET` nuovi in `.env.example` | `pnpm env:init` non riscrive un `.env` esistente: l'API usa valori predefiniti se mancano | — |
| `pnpm db:reset` mai provato da Claude | Prisma chiede il consenso esplicito di Dan quando lo lancia un agente AI | Alla prima occasione, con il consenso di Dan |

## Decisioni (ADR)

| Numero | Titolo | Data |
| --- | --- | --- |
| 0001 | [Stack e versioni](adr/0001-stack-e-versioni.md) | 2026-10-15 |
| 0002 | [Autenticazione e accesso dei privati](adr/0002-autenticazione-e-accesso-privati.md) | 2026-10-15 |
| 0003 | [Storage S3 locale: SeaweedFS invece di MinIO](adr/0003-storage-s3-locale.md) | 2026-10-15 |
| 0004 | [Accesso dalle app web: token solo sul server](adr/0004-accesso-dalle-app-web.md) | 2026-10-15 |
