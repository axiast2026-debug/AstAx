# Stato dello sviluppo

Claude Code aggiorna questo file alla fine di ogni sessione di lavoro e alla chiusura di ogni fase. Una sessione nuova parte sempre da qui.

## Fasi

| Fase | Stato | Chiusa il | Note |
| --- | --- | --- | --- |
| 1. Fondamenta | Chiusa | 2026-10-15 | Criteri soddisfatti; verifica indipendente in due giri; demo vista e chiusura confermata da Dan |
| 2. Richiesta e verifica | In verifica | | Criteri con prova; verifica indipendente in due giri, problemi corretti; CI verde. Demo provata da Dan il 2026-10-16: «tante cose non tornano», da riprendere in seguito; non chiusa |
| 3. Motore d'asta | In verifica | | Criteri con prova; verifica indipendente in tre giri, problemi corretti; manca la demo con Dan |
| 4. Offerte | In verifica | | Tutti i passi fatti; verifica indipendente (primo giro) con i problemi corretti; manca la demo con Dan |
| 5. Accettazione | Da iniziare | | |
| 6. Dopo l'acquisto | Da iniziare | | |
| 7. Pannelli e notifiche | Da iniziare | | |
| 8. Fornitori reali e sicurezza | Da iniziare | | |

Stati possibili: Da iniziare, In corso, In verifica (criteri controllati, in attesa della revisione di Dan), Chiusa.

## Ultima sessione

**2026-10-16 — fase 3, tutti i passi del piano** (piano approvato da Dan il 2026-10-16, con le proposte A-G; la fase 2 resta aperta con i problemi della demo da raccogliere con Dan).

- Fatto (commit su `main`, pubblicati su GitHub; `pnpm check` verde, 36 task; test end-to-end 14 su 14 in locale):
  - prima delle aste: revoca del consenso (dal profilo del privato e dalla scheda cliente del broker; dopo la revoca il back office non può approvare e il worker non apre aste); nel database il ruolo dell'utenza, consensi creati solo dall'API e modificabili solo per revocarli, notifiche ad altri utenti solo dal servizio delle notifiche;
  - dominio: calendario lavorativo con festivi e ora legale, tempi dell'asta, garanzia minima, ordine delle offerte e migliore per compagnia, coperture contro il pacchetto, filtri e scelta delle agenzie, contenuto dell'offerta e filtro delle note, stati della richiesta e dell'offerta confrontati con i diagrammi;
  - dati: compagnie inventate, mandati, prodotti, filtri e capacità delle Agenzie Uno-Dieci; aste, inviti, prese in carico, offerte sigillate, classifiche; regole del database per la busta chiusa;
  - busta chiusa con libsodium e KMS finto con due chiavi separate (ADR 0005), registro delle chiavi in `KmsEvent`;
  - worker delle aste con Temporal (ADR 0008): apertura, rabbocco, promemoria, chiusura, riapertura dell'asta deserta, garanzie e «Scaduta», azioni del back office;
  - API delle offerte (presa in carico, invio, modifica, ritiro, rinuncia, copia per l'agenzia) e rifiuto con registrazione per ogni altro ruolo;
  - schermate: anteprima delle agenzie nella scheda di verifica, pagina «Aste» del back office in tempo reale, riquadro «Asta» del richiedente con conto alla rovescia e poi le migliori offerte per compagnia, ora prevista di chiusura nel riepilogo;
  - tempo reale con Socket.IO e biglietto monouso; strumenti di sviluppo nella pagina «Aste».
- Problemi trovati e corretti strada facendo:
  - il pulsante «Escludi» dell'anteprima aveva lo stesso nome di quello che esclude la richiesta: la CI falliva dal commit dell'anteprima; ora è «Escludi l'agenzia»;
  - un errore del database in un'attività del worker finiva nei log di Temporal con il messaggio completo: ora esce solo con tipo e codice (BC-07);
  - nel database di sviluppo mancava una migrazione e la chiusura si bloccava: rilanciato `pnpm db:migrate` (la CI parte sempre da un database nuovo).
- 2026-10-16: verifica indipendente della fase 3 (primo giro): 17 problemi, tutti corretti tranne quelli rinviati come debito (sezione «Verifica indipendente (fase 3)»).
- Domande nuove per Dan: 13 (stato della richiesta quando il back office annulla un'asta) 14 (ora del promemoria GAR-05) e 15 (prezzi e targa nelle notifiche), in `docs/domande-aperte.md`, con il valore prudente usato intanto.
- 2026-10-16: Dan risponde dopo alle domande e alle demo; ha chiesto di passare alla fase 4 e ne ha approvato il piano (proposte A-G).
- Prossimo passo: fase 4, passo 1; la demo della fase 3 con Dan quando vuole; poi i problemi della demo della fase 2, quando Dan li indica.

**2026-10-16 — fase 4, passi 1-3** (piano approvato da Dan il 2026-10-16).

- Fatto: API dell'area agenzia (cruscotto, «Richieste in arrivo» con filtri, dettaglio senza contatti e con l'apertura registrata, documenti sempre in PDF con filigrana, affidamento della presa in carico, «Le mie offerte»); avviso sulle coperture sotto il pacchetto all'invio dell'offerta; schermate del sito: cruscotto dell'agenzia in home, «Richieste in arrivo», dettaglio con presa in carico, rilascio, affidamento, rinuncia con motivo e modulo d'offerta (premio, compagnia e prodotto dei mandati, coperture voce per voce con quello che chiede il pacchetto, data di garanzia, PDF, note, conferma del vincolo), modifica e ritiro, «Le mie offerte» con le viste per stato e le offerte aperte.
- Prova: E2E `tests/e2e/specs/fase4-agenzia.spec.ts` (l'agenzia trova la richiesta, la prende in carico e invia l'offerta, che resta sigillata); `apps/api/test/int/agency.int.test.ts`.
- Nota: dopo una modifica a `packages/ui` serve `pnpm --filter @astax/ui build` perché il sito veda i menu nuovi (`pnpm dev` non ricompila i pacchetti).
- Debito: le pagine dell'agenzia non si aggiornano in tempo reale (il conto alla rovescia sì; un prolungamento si vede ricaricando la pagina).
- Prossimo passo: fase 4, passo 4 (filtri e capacità, prodotti, team, registro accessi per il titolare).

**2026-10-16 — fase 4, passo 4.**

- Fatto: API e schermate di «Filtri e capacità» (filtri dell'agenzia solo con compagnie a mandato verificato; capacità giornaliera, orari di ricezione, pausa, distribuzione; filtri personali che possono solo restringere quelli dell'agenzia, VIS-06), «Agenzia» con le compagnie mandanti e la libreria prodotti con DIP, DIP aggiuntivo e condizioni in PDF (decisione 17; il documento precedente resta come storico), «Team» con ruolo, numero RUI, permessi, stato, ultimo accesso, invito, sospensione e rimozione, e il registro degli accessi per il titolare (VIS-08; anche la lettura del registro è registrata).
- Database: migrazione `20261018080000_product_documents` (tipi di documento del set informativo e collegamento al prodotto).
- Prova: `apps/api/test/int/agency-settings.int.test.ts` (7 test).
- Nota: la pausa finisce alle 23:59 ora invernale del giorno scelto, cioè d'estate alle 00:59 del giorno dopo: un'ora in più, mai in meno.
- Prossimo passo: fase 4, passo 5 (sub-agente).

**2026-10-16 — fase 4, passo 5 (sub-agente).**

- Fatto: selettore delle agenzie nella barra in alto, anche da telefono (spec 05 «Più agenzie»); in «Richieste in arrivo» la riga dice «Hai già preso in carico questa richiesta per Agenzia Uno» o «Hai già offerto per Agenzia Uno» (OFF-02, OFF-03), come già il dettaglio, dove presa in carico e offerta sono bloccate; per l'operatore la home si chiama «Il tuo cruscotto» e conta solo i suoi dati. Il menu ridotto e le regole nell'API c'erano già dalle fasi 1 e 3.
- Prova: E2E `tests/e2e/specs/S10-sub-agente-due-agenzie.spec.ts` (scenario S10 completo con Marco e Sofia; il back office invita a mano Agenzia Uno e Agenzia Tre, così il test non dipende dalla scelta automatica); `fase1-accessi.spec.ts` aggiornato al nuovo selettore e ora salva i codici TOTP per i test successivi dello stesso giro.
- Prossimo passo: fase 4, passo 6 (riconferma).

**2026-10-17 — fase 4, passo 6 (riconferma).**

- Fatto:
  - richiedente: quando la richiesta è «Scaduta», il riquadro dell'asta mostra «Chiedi riconferma» con le riconferme rimaste (massimo `reconfirmation.maxPerRequest`, GAR-06); dopo il clic «Riconferma chiesta», poi «Riconferma in corso» con il conto alla rovescia, senza prezzi;
  - API `POST /requests/:id/reconfirmation`: solo il richiedente, solo su «Scaduta», una volta finché il worker non apre il giro; evento nella cronologia, registro attività e messaggio `ReconfirmationRequested` nella coda per il worker;
  - worker: dopo «Scaduta» il workflow aspetta la riconferma oppure i 30 giorni (`requests.autoCancelExpiredDays`, proposta D: poi «Annullata», con avviso al richiedente). Il giro `RECONFIRMATION` invita solo le agenzie che avevano un'offerta valida nell'ultimo giro, con una nuova coppia di chiavi (BC-06) e `reconfirmation.workingHours` per rispondere; garanzia minima calcolata sulla chiusura del giro (GAR-01); nessun rabbocco con agenzie nuove. Alla chiusura: «Offerte disponibili» con l'avviso `reconfirmation.completed.requester`, oppure «Deserta». Una richiesta il cui workflow era già finito a «Scaduta» riparte con il segnale. Un segnale ripetuto non apre una seconda riconferma: serve una richiesta del cliente più recente dell'ultima apertura;
  - agenzia: la riga in «Richieste in arrivo» ha il segno «Riconferma»; il modulo parte dall'offerta del giro precedente, con «Conferma lo stesso premio» o «Invia il premio aggiornato» (anche al rialzo) e una nuova data di garanzia; «Rinuncia» come sempre (proposta C). Il PDF nuovo è facoltativo: senza, resta valido quello del giro precedente.
- Notifiche: tolti i prezzi da `reconfirmation.requested` e `reconfirmation.completed.requester` (regola 8, valore prudente della domanda 15); nuovo `request.auto_cancelled`.
- Prova: `apps/worker/test/workflow.test.ts` (riconferma, riconferma deserta, nuovo avvio da «Scaduta», annullamento dopo 30 giorni), `apps/worker/test/int/activities.int.test.ts` (invitate solo Uno, Tre e Cinque, nuova chiave, PDF del giro precedente, annullamento automatico), `apps/api/test/int/reconfirmation.int.test.ts`.
- Debito: la classifica pubblicata all'annullamento senza accettazione (decisione 32) arriva con le fasi 5-6; lo scenario S03 end-to-end è nel passo 8.
- Prossimo passo: fase 4, passo 7 (controllo del PDF dell'offerta, OFF-09).

**2026-10-17 — fase 4, passi 7 e 8.**

- Passo 7 (OFF-09, decisione 16):
  - dopo la chiusura, mai prima, il worker legge il PDF di ogni offerta valida e lo confronta con quanto dichiarato (premio e compagnia), con il lettore finto (proposta E: legge le righe «Premio: 505,00» e «Compagnia: …»); campi sotto `documents.confidenceThreshold` non confrontati;
  - esito per ogni offerta nella tabella nuova `OfferQuoteCheck` (migrazione `20261018090000_offer_quote_checks`, solo AstAx la legge): uguale, diverso o illeggibile; le differenze diventano una segnalazione al back office (`offer.quote_mismatch.bo`, senza prezzi). Il controllo non esclude mai da solo: l'offerta vincolante resta quella dichiarata;
  - nella pagina «Aste» del back office la sezione «Preventivi da controllare»: «Escludi l'offerta» (con motivo, solo finché il cliente non ha accettato) o «Va bene così»; l'agenzia riceve `offer.excluded_after_review` con il motivo; tutto nel registro;
  - le offerte di prova degli strumenti di sviluppo hanno ora la riga «Premio:», e la seconda ha apposta 10,00 € in più nel PDF, per mostrare la segnalazione nella demo.
- Correzioni trovate strada facendo:
  - con l'orologio di sviluppo spostato in avanti l'API considerava scaduti gli accessi (la scadenza dei token si controllava con l'orologio spostato): ora con l'ora reale, quella di Keycloak;
  - la pagina «Aste» non mostrava più le aste chiuse da tempo anche se la richiesta aveva ancora offerte aperte o era «Scaduta»: ora le mostra;
  - un test vecchio poteva fallire per caso quando un identificativo casuale conteneva le cifre del prezzo cercato.
- Nuovo strumento di sviluppo: «Riporta l'orologio a oggi».
- Passo 8 (prove): E2E `S03-riconferma.spec.ts`, `S06-parita.spec.ts`, S10 con aiuti comuni in `tests/e2e/support/agency.ts`, nuova utenza di prova per Agenzia Cinque; integrazione: ogni risposta dell'area agenzia senza telefono né email del cliente (anche nei PDF), lettura della copia dell'offerta per ruolo (autore, titolare, supervisore, operatore solo con `canSeeColleagueOffers`), avviso sulle coperture sotto il pacchetto, note con email o link scritti a parole, decisioni del back office sui PDF.
- Prove del giro completo: `pnpm check` verde (36 compiti); E2E 17 su 18 al primo giro: `fase4-agenzia.spec.ts` dipendeva dalla rotazione della scelta automatica e ora fa invitare Agenzia Uno a mano; poi 3 giri su 4 verdi, il quarto fermo su un clic senza un errore riproducibile: da tenere d'occhio in CI.
- Ambiente di sviluppo: durante `pnpm check` (che ricompila i pacchetti) l'API e il worker avviati da `pnpm dev` a volte si fermano al riavvio automatico e restano fermi; si riavviano con `pnpm dev`.
- Debito: se il back office esclude l'ultima offerta rimasta, la richiesta passa a «Scaduta» solo al successivo controllo delle garanzie, non subito (domanda 16).

## Criteri della fase 4

| Criterio | Stato | Prova |
| --- | --- | --- |
| Scenari S03, S06 (end-to-end) e S10 | Fatto (S03 in parte) | E2E `S03-riconferma.spec.ts`, `S06-parita.spec.ts`, `S10-sub-agente-due-agenzie.spec.ts`. S03: le risposte delle agenzie sono offerte di prova, non conferma/aggiornamento/rinuncia dalle schermate; le regole di S03 (24 ore lavorative, garanzia minima, solo le agenzie dell'ultimo giro, busta chiusa) sono provate in `apps/worker/test/int/activities.int.test.ts` e `apps/api/test/int/reconfirmation.int.test.ts` |
| Il modulo rifiuta compagnia senza mandato, garanzia sotto il minimo, PDF mancante, note con telefono, email o link; coperture sotto il pacchetto: avviso all'invio ed esclusione alla chiusura | Fatto | `auctions.int.test.ts` («OFF-04 OFF-05 VIS-11…»), `agency.int.test.ts` («OFF-04 the operator sends…», avviso), `activities.int.test.ts` («OFF-06…») |
| Copia per l'agenzia solo a chi ne ha diritto, gli altri 403, ogni lettura registrata | Fatto | `agency.int.test.ts` («BC-04 the agency's copy…»), `auctions.int.test.ts` («S07 BC-01…») |
| Due prese in carico nello stesso istante: una sola riesce | Fatto | `agency.int.test.ts` («OFF-03 two users…») |
| Filigrana sui documenti, verificata sul file | Fatto | `apps/api/test/watermark.test.ts` (testo disegnato su ogni pagina, metadati del cliente tolti), `agency.int.test.ts` («VIS-10…») |
| Tutti gli endpoint dell'area agenzia senza telefono ed email del cliente | Fatto | `agency.int.test.ts` («VIS-01 every answer…»: tre ruoli, risposte vere controllate, documenti compresi) |
| Controllo del PDF: segnalazione, esclusione con motivo, rifiutata dopo l'accettazione | Fatto | `activities.int.test.ts` («OFF-09…»), `quote-checks.int.test.ts` |
| I filtri personali non allargano quelli dell'agenzia | Fatto | `agency-filters.test.ts`, `agency-settings.int.test.ts` («VIS-06…») |
| Il titolare vede gli accessi dei propri utenti | Fatto | `agency-settings.int.test.ts` («VIS-08…», anche senza le voci di un'altra agenzia), E2E `fase4-agenzia.spec.ts` |

## Verifica indipendente (fase 4)

Primo giro, 2026-10-17: 17 problemi. Corretti:

1. I metadati del PDF del cliente (titolo, autore, XMP) arrivavano all'agenzia (VIS-01): ora tolti; test sul file.
2. Il test dei contatti non poteva vederli: nuovo test sul file e sulle pagine.
3. In riconferma un aggiornamento del premio senza PDF nuovo teneva il PDF vecchio: ora il PDF nuovo serve sempre, tranne per la conferma dello stesso premio, compagnia e prodotto.
4. Il test «ogni endpoint» non controllava che le risposte fossero vere: ora controlla l'esito.
5. La protezione contro una seconda riconferma confrontava gli orari di due programmi: ora usa il numero della riconferma.
6. L'annullamento automatico poteva scattare subito dopo una richiesta di riconferma: ora no, e il workflow aspetta il segnale.
7. I 30 giorni erano blocchi di 24 ore: ora giorni di calendario di Roma.
8. L'avviso di esclusione dopo il controllo del PDF andava a tutti i membri: ora solo a chi può vedere quell'offerta.
9. L'affidamento a un collega non controllava i suoi filtri e le sue offerte per un'altra agenzia, e trasformava ogni errore in «lavora per un'altra agenzia»: corretto, con test.
10. Numeri di business nel codice (finestra di 30 giorni e ora del cruscotto): ora parametri `agency.dashboard.statsDays` e `agency.dashboard.closingSoonMinutes`.
11. «Offerte aperte» mostrava anche offerte con la garanzia scaduta: ora solo quelle ancora garantite.
12. Alcuni rifiuti a utenti non di agenzia non erano registrati: ora sì.
13. Il contatore «chiudono entro un'ora» contava anche le richieste rinunciate: corretto.
14. Il caricamento dei documenti dei prodotti e dei PDF delle offerte si fidava del tipo dichiarato: ora controlla che il file sia un PDF.
15. Nel «Team» l'ultimo accesso contava anche il lavoro per altre agenzie: ora solo per questa.
16. Nuovi test: registro degli accessi senza le voci di un'altra agenzia, busta chiusa durante la riconferma, scadenza esatta della riconferma (24 ore lavorative con la festa dell'8 dicembre).

Dopo le correzioni: `pnpm check` verde (36 compiti, dopo un primo giro interrotto da un crash di Windows in un processo di test del database); E2E 17 su 18, poi S06 verde da solo (al primo giro il worker di sviluppo era fermo e l'asta non si era aperta).

Rinviati, come debito o domanda:

- nessun test di «replay» dei workflow con una storia della fase 3 (le modifiche sono protette con `patched` e con percorsi nuovi solo dopo l'ultimo passo registrato);
- domanda 16 per Dan: cosa fare quando il back office esclude l'ultima offerta rimasta;
- S03 end-to-end con risposte delle agenzie dalle schermate (oggi offerte di prova).

## Demo per Dan (fase 4)

Prima: Docker Desktop acceso; in PowerShell, nella cartella `C:\Users\clien\Searches\astax`, `pnpm infra:up`, `pnpm install`, `pnpm db:migrate` (due tabelle nuove), `pnpm db:seed` (Sofia Marchi e le altre utenze), poi `pnpm --filter @astax/ui build` e `pnpm dev`. Password dei professionisti e codici come nelle demo precedenti. Servono tre finestre del browser (o una normale, una in incognito e un altro browser): Agenzia Uno, Marco Rossi e Giulia (privata). Il back office (`arta.hoxha@astax.test`) in una quarta.

1. **La richiesta arriva alle agenzie.** Giulia invia una richiesta, il back office la approva. In «Aste», sulla scheda dell'asta, con «Invita» (motivo «demo») invita a mano Agenzia Uno e Agenzia Tre, così sono sicure tra le invitate.
2. **L'area dell'agenzia.** Entra come `anna.moretti@agenzia-uno.test` (titolare di Agenzia Uno). La home è il cruscotto dell'agenzia. In «Richieste in arrivo» c'è la richiesta di Giulia con le colonne della scheda e il conto alla rovescia. Aprila: tutti i dati per quotare, nessun telefono né email, l'avviso «ogni apertura viene registrata». Apri un documento: è un PDF con il nome dell'agenzia, il tuo nome, data e ora.
3. **Marco lavora per due agenzie.** Entra come `marco.rossi@collaboratori.test`, scegli Agenzia Uno e premi «Prendi in carico». Con il selettore in alto passa ad Agenzia Tre: la stessa richiesta dice «Hai già preso in carico questa richiesta per Agenzia Uno» e non puoi né prenderla né offrire. Torna su Agenzia Uno e premi «Rilascia».
4. **Sofia offre per Agenzia Tre.** Entra come `sofia.marchi@agenzia-tre.test`, prendi in carico e compila l'offerta: premio, Compagnia Beta e il suo prodotto, le coperture voce per voce (accanto c'è quello che chiede il pacchetto), la data di garanzia, il PDF, la conferma che è vincolante. Prova a scrivere un numero di telefono o «chiocciola» nelle note: viene rifiutato.
5. **Anna offre per Agenzia Uno.** Come titolare, in «Le mie offerte» vedi le offerte per stato e la sezione «Offerte aperte». In «Team» vedi le persone con RUI, permessi e ultimo accesso; con «Registro degli accessi» vedi chi ha aperto i dati della richiesta di Giulia. In «Filtri e capacità» e in «Agenzia» (libreria prodotti con DIP e condizioni) puoi provare a cambiare qualcosa.
6. **La chiusura e il controllo dei PDF.** In «Aste» premi «Invia 3 offerte di prova» e poi «Fai scattare il prossimo passo» fino a «Chiusa». Giulia vede le offerte. Il back office trova la sezione «Preventivi da controllare»: una delle offerte di prova ha nel PDF un premio di 10,00 € più alto di quello dichiarato. Puoi «Escludi l'offerta» con un motivo oppure «Va bene così».
7. **Scadenza e riconferma.** In «Aste», negli strumenti di sviluppo, scrivi 64800 minuti (45 giorni) e premi «Sposta avanti l'orologio», poi «Fai scattare il prossimo passo» qualche volta: la richiesta di Giulia diventa «Scaduta» e lei vede «Chiedi riconferma» («Ti restano 2 riconferme»). Premilo: Giulia vede «Riconferma in corso»; le agenzie che avevano offerto trovano la richiesta con il segno «Riconferma» e il modulo già compilato con la loro offerta («Conferma lo stesso premio» o «Invia il premio aggiornato»). Fai rispondere le agenzie (anche con «Invia 3 offerte di prova») e chiudi con «Fai scattare il prossimo passo»: Giulia vede le nuove offerte con le nuove date di garanzia.
8. **Fine.** Premi «Riporta l'orologio a oggi».

## Criteri della fase 3

| Criterio | Stato | Prova |
| --- | --- | --- |
| L'approvazione apre l'asta con l'ora di chiusura corretta; calendario: esempio di ASTA-02, sabato, festivo, ora legale 25/10/2026 e 28/03/2027, approvazione notturna e domenicale | Fatto | `packages/shared/src/domain/working-calendar.test.ts`; `apps/worker/test/int/activities.int.test.ts` («ASTA-01 ASTA-02 GAR-01…»); E2E `tests/e2e/specs/S07-busta-chiusa.spec.ts` |
| Le offerte inviate via API sono cifrate; scenario S07 | Fatto | `apps/api/test/int/auctions.int.test.ts` («BC-02…», «S07 BC-01…»: nove ruoli, offerta, PDF ed elenco, 403 e `SEALED_BID_ACCESS_DENIED`); KMS non usato prima della chiusura in `activities.int.test.ts` («BC-03…»); E2E senza prezzi visibili fino alla chiusura |
| Chiusura automatica all'ora prevista (tempo accelerato) e anche con il worker fermo all'ora di chiusura | Fatto | `apps/worker/test/workflow.test.ts` («ASTA-01…», «the auction closes also when the worker is down…») |
| Offerta dopo la chiusura rifiutata, anche in concorrenza con la chiusura | Fatto | `auctions.int.test.ts` («BC-05 a submission that waits for the closing's lock…», «BC-05 OFF-07 after the closing…»); trigger del database in `packages/db/test/auctions.int.test.ts` |
| Scenario S04; test di dominio di S06 | Fatto | S04 con gli orari esatti in `activities.int.test.ts` («S04 — asta deserta»); variante in E2E `tests/e2e/specs/S04-asta-deserta.spec.ts`; S06 in `auction-rules.test.ts` e nella chiusura (`activities.int.test.ts`, «S06…») |
| Selezione: filtri, capacità, pausa, orari di ricezione, validità massima, sospensione, varietà, rotazione, massimo 8, rabbocco di 4 sotto le 3 offerte | Fatto | `packages/shared/src/domain/agency-selection.test.ts`, `agency-filters.test.ts`; `activities.int.test.ts` («ASTA-04 ASTA-05…», «ASTA-09…») |
| Prolungamento (garanzia minima invariata), nuovi inviti solo nella prima metà (dopo 409), annullamento, registrati | Fatto | `activities.int.test.ts` («ASTA-06 GAR-01…», «ASTA-06 invitations…», «ASTA-06 a cancellation…»); `auctions.int.test.ts` («ASTA-06…», 409 dopo la metà); `workflow.test.ts` |
| Un'asta aperta non cambia se l'amministratore modifica i parametri (ASTA-09) | Fatto | `activities.int.test.ts` («ASTA-09 the auction keeps the parameters…») |
| La storia dei workflow non contiene premi, codici fiscali o nomi di compagnie | Fatto | `workflow.test.ts` («BC-07 SIC-06…»); errori delle attività senza messaggi del database (`apps/worker/test/safe-errors.test.ts`) |
| Le notifiche alle agenzie non contengono contatti del cliente né prezzi | Fatto | `activities.int.test.ts` («VIS-01 the texts sent to the agencies…», «CLA-04…») |

## Demo per Dan (fase 3)

Prima: Docker Desktop acceso; in PowerShell, nella cartella `C:\Users\clien\Searches\astax`, `pnpm infra:up`, poi `pnpm install`, `pnpm db:migrate` e `pnpm db:seed` (tabelle e dati nuovi delle agenzie), poi `pnpm dev`, che ora avvia anche il worker delle aste. Password dei professionisti e codici come nella demo della fase 2. Gli strumenti di sviluppo funzionano solo in locale (`DEV_TOOLS=true` nel file `.env`).

1. **Una richiesta da approvare.** Come nella demo della fase 2, Giulia invia una richiesta. Nel riepilogo, prima dell'invio, c'è «Chiusura dell'asta se approvata ora», calcolata sul calendario lavorativo.
2. **L'anteprima delle agenzie.** Nel back office (`arta.hoxha@astax.test`) apri la scheda: il riquadro «Agenzie da invitare» dice quante agenzie saranno invitate e quali compagnie coprono. Prova «Escludi l'agenzia» con un motivo, e poi «Reinserisci».
3. **L'asta si apre da sola.** «Approva e apri l'asta». Nel menu «Aste» compare l'asta, con chiusura, agenzie invitate e offerte arrivate (0). Giulia, sulla pagina della richiesta, vede il riquadro «Asta» con il conto alla rovescia.
4. **Arrivano le offerte.** In «Aste» premi «Invia 3 offerte di prova»: tre agenzie inviate mandano un'offerta. Il contatore passa a 3, sia per il back office sia per Giulia, che lo vede aggiornarsi da solo. Nessun prezzo da nessuna parte.
5. **Nessuno legge le offerte.** Con `paola.ricci@astax.test` (amministratore) apri il «Registro delle attività»: ogni tentativo di leggere un'offerta altrui è registrato come `SEALED_BID_ACCESS_DENIED`. Gli invii compaiono come `OFFER_SUBMITTED`, senza importi.
6. **La chiusura.** Premi «Fai scattare il prossimo passo» tre volte: rabbocco, promemoria, chiusura. Così non aspetti le ore lavorative. L'asta diventa «Chiusa». Giulia vede, per ogni compagnia, la migliore offerta con il prezzo, «Più conveniente» sulla prima e «Garantito fino al…». Il nome dell'agenzia non compare.
7. **Asta deserta.** Fai un'altra richiesta, approvala, e senza offerte premi «Fai scattare il prossimo passo» finché la richiesta diventa «Deserta». Giulia e il back office ricevono l'avviso.
8. **Azioni del back office.** Su un'asta aperta prova «Prolunga» (la chiusura si sposta), «Invita» e «Annulla l'asta», sempre con un motivo. Un invito dopo la metà dell'asta è rifiutato.

## Verifica indipendente (fase 3)

Primo giro, 2026-10-16: revisore indipendente con le istruzioni del `verificatore` (il sottoagente non si carica nella sessione aperta nella cartella superiore). Ecco i problemi trovati e come sono stati chiusi.

1. Un prolungamento ripetuto da Temporal veniva applicato due volte. Ora ogni azione del back office ha un identificativo e si applica una volta sola.
2. I segnali del back office non dicevano a quale asta si riferivano. Ora la portano, e il workflow ignora quelli di un altro giro.
3. Un guasto lungo all'ora di chiusura faceva fallire il workflow. Ora i passi dell'asta riprovano senza limite.
4. Gli invii rischiavano di esaurire le connessioni al database: il registro del KMS apriva una seconda transazione. L'API non aspetta più quella scrittura.
5. Il richiedente vedeva i PDF di tutte le offerte, anche di quelle escluse. Ora restano nascosti fino alla presentazione delle offerte (fase 5).
6. ASTA-09 era rispettata solo in parte. Ora l'asta copia all'apertura anche le festività, i giorni e l'ora del promemoria GAR-05 (nuovo parametro `guarantee.reminderTime`).
7. Si poteva prolungare un'asta dopo l'ora di chiusura e chiuderla in anticipo. Ora entrambe le cose sono rifiutate; la chiusura anticipata resta possibile solo con lo strumento di sviluppo.
8. Gli operatori vedevano tutte le richieste dell'agenzia (VIS-06). Ora, se l'agenzia distribuisce per filtri personali, un operatore vede e prende in carico solo le richieste nei suoi filtri.
9. Il worker aveva testi scritti nel codice. Ora sono etichette in `seed/notifiche.yaml`, in italiano e in albanese.
10. C'erano numeri di business scritti nel codice.
    - Ora sono parametri: `guarantee.reminderTime` e `backOffice.recentAuctionsDays`.
    - Il prolungamento massimo è la durata d'asta più lunga in vigore.
    - Un dato mancante non apre più un'asta di 0 ore.
11. Il motivo scritto dal back office entrava nei segnali di Temporal (BC-07).
    - Ora il motivo resta nel registro dell'API e il workflow riceve solo identificativi.
    - Prezzi e targa sono tolti dalle notifiche della fase 3 (domanda 15).
12. La cronologia del privato mostrava il numero di agenzie invitate (VIS-03): tolto.
13. Le email del worker si perdono se il processo cade tra il salvataggio e l'invio: rinviato come debito (vedi la tabella dei debiti).
14. Il registro aveva dei buchi.
    - Ora si scrive prima il registro e poi il segnale.
    - Sono registrati anche il rifiuto di una modifica e la lettura della copia dell'agenzia durante una modifica.
15. L'API bloccava la riga dell'asta prima di controllare che l'agenzia fosse invitata. Ora controlla prima; un'agenzia non invitata riceve 404.
16. OFF-02 si poteva aggirare modificando l'offerta di un collega. Ora l'offerta passa alla persona che la modifica.
17. Alcuni test erano deboli o mancavano. Aggiunti o rafforzati:
    - S07 con tre offerte e la copia di tutto il database e del deposito dei file;
    - la concorrenza tra invio e chiusura nei due ordini;
    - S04 con il promemoria e gli avvisi;
    - i testi resi per le agenzie;
    - la consegna dell'approvazione al workflow;
    - gli strumenti di sviluppo con `DEV_TOOLS` acceso;
    - un file per scenario: `S07-busta-chiusa.spec.ts`, `S04-asta-deserta.spec.ts`.

Secondo giro, 2026-10-16: lo stesso revisore ha controllato le correzioni (verde `pnpm check`). Il limite massimo del prolungamento risultava corretto qui sopra ma non c'era nel codice: lo script che doveva aggiungerlo non aveva trovato il punto giusto e non aveva dato errore. Problemi del secondo giro e come sono stati chiusi:

1. Limite del prolungamento: ora c'è davvero (la durata d'asta più lunga in vigore, 400 oltre), con il test; anche il numero massimo di agenzie per invito viene dai parametri (`invitations.max`), e la schermata non ha più `max={24}`.
2. Registro del KMS nell'API senza traccia degli errori: ora un errore di scrittura è un errore nel log.
3. Workflow già in corso con il comportamento vecchio: la nuova regola sull'asta giusta è dietro `patched("auction-bound-requests")`, così le storie esistenti si rigiocano.
4. Richieste del back office non applicate senza esito: ora il registro ha `AUCTION_REQUEST_NOT_APPLIED` (altro giro o rifiuto) e `AUCTION_REQUEST_NOT_DELIVERED` (segnale non arrivato, con risposta 500).
5. Riprovare senza limite senza allarme: dopo circa dieci minuti di tentativi ogni errore di un passo dell'asta è un `ALARM` nel log, con soli identificativi.
6. Diniego dei filtri personali con una seconda transazione sotto il blocco: ora il controllo VIS-06 avviene prima, in una transazione breve senza blocco.
7. Valori scritti nel codice: tolto `"09:00"` (si usa il parametro in vigore) e il massimo di 20 agenzie per invito.
8. Elenco dell'agenzia lento: il filtro personale si legge una volta sola.
9. PDF delle offerte protetti solo dall'API: ora anche una regola del database li nasconde al richiedente (regola 3, seconda linea).

Terzo giro, 2026-10-16: 7 punti su 9 chiusi; corretti anche i due rimasti e due osservazioni nuove.

1. VIS-06 vale ora anche per «non interessato» e per «ritira offerta».
2. Tutti i rami nuovi del workflow (asta giusta, esito delle richieste rifiutate) stanno dietro lo stesso `patched()`: una storia vecchia si rigioca con il comportamento vecchio.
3. Il limite del prolungamento usa le durate copiate all'apertura dell'asta (ASTA-09); `auction.durationsWorkingHours` entra nella copia dei parametri.
4. Gli errori che non sono nostri arrivano a Temporal e all'allarme senza messaggio (un errore di lettura del JSON cita il testo letto), con il test.

Limite dichiarato: la concorrenza tra invio e chiusura (BC-05) è provata nei due ordini, ma in ciascun test una delle due parti è una transazione scritta nel test con lo stesso blocco sulla riga, non il codice dell'API contro quello del worker insieme; la regola del database (`offer_guard`: nessun invio su un'asta non aperta) è la seconda linea, provata a parte.

## Sessione della fase 2

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
- 2026-10-16: Dan ha provato la demo: «tante cose non tornano, ma comunque continua con l'altra fase, le riprendiamo in seguito». La fase 2 resta aperta; l'elenco dei problemi è da raccogliere con Dan. Piano della fase 3 presentato, in attesa di approvazione.
- 2026-10-16: piano della fase 3 approvato da Dan (proposte A-G). Passo 1 fatto: revoca del consenso (dal profilo del privato, dalla scheda cliente del broker; dopo la revoca il back office non può approvare); nel database il ruolo dell'utenza (parametri, elenchi, festività e testi legali solo dall'amministratore; registro di un'organizzazione solo per il titolare e per supporto, supervisore e amministratore del back office), consensi creati solo dall'API dopo il controllo e modificabili solo per revocarli, notifiche per altri utenti solo dal servizio delle notifiche.
- Passi 2-4 della fase 3 fatti: calendario lavorativo e regole dell'asta nel dominio; tabelle di compagnie, agenzie, aste e offerte sigillate con le regole del database; scelta delle agenzie (ASTA-05) e anteprima nella scheda di verifica, con esclusione motivata.
- Passo 5 della fase 3 fatto: busta chiusa con libsodium e KMS finto (ADR 0005), registro delle chiavi in `KmsEvent`; l'API ha solo la chiave delle copie per l'agenzia.
- Passo 6 della fase 3 fatto: `apps/worker` con Temporal (ADR 0008): `QuoteRequestWorkflow` dall'approvazione (tramite l'outbox, ora nel worker) ad apertura, rabbocco, promemoria, chiusura con apertura delle buste, riapertura dell'asta deserta, garanzie e «Scaduta»; azioni del back office come segnali. Domande 13 e 14 per Dan (asta annullata, ora del promemoria GAR-05).
- Prossimo passo: passo 7 della fase 3 (offerte via API); i problemi della demo della fase 2 quando Dan li indica. Domande 11 e 12 risposte da Dan il 2026-10-16 (60 secondi; un privato può chiedere un preventivo per un'altra persona, punto aggiunto per il legale).

## Criteri della fase 2

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
| Email del worker inviate dopo il salvataggio, senza outbox: se il processo cade in mezzo, l'email si perde (la notifica in app resta) | Un outbox delle email porterebbe gli indirizzi in una tabella in più | Fase 7, con le notifiche |
| Dalla «Deserta» il back office non può ancora aprire una nuova asta (S04) | Serve la schermata con i filtri più ampi | Fase 7 |
| Prezzi e targa tolti dalle notifiche della fase 3 in attesa della domanda 15 | Regola 8 contro i testi di `seed/notifiche.yaml` | Con la risposta di Dan |
| Biglietti del tempo reale tenuti nella memoria del processo API | Con una sola istanza dell'API basta; con più istanze un biglietto chiesto a una non vale sull'altra | Fase 8, in Redis |
| Filtri, capacità, orari di ricezione e prodotti delle agenzie impostati solo dai dati di prova | Le schermate delle agenzie sono della fase 4 (proposta D approvata) | Fase 4 |
| Avviso «Nuova richiesta in target» a tutti i membri attivi dell'agenzia, anche con la distribuzione per filtri personali | La scelta dell'agenzia rispetta i filtri dei membri; i destinatari dell'avviso no | Fase 4, con le schermate dell'agenzia |
| `KmsEvent` come registro delle chiavi al posto di CloudTrail | Nessun KMS vero in sviluppo (ADR 0005) | Fase 8, con il KMS di AWS e il controllo notturno |
| Il richiedente non può annullare una richiesta con l'asta aperta | Il diagramma degli stati non prevede il passaggio da «Asta aperta» ad «Annullata» | Da decidere con Dan, insieme alla domanda 13 |
| Colonna `Verification.excludedAgencies` della fase 2 non usata | Le esclusioni dall'anteprima stanno in `InvitationExclusion` | Alla prossima migrazione che tocca la tabella |
| I test dei workflow scaricano il server di test di Temporal la prima volta | Senza rete quei test falliscono, non passano in silenzio | — |
| Offerte di prova degli strumenti di sviluppo con il primo prodotto dell'agenzia e coperture del pacchetto Completo | Bastano alle demo | — |
| TypeScript 6.0 invece di 7.0 | typescript-eslint non supporta ancora la 7 | Quando esce il supporto |
| Copie del registro in un archivio non modificabile (S3 Object Lock) | Serve l'infrastruttura AWS | Fase 8 |
| Codice di accesso via SMS; SMS veri | Serve il fornitore SMS; oggi gli SMS finiscono in Mailpit | Fase 8 |
| `RuiRecord.linkedNumber` da trasformare in elenco | Un sub-agente può lavorare per più agenzie (dubbio 10) | Fasi 3-4 |
| Keycloak segnala «già autenticato come un altro utente» su un computer condiviso senza «Esci» | Sessione Keycloak rimasta nel browser; non fatto in fase 2 | Con `prompt=login` nelle app, fase 7 |
| Client dell'API generato da OpenAPI per i frontend | La descrizione OpenAPI non contiene ancora gli schemi dei corpi (gli input sono validati con Zod): un client generato oggi avrebbe solo i percorsi. I tipi delle risposte sono scritti a mano in `apps/web/src/lib/requests.ts` e `apps/admin/src/lib/verification.ts` | Fase 4, pubblicando gli schemi Zod in OpenAPI |
| TanStack Query, React Hook Form, PWA con Serwist e Web Push | I moduli della fase 2 usano le azioni del server di Next.js, che funzionano anche senza JavaScript; il controllo dei campi lo fa l'API | Fase 7 (PWA e push); da rivalutare se servono moduli più interattivi |
| Nessun controllo automatico di accessibilità nei test end-to-end | Etichette, tastiera e telefono provati a mano nel browser | Fase 7, con `@axe-core/playwright` |
| Procedura del privato a passi con più domande per schermata, non «una domanda per schermata» | Sei passi, ognuno salva una parte completa della bozza | Da rivedere con Dan dopo la demo |
| Correzione del back office su un gruppo di campi (veicolo, classe CU, compagnia, scadenza) | Gli altri dati si correggono chiedendo un'integrazione | Fase 7, con una scheda di correzione completa |
| Motivi di esclusione solo dall'elenco dei casi esclusi | Nessun «altro» con testo libero | Da decidere con Dan |
| Procedura con al massimo due conducenti | Bastano per i casi del pilota | Quando serve |
| Archivio documenti del privato: una chiamata all'API per ogni richiesta | Pochi preventivi per persona | Quando cresce, con un endpoint unico |
| Caricamento in blocco da CSV per i broker | Non era nel piano della fase 2 | Fase 7 |
| Dashboard del broker con i contatori | Non era nel piano della fase 2 | Fase 7 |
| Approvazione automatica (`verification.autoApproveGreen`, spenta nel pilota) in una transazione separata dopo l'invio, nell'API | Serve il ruolo di sistema; se fallisce la richiesta va al back office con la notifica. L'apertura dell'asta parte comunque dall'evento `RequestApproved`, consegnato dal worker | Quando si accende nel pilota |
| Ricerche (codice fiscale, targa) tenute in chiaro sul server (Redis) per 15 minuti accanto alla sessione, legate al contesto attivo e cancellate con «Esci» | Non devono finire nell'indirizzo della pagina (regola 8) | Fase 8, cifrandole con la chiave dei campi |
| Guscio delle schermate duplicato tra `apps/web` e `apps/admin` | Piccole differenze (contesto, lingua) | Quando cresce, in `packages/ui` |
| Tentativi di accesso con token non validi solo nel log (non nel registro), senza limite di frequenza; nessun limite di frequenza sulla pagina pubblica del consenso | Non riempire il registro a catena (dubbio 6); i codici hanno comunque un massimo di tentativi | Fase 8, con il limite di frequenza |
| Eccezione alla regola pnpm sull'età minima dei pacchetti per Next.js 16.4.1 e React 19.3.1 | Correggono vulnerabilità critiche | Da togliere appena superano l'età minima |
| Testi in albanese del back office da far rileggere a un madrelingua | Tradotti da Claude (anche quelli nuovi della verifica) | Fase 7 |
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
| 0005 | [Busta chiusa: libreria, formato e KMS finto](adr/0005-busta-chiusa-libreria-e-formato.md) | 2026-10-16 |
| 0008 | [Worker delle aste e tempo reale](adr/0008-worker-delle-aste-e-tempo-reale.md) | 2026-10-16 |
| 0007 | [Dati della richiesta cifrati, bozza a sezioni, proprietà delle righe](adr/0007-dati-della-richiesta-cifrati.md) | 2026-10-15 |
