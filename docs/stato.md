# Stato dello sviluppo

Claude Code aggiorna questo file alla fine di ogni sessione di lavoro e alla chiusura di ogni fase. Una sessione nuova parte sempre da qui.

## Fasi

| Fase | Stato | Chiusa il | Note |
| --- | --- | --- | --- |
| 1. Fondamenta | Chiusa | 2026-10-15 | Criteri soddisfatti; verifica indipendente in due giri; demo vista e chiusura confermata da Dan |
| 2. Richiesta e verifica | In verifica | | Criteri con prova; verifica indipendente in due giri, problemi corretti; manca la demo con Dan |
| 3. Motore d'asta | Da iniziare | | |
| 4. Offerte | Da iniziare | | |
| 5. Accettazione | Da iniziare | | |
| 6. Dopo l'acquisto | Da iniziare | | |
| 7. Pannelli e notifiche | Da iniziare | | |
| 8. Fornitori reali e sicurezza | Da iniziare | | |

Stati possibili: Da iniziare, In corso, In verifica (criteri controllati, in attesa della revisione di Dan), Chiusa.

## Ultima sessione

**2026-10-15/16 — fase 2, tutti i passi del piano** (piano approvato da Dan il 2026-10-15; campi del §3 confermati da Dan così come sono).

- Fatto (commit su `main`, pubblicati su GitHub; `pnpm check` verde, 32 task; test end-to-end 10 su 10):
  - regole di base: codice fiscale con omocodie, targhe, schema `quoteData` senza telefono ed email, casi esclusi, formula esperta, condizioni per l'invio, controllo automatico verde/giallo/rosso;
  - comuni ISTAT, casi esclusi e pacchetti nel database; fornitori finti (targa, lettura documenti, SMS) e storage dei file su SeaweedFS;
  - database di clienti e richieste con sicurezza a livello di riga, versioni dei dati e cronologia solo in aggiunta, dati della richiesta cifrati (ADR 0007);
  - API: bozza a sezioni, documenti con lettura automatica, invio con i controlli, consensi (codice del privato, link del broker, consenso caricato), clienti del broker, coda e scheda di verifica, correzioni con nuova versione, approvazione, integrazione, esclusione, notifiche in app ed email;
  - schermate: procedura del privato (anche su telefono, con la barra in basso), procedura del broker, clienti, pagina del consenso per il cliente del broker, centro notifiche, coda e scheda di verifica del back office in italiano e albanese.
- Problemi trovati e corretti strada facendo: gli errori del database finivano nel log con i valori della query (ora solo tipo e codice, regola 8); la ricerca del comune dal codice fiscale non funzionava (un carattere perso, ora con test); durante un'integrazione il passo «Conducenti» veniva rifiutato perché manda anche contraente e proprietario (ora accettati se identici); due test dipendevano dall'ordine di esecuzione (ora ogni file usa utenti suoi).
- Non fatto, rinviato come debito (tabella sotto): client dell'API generato da OpenAPI, TanStack Query e React Hook Form, `prompt=login`, ruoli del back office nel database, ora prevista di chiusura dell'asta nel riepilogo, anteprima delle agenzie nella scheda di verifica.
- 2026-10-16: verifica indipendente della fase 2 in due giri (sezione qui sotto), problemi corretti; test end-to-end 12 su 12.
- Prossimo passo: la demo con Dan descritta qui sotto; poi, con la sua conferma, la fase passa a «Chiusa». Domande 11 e 12 risposte da Dan il 2026-10-16 (60 secondi; un privato può chiedere un preventivo per un'altra persona, punto aggiunto per il legale).

## Criteri della fase in corso

| Criterio | Stato | Prova |
| --- | --- | --- |
| E2E: Giulia Neri completa la procedura e invia; l'operatore la trova verde, apre la scheda e approva; la cronologia mostra ogni passaggio | Fatto | `tests/e2e/specs/fase2-richieste.spec.ts` («Giulia completa la procedura…»); il privato è un indirizzo nuovo a ogni giro, con i documenti di prova di Giulia |
| E2E: Paolo Verdi crea una richiesta per Anna Riva con il link di consenso, e un'altra con il consenso caricato | Fatto | `fase2-richieste.spec.ts` («Paolo crea una richiesta per Anna Riva…», «Paolo crea un'altra richiesta caricando il consenso…»), con l'utente di prova `e2e.paolo@broker-demo.test` |
| Un caso escluso dichiarato blocca l'invio; un veicolo con più di trent'anni arriva rosso con il motivo | Fatto | E2E «un caso escluso dichiarato (taxi)…»; `apps/api/test/int/requests.int.test.ts` («ASTA-10 …», «a vehicle of more than thirty years reaches the queue RED…»); regole in `packages/shared/src/domain/quote-rules.test.ts` |
| Un documento a bassa confidenza porta la richiesta in giallo, con i campi evidenziati | Fatto | `requests.int.test.ts` («a document read with low confidence…»); nella scheda di verifica i campi sotto soglia sono in rosso |
| Integrazione chiesta → il richiedente completa → torna in coda | Fatto | E2E «integrazione: il back office chiede la patente…»; `apps/api/test/int/verification.int.test.ts` («integration: …») |
| Dopo l'invio dati non modificabili (409); correzione del back office in una nuova versione registrata | Fatto | `requests.int.test.ts` («after submission … 409»); `verification.int.test.ts` («a correction by the back office is a new recorded version…») |
| `quoteData` non contiene telefono ed email | Fatto | `quote-rules.test.ts` («VIS-01 has no place for the customer's phone or email, anywhere») |
| Codice fiscale, telefono ed email cifrati; ricerca per codice fiscale con l'indice cieco | Fatto | `packages/db/test/requests.int.test.ts` («SIC-03»); `requests.int.test.ts` («Paolo creates the customer Anna Riva…») |
| Opzioni di durata e validità dai parametri | Fatto | `requests.int.test.ts` («rule 7: auction durations…»); E2E controlla le opzioni nella schermata «L'asta» |
| Procedura del privato su mobile, da tastiera, con etichette | Fatto, con limite | Provata nel browser a 375 px: nessuno scorrimento orizzontale, barra in basso, ogni campo con etichetta, nessun id doppio, salto al contenuto. Manca un controllo automatico di accessibilità nei test (debito) |
| Ogni apertura di scheda o documento da parte del back office è registrata | Fatto | `verification.int.test.ts` («card and document openings are logged»: `QUOTE_DATA_VIEWED`, `DOCUMENT_VIEWED`) |

## Demo per Dan (fase 2)

Prima: Docker Desktop acceso; in PowerShell, nella cartella `C:\Users\clien\Searches\astax`, `pnpm infra:up`, poi una volta `pnpm install`, `pnpm db:migrate` e `pnpm db:seed` (tabelle e comuni nuovi), poi `pnpm dev`. La password dei professionisti è `DEV_USERS_PASSWORD` nel file `.env`; i codici e le email arrivano in Mailpit, http://127.0.0.1:8025. I documenti da caricare sono nella cartella `demo-documenti` (finti; vedi `demo-documenti/LEGGIMI.md`): il lettore finto sceglie i dati dal **nome del file**, quindi i nomi non vanno cambiati.

1. **Giulia chiede un preventivo dal telefono.** Sul telefono o in una finestra stretta del browser: http://localhost:3000 → «Sono un cliente privato» → `giulia.neri@example.test` → codice da Mailpit → «Nuovo preventivo».
   - Passo 1: carica un file chiamato `libretto-giulia-neri.jpg`: marca, modello e dati tecnici si compilano da soli. Scrivi la data di acquisto, scegli «Da altra compagnia» e carica `attestato-giulia-neri.pdf` (classe CU e compagnia si compilano).
   - Passo 2: carica `patente-giulia-neri.jpg`; nome, codice fiscale e residenza sono già scritti dal libretto. Data e luogo di nascita non si chiedono: vengono dal codice fiscale.
   - Passi 3-4: pacchetto, decorrenza proposta dalla scadenza attuale, durata e validità dell'asta.
   - Passo 5: «Mandami il codice», codice da Mailpit. Passo 6: «Invia la richiesta».
2. **Il back office verifica.** http://localhost:3001 → `arta.hoxha@astax.test` → «Coda verifiche»: la richiesta è verde. Apri la scheda: a sinistra i documenti con i campi letti, a destra i dati dichiarati accanto a quelli dei documenti, la checklist. Prova «Correggi i dati» (nasce la versione 2) e poi «Approva e apri l'asta». In albanese con il pulsante «Shqip».
3. **Integrazione.** Rifai il punto 1 con un'altra richiesta e, nella scheda, «Chiedi l'integrazione» (motivo, «Conducenti», «Patente»). Giulia riceve l'email e la notifica, apre la richiesta, «Completa ora», ricarica la patente e reinvia: la richiesta torna in coda con la cronologia aggiornata.
4. **Caso escluso.** Nuova richiesta, al passo 1 spunta «Taxi» negli usi particolari: al riepilogo l'invio è bloccato con il messaggio.
5. **Veicolo d'epoca.** Nuova richiesta con il libretto `libretto-epoca.jpg` (veicolo del 1990): in coda arriva rosso, con il motivo «Possibile veicolo d'epoca o storico».
6. **Broker.** In incognito, «Accesso professionisti» → `paolo.verdi@broker-demo.test` → «Nuova richiesta» → «Nuovo cliente»: Anna Riva, codice fiscale `RVINNA84L59H501Y`, un'email inventata (il codice `RVINNA85P43H501J` esiste già, creato dai test). Al passo «Conducenti» scrivi lo stesso codice fiscale nel campo del contraente: per i broker il contraente deve essere il cliente. Documenti `libretto-anna-riva.jpg`, `attestato-anna-riva.pdf`, `patente-anna-riva.jpg`. Al passo «Consenso» «Manda il link»: in Mailpit l'email per Anna; aprendo il link si vede la pagina del consenso, senza contatti; «Mandami il codice», conferma. Poi «Invia la richiesta». In «Clienti» la ricerca per codice fiscale esatto ritrova Anna.
7. **Registro.** Con `paola.ricci@astax.test` → «Registro delle attività»: aperture della scheda (`QUOTE_DATA_VIEWED`), dei documenti (`DOCUMENT_VIEWED`), correzioni, decisioni.

## Verifica indipendente (chiusura della fase 2)

Il comando `/chiudi-fase` e il sottoagente `verificatore` non si caricano nella sessione (aperta nella cartella superiore): i passi sono stati eseguiti a mano il 2026-10-16, con un revisore indipendente con le stesse istruzioni del `verificatore`.

1. Primo giro: 17 problemi. I più gravi: il codice fiscale restava in chiaro nei campi letti dai documenti; un broker poteva usare il consenso di un cliente per un contraente diverso; il codice fiscale cercato finiva nell'indirizzo della pagina; i tentativi dei codici OTP si azzeravano chiedendo un nuovo codice; le correzioni del back office saltavano i controlli dell'invio; gli accessi negati non andavano nel registro. Corretti nel commit `8cbf65f`, con test.
2. Secondo giro: 15 punti risolti, 2 debiti dichiarati (richiesta approvata ancora «In verifica», consensi e notifiche a livello di database). Nuovi problemi corretti: una correzione poteva cambiare il contraente; una richiesta in coda oltre la decorrenza non si poteva più correggere; l'approvazione automatica mandava comunque l'avviso al back office e, se falliva, dava errore al richiedente; due varchi nelle regole di riga; le ricerche restavano dopo «Esci» e passavano tra contesti; l'attesa tra due codici dipendeva dal valore attuale del parametro. Un caso di business è diventato la domanda 12.
3. `pnpm check` verde (32 task) e test end-to-end 12 su 12.

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
| Codice di accesso via SMS; SMS veri | Serve il fornitore SMS; oggi gli SMS finiscono in Mailpit | Fase 8 |
| `RuiRecord.linkedNumber` da trasformare in elenco | Un sub-agente può lavorare per più agenzie (dubbio 10) | Fasi 3-4 |
| Keycloak segnala «già autenticato come un altro utente» su un computer condiviso senza «Esci» | Sessione Keycloak rimasta nel browser; non fatto in fase 2 | Con `prompt=login` nelle app, fase 7 |
| Client dell'API generato da OpenAPI per i frontend | La descrizione OpenAPI non contiene ancora gli schemi dei corpi (gli input sono validati con Zod): un client generato oggi avrebbe solo i percorsi. I tipi delle risposte sono scritti a mano in `apps/web/src/lib/requests.ts` e `apps/admin/src/lib/verification.ts` | Fase 4, pubblicando gli schemi Zod in OpenAPI |
| TanStack Query, React Hook Form, PWA con Serwist e Web Push | I moduli della fase 2 usano le azioni del server di Next.js, che funzionano anche senza JavaScript; il controllo dei campi lo fa l'API | Fase 7 (PWA e push); da rivalutare se servono moduli più interattivi |
| Nessun controllo automatico di accessibilità nei test end-to-end | Etichette, tastiera e telefono provati a mano nel browser | Fase 7, con `@axe-core/playwright` |
| Procedura del privato a passi con più domande per schermata, non «una domanda per schermata» | Sei passi, ognuno salva una parte completa della bozza | Da rivedere con Dan dopo la demo |
| Riepilogo senza l'ora prevista di chiusura dell'asta | Serve il calendario delle ore lavorative | Fase 3 |
| Scheda di verifica senza l'anteprima delle agenzie selezionate | La selezione delle agenzie nasce in fase 3 | Fase 3 |
| Correzione del back office su un gruppo di campi (veicolo, classe CU, compagnia, scadenza) | Gli altri dati si correggono chiedendo un'integrazione | Fase 7, con una scheda di correzione completa |
| Motivi di esclusione solo dall'elenco dei casi esclusi | Nessun «altro» con testo libero | Da decidere con Dan |
| Revoca del consenso (seconda parte di LEG-04) | Senza aste non ha ancora effetto | Fase 3, prima di aprire le aste |
| Procedura con al massimo due conducenti | Bastano per i casi del pilota | Quando serve |
| Archivio documenti del privato: una chiamata all'API per ogni richiesta | Pochi preventivi per persona | Quando cresce, con un endpoint unico |
| Caricamento in blocco da CSV per i broker | Non era nel piano della fase 2 | Fase 7 |
| Dashboard del broker con i contatori | Non era nel piano della fase 2 | Fase 7 |
| Sicurezza a livello di riga: il richiedente può ancora creare un proprio consenso e chiunque può creare notifiche per altri utenti, a livello di database | La prima linea (API) lo impedisce; servono funzioni del database dedicate | Fase 3 |
| Una richiesta approvata resta nello stato «In verifica» (con la decisione «Approvata») | La fase 3 la porta ad «Asta aperta» | Fase 3 |
| Approvazione automatica (`verification.autoApproveGreen`, spenta nel pilota) in una transazione separata dopo l'invio | Serve il ruolo di sistema; se fallisce la richiesta va al back office con la notifica | Fase 3, nel worker |
| Ricerche (codice fiscale, targa) tenute in chiaro sul server (Redis) per 15 minuti accanto alla sessione, legate al contesto attivo e cancellate con «Esci» | Non devono finire nell'indirizzo della pagina (regola 8) | Fase 8, cifrandole con la chiave dei campi |
| Guscio delle schermate duplicato tra `apps/web` e `apps/admin` | Piccole differenze (contesto, lingua) | Quando cresce, in `packages/ui` |
| Tentativi di accesso con token non validi solo nel log (non nel registro), senza limite di frequenza; nessun limite di frequenza sulla pagina pubblica del consenso | Non riempire il registro a catena (dubbio 6); i codici hanno comunque un massimo di tentativi | Fase 8, con il limite di frequenza |
| Dispatcher dell'outbox nell'API, senza destinatari; gli eventi delle richieste (`RequestSubmitted`, `RequestApproved`…) restano in coda, e il test del team controlla solo i propri | Notifiche e workflow non esistono ancora | Fase 3 (passa al worker) |
| Eccezione alla regola pnpm sull'età minima dei pacchetti per Next.js 16.4.1 e React 19.3.1 | Correggono vulnerabilità critiche | Da togliere appena superano l'età minima |
| Testi in albanese del back office da far rileggere a un madrelingua | Tradotti da Claude (anche quelli nuovi della verifica) | Fase 7 |
| Sicurezza a livello di riga: tutto il back office è «privilegiato» (anche contabilità e assistenza possono scrivere parametri e utenti a livello di database); il registro della propria organizzazione è leggibile da ogni membro | La prima linea (API) distingue i ruoli; il database non conosce ancora il ruolo del back office; non fatto in fase 2 | Fase 3, aggiungendo il ruolo alle variabili di contesto |
| Blocco dei tentativi di accesso in Keycloak (10 errori, attesa massima 15 minuti) scritto nel file del realm | Valori tecnici di sicurezza, non di business; da decidere se diventano parametri | Fase 8 |
| Codici via email: al massimo 3 per tentativo di accesso (numero fisso nell'estensione); nessun limite per indirizzo o per rete | Il limite vero di frequenza serve con i fornitori reali | Fase 8 |
| Accessi registrati dalle app web (`POST /me/logins`), non da un evento di Keycloak | Un accesso fatto fuori dalle nostre app non lascerebbe traccia; oggi le uniche app sono le nostre | Fase 8, con gli eventi di Keycloak verso il registro |
| IP vero del browser solo dietro il nostro proxy (`WEB_TRUSTED_PROXY`); in locale si registra l'indirizzo dell'app web | L'intestazione X-Forwarded-For può essere falsificata dal browser | Fase 8, con il proxy in cloud |
| Comuni soppressi non presenti in `seed/comuni.csv` (solo i comuni attuali) | Il codice fiscale di chi è nato in un comune poi soppresso non trova il comune: la procedura chiede di scrivere all'assistenza, il controllo automatico non confronta il luogo | Fase 8, con l'elenco ISTAT dei comuni soppressi |
| Etichetta della formula esperta in `seed/elenchi.json` con «26 anni» scritto nel testo | La schermata mostra anche l'età minima presa dal parametro, ma l'etichetta dell'elenco va aggiornata a mano se cambia | Fase 7, con l'amministrazione degli elenchi |
| `S3_REGION` e `S3_BUCKET` nuovi in `.env.example` | `pnpm env:init` non riscrive un `.env` esistente: l'API usa valori predefiniti se mancano | — |
| `pnpm db:reset` mai provato da Claude | Prisma chiede il consenso esplicito di Dan quando lo lancia un agente AI | Alla prima occasione, con il consenso di Dan |

## Decisioni (ADR)

| Numero | Titolo | Data |
| --- | --- | --- |
| 0001 | [Stack e versioni](adr/0001-stack-e-versioni.md) | 2026-10-15 |
| 0002 | [Autenticazione e accesso dei privati](adr/0002-autenticazione-e-accesso-privati.md) | 2026-10-15 |
| 0003 | [Storage S3 locale: SeaweedFS invece di MinIO](adr/0003-storage-s3-locale.md) | 2026-10-15 |
| 0004 | [Accesso dalle app web: token solo sul server](adr/0004-accesso-dalle-app-web.md) | 2026-10-15 |
| 0007 | [Dati della richiesta cifrati, bozza a sezioni, proprietà delle righe](adr/0007-dati-della-richiesta-cifrati.md) | 2026-10-15 |
