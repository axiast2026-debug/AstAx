# Stato dello sviluppo

Claude Code aggiorna questo file alla fine di ogni sessione di lavoro e alla chiusura di ogni fase. Una sessione nuova parte sempre da qui.

## Fasi

| Fase | Stato | Chiusa il | Note |
| --- | --- | --- | --- |
| 1. Fondamenta | Chiusa | 2026-10-15 | Criteri soddisfatti; verifica indipendente in due giri; demo vista e chiusura confermata da Dan |
| 2. Richiesta e verifica | Chiusa | 2026-10-19 | Criteri con prova; verifica indipendente in due giri; CI verde. Demo segnate come completate da Dan il 2026-10-19 (prova guidata in corso, `docs/collaudo/prova-guidata.md`) |
| 3. Motore d'asta | Chiusa | 2026-10-19 | Criteri con prova; verifica indipendente in tre giri. Demo segnate come completate da Dan il 2026-10-19 (prova guidata in corso, `docs/collaudo/prova-guidata.md`) |
| 4. Offerte | Chiusa | 2026-10-19 | Tutti i passi fatti; verifica indipendente con le correzioni. Demo segnate come completate da Dan il 2026-10-19 (prova guidata in corso, `docs/collaudo/prova-guidata.md`) |
| 5. Accettazione | Chiusa | 2026-10-19 | Tutti i passi fatti (proposte A-I); verifica indipendente con le correzioni; E2E verdi. Demo segnate come completate da Dan il 2026-10-19 (prova guidata in corso, `docs/collaudo/prova-guidata.md`) |
| 6. Dopo l'acquisto | Chiusa | 2026-10-19 | Tutti i passi fatti; due giri di verifica indipendente; E2E verdi. Demo segnate come completate da Dan il 2026-10-19 (prova guidata in corso, `docs/collaudo/prova-guidata.md`) |
| 7. Pannelli e notifiche | Chiusa | 2026-10-19 | Tutti i passi fatti; verifica indipendente con le correzioni. Demo segnate come completate da Dan il 2026-10-19 (prova guidata in corso, `docs/collaudo/prova-guidata.md`) |
| 8. Fornitori reali e sicurezza | In corso | | Piano approvato da Dan il 2026-10-18 (proposte A-H). Parte A fatta (in locale, senza account); parte B in attesa degli accessi di Dan (AWS, domini, sandbox, documenti, società del test di sicurezza) |

Stati possibili: Da iniziare, In corso, In verifica (criteri controllati, in attesa della revisione di Dan), Chiusa.

## In coda (Dan, 2026-10-28)

Da fare subito dopo i miglioramenti della procedura del privato chiesti da Dan il 2026-10-28, in quest'ordine:

1. Unire in `main` il codice automatico al cliente del broker (ramo `feat/codice-automatico-link`, già provato, da aggiornare con `main`).
2. B3 della revisione UX: offerta senza presa in carico esplicita.
3. B4: «Partecipa all'asta» con asta aperta di base, pagine e filtri ricordati per persona.
4. B5: notifiche del back office per urgenza.

Poi, da decidere: B6 (dati dalla targa, serve l'account del fornitore), B7 (controllo della foto), B8 (promemoria della chiusura, testo da validare), B10 (scorciatoie).

## Ultima sessione

**2026-10-28 — verifica del back office più chiara** (piano in `docs/piano-back-office-verifica.md`, disegno approvato da Dan). Presa in carico: chi prende la pratica (con «Prendo io in carico» o con la prima azione) è l'unico che fa verifiche, correzioni, lettura ANIA e decisioni; gli altri ricevono «in carico a un collega» (409 `ASSIGNED_TO_COLLEAGUE`); il supervisore la prende al posto del collega; chi l'ha o il supervisore la rilascia (`POST /verification/requests/:id/release`); nuova colonna `assignedAt`. Le 5 verifiche (`PUT`/`DELETE /verification/requests/:id/checks/:step`, `packages/shared/src/domain/verification-checks.ts`): libretto, documento d'identità, targa, data di nascita del titolare, tipologia del preventivo con «fattibile»; ognuna con chi e quando, nel registro senza valori; una targa o una data corretta diventa una nuova versione dei dati; l'approvazione vuole le 5 spunte (409 `CHECKS_INCOMPLETE`) e le correzioni nei dati (`CORRECTION_NOT_IN_DATA`). ANIA: porta `AniaReaderPort` con il finto (`packages/adapters/src/ania`), scheda e avvisi con le regole del bot di CorteXa rifatte in `packages/shared/src/domain/ania.ts` (parametri `verification.ania.*`), «Leggi da ANIA» (`POST /verification/requests/:id/ania`, record cifrato sulla verifica), `ANIA_PROVIDER=fake` blocca la produzione. Back office: pagina della pratica nuova (documenti grandi con zoom, le 5 verifiche, scheda per le agenzie, il resto in sezioni chiuse, decisioni nella barra in basso) e elenco con «Tutte / Da prendere / Le mie», verifiche fatte, «In carico a» e aggiornamento da solo ogni 15 secondi. Prove: test di integrazione (presa in carico, spunte, ANIA, tabella dei permessi), test delle regole ANIA e del finto; E2E aggiornate con `fiveChecks`. Demo online aggiornata al commit 19ddaa5 (migrazione e parametri ANIA applicati).

**2026-10-28 — ANIA vera** (via scritto di Allianz, Dan; [ADR 0022](adr/0022-ania-vero-nella-demo.md)). Repository privato `astax-ania-bot` sul PC di Dan (da portare su GitHub quando Dan lo crea): il connettore ANIA di CorteXa invariato (225 prove verdi) con un server e gli script `infra/` (installa, indirizzo del portale, login dal PC, collegamento ad AstAx). Il bot gira sul server della demo, nella rete interna, e risponde solo all'API con la sua chiave. In AstAx: `HttpAniaReader` (`ANIA_PROVIDER=http`), lettura con richiesta e operatore, «sessione scaduta» detta all'operatore, modello e allestimento da Prima nella scheda. Indirizzo del portale impostato da Dan. Il login dal PC non si riusa sul server (il portale lo rifiuta): il login si fa ora dal back office, pagina «Portale ANIA», sullo schermo del browser del bot (provato sul server: compare la pagina di accesso Allianz). Demo aggiornata al commit 17fac8c e collegata al bot vero (`ANIA_PROVIDER=http`). Il disco del server era pieno delle immagini delle versioni passate (liberati 17 GB): `deploy.sh` ora toglie a ogni aggiornamento le immagini e la cache non usate da più di un giorno. Da fare: Dan fa il login da «Portale ANIA» e prova «Leggi da ANIA».

**2026-10-28 — procedura del privato più semplice** (piano in `docs/piano-procedura-privato.md`, richieste di Dan; scelte prudenti nelle domande 33-38). Primo accesso con nome, cognome e cellulare (`/benvenuto`, `PUT /me/profile`, telefono cifrato) e «Ciao {nome}». Data di nascita in testo «gg/mm/aaaa» che si può incollare (`parseItalianDate`). Comune dai suggerimenti dei comuni ISTAT; provincia e CAP da soli, elenco dei CAP per i 45 comuni che ne hanno più di uno (`seed/cap.csv` da GeoNames, `Municipality.postalCodes`, `pnpm reference:postal-codes`). Con un errore i campi scritti restano (`ActionForm`). Libretto e carta d'identità anche per chi è già assicurato; niente patente né attestato; più file per documento (fino a `documents.maxFilesPerDocument`), PDF o foto, ciascuno si può togliere; nessun campo precompilato dalla lettura del bot. La carta d'identità prima non si poteva caricare (mancava tra i tipi ammessi): corretto. Coperture in tre scelte (RCA obbligo di legge, Consigliate, Su misura), eventi naturali e atti vandalici separati, kasko collisione, full kasko, collisione con animali selvatici ([ADR 0021](adr/0021-coperture-tre-scelte.md), versione 2 dei pacchetti). Il privato non sceglie la decorrenza (immediata, domanda 36); il broker sì. Dati della patente facoltativi; classe CU, compagnia e scadenza attuali le inserisce il back office (senza attestato). Prove: `pnpm check` verde; E2E fase1-accessi, fase2-richieste e S01 verdi in locale. Da fare: aggiornare la demo online quando Dan rilancia «Demo images»; poi la coda (codice automatico del broker, B3, B4, B5).

**2026-10-23 — link magico nell'email del codice** (ramo `feat/link-magico`, proposta B1 della revisione UX; Dan, domanda 28: sì, con le stesse regole del codice; [ADR 0019](adr/0019-link-magico.md)). L'email del codice del privato ha ora anche un pulsante «Entra in AstAx»: un token di 32 byte casuali, salvato in Keycloak solo come hash con la scadenza del codice (`otp.validityMinutes`), consumato con una rimozione atomica (vale una volta), stesso limite di invii per indirizzo (`security.emailCodesPerAddressPerHour`). Il link apre `/accedi/link?t=<token>` nel sito (solo il token nell'URL): la pagina manda il token con un POST a `/auth/link`, da sola o con il pulsante, e parte il normale accesso dei privati con il parametro `astax_link`, che l'estensione `astax-email-code` legge e consuma; l'accesso finisce nel registro da `/auth/callback` come oggi. Il codice resta come alternativa. Prove: `MagicLinkTokensTest` e `SendLimitsTest` (usato due volte, scaduto, limiti; girano con Maven nella build dell'immagine, che senza di loro non si costruisce), `web-auth.test.ts` (parametro sulla richiesta di accesso), `magic-link.test.ts`, e2e in `fase1-accessi.spec.ts` (ingresso dal link da un altro browser, secondo uso rifiutato). Dopo il pull: `docker compose --env-file .env -f infra/docker-compose.yml build keycloak` e `pnpm infra:up`. Da sapere: le prove sono state fatte con il PC a corto di memoria; la suite e2e completa la fa la CI.

**2026-10-27 — demo online accesa** ([ADR 0020](adr/0020-demo-online.md)). Server Hetzner CAX11 (ARM, 4 GB, Ubuntu 26.04) con 4 GB di swap; dominio `astaxapp.com` su Cloudflare con i record DNS di Resend e DMARC; immagini del commit 265a912 dal pacchetto pubblico `astax-demo`. Indirizzi: https://demo.astaxapp.com (sito) e https://bo.astaxapp.com (back office); `/admin` di Keycloak e `/docs` dell'API rifiutati da fuori; il server risponde solo a Cloudflare (provato da fuori). Provato: accesso di un privato inventato con il codice dall'email (Mailpit, prima di Resend). Email vere con Resend da `noreply@astaxapp.com`; gli indirizzi riservati ai test restano su Mailpit (`TestAddressRouter`). Correzioni nate dall'installazione: SSH su Ubuntu 26.04, controllo di prontezza di Keycloak sul codice 200 (anche in `infra/docker-compose.yml`), filtro di Cloudflare solo sul traffico in entrata, chiave di Resend controllata prima del salvataggio. Accessi di prova per Dan in un file sul suo PC, fuori dal repository. Da fare: prova di Dan con la sua email vera; aggiornare la demo con `deploy.sh <commit>` dopo una nuova azione «Demo images», solo su richiesta di Dan.

**2026-10-27 — demo online su Hetzner, preparazione** (ramo `feat/demo-online`; [ADR 0020](adr/0020-demo-online.md), piano in `docs/piano-demo-online.md`, «crea» di Dan). Codice: adattatore `ResendEmailSender` (`EMAIL_PROVIDER=resend` con `RESEND_API_KEY`, prova di contratto simulata); con un fornitore email vero gli SMS e le notifiche push finti restano su Mailpit e non escono mai; fascia «DEMO» in ogni pagina di sito e back office con `DEMO_NOTICE=true`; il back office mostra gli strumenti di sviluppo con `DEV_TOOLS=true` da solo, perché la build di produzione di Next.js dice sempre `production` (l'API resta il controllo vero). Server: `infra/demo/` con il Compose della demo (stessi servizi, limiti di memoria, solo Caddy fuori), il Caddyfile (quattro nomi, `/admin` di Keycloak e `/docs` dell'API rifiutati da fuori, `noindex`), `setup-server.sh` (aggiornamenti automatici, SSH solo con chiave, firewall aperto ai soli indirizzi di Cloudflare anche per le porte di Docker, `pg_dump` notturno per 7 giorni), `make-env.sh` (segreti generati sul server, mai stampati), `set-resend-key.sh` (la chiave la incolla Dan nel terminale), `deploy.sh` (commit, immagini, migrazioni, seed sintetico, indirizzi e SMTP di Keycloak). Immagini ARM costruite a mano dall'azione `Demo images` nel pacchetto GitHub `astax-demo`. Da fare: i passi di Dan (Cloudflare e dominio `astaxapp.com`, server CAX21, DNS, Resend, pacchetto pubblico), poi preparazione del server, installazione e prova dei percorsi. Non provato ancora su un server vero.

**2026-10-23 — i messaggi del back office restano** (domanda 30 della revisione UX, risposta di Dan: sì). Nella pagina «Aste», l'unica del back office che si aggiorna da sola (ADR 0008), «Richiesta inviata» e gli errori sono ora un avviso che resta finché l'operatore non lo chiude con la «×» (`sticky-notice.tsx`: tiene l'ultimo messaggio ricevuto e alla chiusura toglie il parametro dall'indirizzo, così l'azione dopo mostra di nuovo il suo). Le altre pagine del back office non si aggiornano da sole e restano come prima. Le due proposte di corsia B approvate (link magico, codice automatico al cliente del broker) sono in lavorazione in due sessioni a parte, su rami propri.

**2026-10-23 — revisione UX, corsia A** (ramo `ux/revisione-2026-10-23`, mandato di Dan senza conferme intermedie; rapporto in `docs/ux-review/2026-10-23/rapporto.md`, avanzamento in `avanzamento.md`). Strumento di misura dei flussi fuori dalla CI (`tests/e2e/ux-review/`, schermate a 390 e 1440 px, conteggi, axe). Modifiche: la bozza riprende dal passo giusto e la home ha un solo pulsante arancio; data di nascita proposta dalla patente o dalla scheda del cliente (l'API dice `customerBirthDate` e `scheduledSubmitAt`); campi mostrati solo quando servono con CSS `:has()` ([ADR 0018](adr/0018-campi-mostrati-quando-servono.md)) e minimi del pacchetto precompilati nell'offerta; «Scegli questa offerta» con stato di attesa; PDF dell'emissione inviati alla scelta; pannello del broker e pagina del cliente dal link nel nuovo design; aree da 44 px, bordi 3:1 e nomi italiani dei campi letti nel back office; h1 sulle home; tema di accesso Keycloak nei colori AstAx (solo CSS: dopo il pull `docker compose --env-file .env -f infra/docker-compose.yml build keycloak`). Controllo indipendente fatto, correzioni applicate. Proposte di corsia B e domande nel rapporto.

**2026-10-23 — CI e2e di nuovo verde dopo il nuovo design**: tre prove rosse da Momento 3. S10: la pagina della richiesta per l'agenzia andava in errore con l'offerta aperta di un collega la cui copia non è leggibile (BC-04, 403): ora la ricevuta compare solo se la copia è leggibile. S03 e S07: il pannello delle offerte stampa la garanzia due volte (telefono e computer) e le prove leggevano la copia nascosta: ora cercano quella visibile. In locale il back office va avviato in sviluppo (`astax-admin`) per avere gli strumenti di sviluppo nelle prove: in produzione la regola 13 li nasconde.

**2026-10-22 — «Partecipa all'asta» si aggiorna da sola** (ramo `agenzia-tempo-reale`, richiesta di Dan; chiude il «Non fatto» dell'area agenzia qui sotto). Canale in tempo reale per le agenzie (ADR 0008): il biglietto ricorda l'agenzia del contesto attivo, `follow-incoming` fa entrare nella stanza `agency:<organizzazione>` solo chi lavora per un'agenzia; a ogni cambio di un'asta (apertura, integrazione degli inviti, invito a mano, offerta, chiusura, riapertura: gli stessi eventi di API e worker) il gateway cerca le agenzie invitate all'ultimo giro e manda loro solo «qualcosa è cambiato», senza richiesta né dati (VIS-01); la pagina rilegge l'elenco dal server, la riga nuova entra evidenziata e il lettore di schermo sente «Nuova richiesta in target». Prova in `apps/api/test/int/realtime.int.test.ts` (l'agenzia invitata sente, un'altra no, un privato non può seguire). Provato in locale: la pagina aperta ha mostrato la richiesta nuova mezzo secondo dopo l'invito, senza ricaricare.

**2026-10-22 — nuovo design, pagine pubbliche e di servizio** (ramo `design/pagine-pubbliche`; piano approvato da Dan: numeri dai parametri, pubblicazione subito con il punto per il legale, icone delle notifiche per tipo). Con questo il pacchetto di Claude Design è applicato tutto. Pagine nuove senza accesso, nel gruppo `app/(pubbliche)` con una pagina d'errore comune: «Come funziona» (cinque passi, ore lavorative, chi vede cosa, come si calcola il risparmio medio), «Per le agenzie» (vantaggi, cosa serve per entrare, trasparenza dopo la scelta, «Lavora con AstAx») e «Domande frequenti» (otto risposte che si aprono senza script). Ogni numero viene dai parametri (regola 7): `GET /public/home` ha in più nel blocco `service` le riconferme massime, le ore della riapertura dell'asta deserta (null se spenta), l'orario lavorativo, il giorno delle rimesse e i giorni del risparmio medio; `workingHoursText` (`apps/web/src/lib/working-hours.ts`, con test) scrive l'orario in parole. Barra e piè di pagina pubblici comuni (`public-shell.tsx`), anche nella home, con i link alle tre pagine; «Accedi» con le due schede nel nuovo aspetto (tolta la frase del disegno sul pulsante «Entra» nell'email, che non esiste); documenti da accettare con versione e nota sulla registrazione; «I tuoi preventivi» vuoto con cosa serve e un solo «Nuovo preventivo»; centro notifiche con l'icona per tipo (`notification-icon.ts`, con test), il punto sulle non lette e il link all'azione. Punto per il legale sui testi delle pagine pubbliche in `docs/punti-aperti.md`. Provato in locale su telefono e desktop, senza accesso e con un privato nuovo e il titolare di Agenzia Uno: axe senza violazioni gravi, nessun errore, le risposte con i numeri giusti.

**2026-10-22 — nuovo design, back office** (ramo `design/back-office`; piano approvato da Dan con la telefonata al cliente come pulsante). Solo aspetto, nessuna API nuova. Pagine più larghe (`max-w-7xl`). Dashboard operativa: code in schede con il contatore in Inter Tight e l'attesa più lunga, la coda che attende da più tempo con il bordo da 2 px e «Attende da più tempo», i numeri di oggi in riquadri. Verifica su tre colonne da 1280 px (documenti letti dal bot con la confidenza; dati dichiarati e documenti con le differenze su rosso chiaro, completamento dei dati; checklist con icone, agenzie da invitare, «Approva e apri l'asta» grande, integrazione, esclusione, correzione); su schermi più stretti due colonne. «Chiama il cliente · numero» è un pulsante che sul telefono chiama; compare dove il back office ha già il numero, cioè nel completamento dei dati (risposta 6B), e da nessun'altra parte. Aste: avviso «solo contatori, mai i prezzi» con il lucchetto, contatori in riquadri (agenzie invitate, offerte arrivate, chiusura). Nuova icona `phone` in `packages/ui`. Il selettore IT/SQ del disegno non c'è: AstAx è solo in italiano (ADR 0017). Provato in locale: dashboard, verifica di una richiesta nuova del privato (il cliente di prova non ha telefono, quindi il pulsante non compare), approvazione e asta su tablet; axe senza violazioni gravi, nessun errore.

**2026-10-22 — nuovo design, area del broker** (ramo `design/broker`; piano approvato da Dan: due rami, prima il broker; miglior premio dopo la chiusura e operatore nella tabella). API: ogni riga di `GET /requests` e `POST /requests/search` ha `operator` (chi nello studio ha fatto la richiesta) e `auction` dell'ultimo giro: stato, chiusura, tempo lavorativo durante l'asta, numero di offerte, agenzie invitate solo per le richieste del canale broker (VIS-03: mai al privato), miglior premio e sua garanzia solo dopo la chiusura (BC-02). Il calcolo del tempo lavorativo è ora una funzione sola, `auctionWorkingTime` in `packages/db`, usata da asta del richiedente, area agenzia ed elenco. Sito: «Richieste» con «N richieste aspettano te.», filtri rapidi «Da fare», «Tutte», «Decorrenza entro 15 giorni», colonne Cliente (targa e codice sotto), Stato, Chiusura o garanzia (anello durante l'asta), Offerte («2 · 6 agenzie invitate»), Miglior premio, Operatore, Da fare, e la nota sui contatti e sui prezzi; asta del broker con la durata scelta, le agenzie invitate, «I nomi delle agenzie non si vedono…» e il testo «Alla chiusura» per il broker. Prove: `agency-requester.int.test.ts` (canale broker: invitati e operatore) e `auctions.int.test.ts` (privato: niente invitati, nessun prezzo). Provato in locale con una richiesta nuova del broker approvata dal back office: tabella su desktop e asta su telefono (in pausa fuori orario), axe senza violazioni gravi, nessun errore. Notato e non toccato: nei «Dati inviati» della richiesta il pacchetto compare come codice («RECOMMENDED») invece del nome.

**2026-10-22 — nuovo design, area agenzia e sub-agente** (ramo `design/area-agenzia`; piano approvato da Dan con il radar P5 e la ricevuta P3 senza il numero di busta, che direbbe quante altre agenzie hanno offerto). API: `GET /agency/requests` ha per ogni asta aperta `live` (tempo lavorativo dall'ora del server, come `GET /requests/{id}/auction`) e `urgent` (chiude entro `agency.dashboard.closingSoonMinutes` senza offerta né rinuncia); `GET /agency/requests/{id}` ha `live`; `GET /offers/{id}` ha `sentBy` (nome di chi l'ha inviata). Sito: «Partecipa all'asta» con il radar blu notte in alto (anello 32, codice, provincia), tabella da 1280 px con anello 24 in «Chiude tra» (arancio 700 in grassetto nell'ultima ora), schede a due colonne su tablet e una su telefono; una richiesta nuova rispetto all'ultima vista nella scheda del browser entra in 420 ms e resta evidenziata circa 4 s (`arrival.tsx`, solo identificativi in `sessionStorage`), con l'annuncio «Nuova richiesta in target». Dettaglio a due colonne: dati a sinistra, anello 96, chiusura, garanzia minima e presa in carico a destra; ricevuta P3 su blu notte (`offer-receipt.tsx`: ora di registrazione al secondo, sigillata fino a, la vostra offerta, inviata da, «Modifica l'offerta», «Ritira l'offerta»); modulo con il premio in Inter Tight, «Chiede: …» per ogni copertura con la spunta verde o l'avviso subito dopo l'invio, «Sigillo la busta…» durante l'invio (`pending-button.tsx`). «Risultati»: una scheda per asta con posizione, scarto, premi di prima, seconda e vostra e una linea con solo questi tre punti (CLA); esclusa in rosso; riga verde quando il cliente ha scelto la vostra senza che fosse la più bassa. Pagine più larghe anche per le agenzie (come per i broker). Nuovi `formatTimeSeconds` e `whenWords` (`apps/web/src/lib/when.ts`). L'anello ora è fatto di `span`, così si può mettere anche dentro un paragrafo. Provato in locale su desktop, tablet e telefono con un'asta vera: radar (soglia alzata a 180 minuti per la prova e poi rimessa a 60), presa in carico, invio, ricevuta, risultati; axe senza violazioni gravi, nessun errore nella console. Da sapere: in locale il worker era fermo dalla mattina su codice vecchio e non apriva le aste, riavviato. Non fatto: la lista non si aggiorna da sola quando arriva una richiesta (servirebbe un canale in tempo reale per le agenzie); l'evidenza della riga nuova si vede quando si ricarica la pagina.

**2026-10-22 — nuovo design, procedura del privato con firma e pagamento** (ramo `design/flusso-privato`; piano approvato da Dan: «Firma e paga» in una pagina, P6, e dopo la firma un pulsante «Paga»). Procedura: avanzamento a trattini su telefono e passaggi numerati sopra il modulo su desktop (`StepNav` in `form.tsx`), scelte come riquadri da toccare (`wizard/wizard-ui.tsx`: `ChoiceCard`, `ChoiceLink`), pulsante fisso in basso sopra la barra del menu con «I dati sono salvati a ogni passaggio» (`StickyActions`), foto con tre stati (da caricare, letta, illeggibile), «Letta dal libretto: controlla che sia giusta» sui campi proposti dal bot, campi da 48 px con bordo 3:1 e focus blu notte, riquadro «La tua richiesta» su desktop. Le stesse schermate valgono per il broker. Pagina della richiesta: «Richiesta inviata» con tre passi e le notifiche sul telefono; documenti da integrare come avviso con il messaggio del back office. «Firma e paga» (`acceptance-steps.tsx`, anche per il cliente del broker dal link): riepilogo con il totale grande e un solo pulsante «Firma e paga …» che porta alla firma; dopo la firma «Paga …»; pagamento non riuscito con la garanzia ancora valida; «Hai pagato» con agenzia, PEC, importo e termine di emissione; «La tua polizza è attiva» quando la richiesta è emessa. Nuove pagine di caricamento ed errore per `/preventivi/[id]`. E2E: `signDocuments` clicca «Firma e paga». Provato in locale su telefono e desktop: le cinque schermate, scelta dell'offerta, firma di prova, pagamento rifiutato e poi riuscito; axe senza violazioni. Nota: la scelta dell'offerta prepara i PDF e in locale può metterci più di 30 secondi.

**2026-10-22 — AstAx solo in italiano** (ramo `solo-italiano`; [ADR 0017](adr/0017-solo-italiano.md), decisione di Dan). Via l'albanese da tutto: selettore e `sq.json` del back office, `PATCH /me` (serviva solo alla lingua), lingua nei formattatori e nel motore delle notifiche, campi albanesi di elenchi, festività, pacchetti, casi esclusi, comunicazioni, ticket e reclami, versioni albanesi in `seed/notifiche.yaml` e `seed/elenchi.json`. Migrazione `20261029090000_solo_italiano`: toglie le colonne della lingua e quelle albanesi, il tipo `Locale` e le versioni `sq` dentro i testi delle notifiche salvati. Dopo il pull: `pnpm db:migrate`. Test aggiornati: integrazione (catalogo, comunicazioni, preferenze, assistenza, permessi) ed E2E fase 1, fase 7 e S05 con le etichette italiane. CLAUDE.md, architettura, modello dati, notifiche, specifiche 01 e 09, punti aperti e lista del lancio aggiornati; fasi chiuse e sessioni passate restano come storia.

**2026-10-22 — nuovo design, Momento 1 «Home»** (ramo `design/momento-1`; piano approvato da Dan con la scelta A: asta in corso, nastro e numeri, con soglia e interruttore). [ADR 0016](adr/0016-dati-pubblici-home.md): `GET /public/home` senza accesso (`apps/api/src/public/`), in memoria per 60 secondi, solo dati anonimi o aggregati: compensi e promesse del servizio dai parametri; con `home.publicData.enabled` acceso e almeno `home.publicData.minClosedAuctions` aste chiuse negli ultimi `home.publicData.windowDays` giorni anche aste aperte, l'asta che chiude per prima (tipo di veicolo, provincia, buste, tempo lavorativo), il nastro degli ultimi eventi (busta arrivata, asta chiusa con N offerte), offerte medie e risparmio medio sul premio dichiarato. Parametri nuovi nel seed (interruttore spento): dopo il pull `pnpm db:seed`. Sito: home pubblica (`public-home.tsx`, `live-ticker.tsx` con pausa, WCAG 2.2.2), le due schede di accesso spostate in «Accedi» (`/accedi`, anche per la sessione scaduta), anello e buste nelle schede della home del privato durante l'asta. E2E fase 1 aggiornato a «Chiedi il preventivo». Provato in locale con i dati spenti e accesi (soglia abbassata a 1, poi rimessa a 30 e interruttore spento): axe senza violazioni, nastro che si ferma, «riduci movimento». Punto aperto per il legale sul risparmio medio in `docs/punti-aperti.md`. Corretto anche il singolare «Manca un minuto» per il lettore di schermo dell'anello.

**2026-10-22 — nuovo design, Momento 2 «Asta in corso»** (ramo `design/momento-2`; piano approvato da Dan con il diario P2 e l'ora di arrivo delle buste, decisione 18c in `docs/decisioni-aggiunte.md`). Dominio: `workingMsBetween` e `workingClock` in `packages/shared/src/domain/working-calendar.ts` (tempo lavorativo che resta, pausa fino alla prossima apertura, corsa fino a fine fascia), con test su sera, sabato e festivi. API: `GET /requests/{id}/auction` ha in più `serverNow` e, con l'asta aperta, `workingSecondsLeft`, `totalWorkingSeconds`, `pausedUntil`, `runsUntil` (calendario della fotografia di apertura, ASTA-09) ed `envelopesAt` (solo gli orari). Sito: `countdown-ring.tsx` (anello che conta dall'ora del server, si ferma fuori orario e chiede di nuovo al server alla fine della fascia; arancio nell'ultima ora, scuro e più spesso negli ultimi 15 minuti; lettore di schermo una volta al minuto), `sealed-envelopes.tsx` (busta nuova con rimbalzo), `auction-live.tsx` (pannello blu notte, buste, diario, «Alla chiusura» con le notifiche e la chiusura nel calendario; asta riaperta; anche per la riconferma e per il broker con le agenzie invitate); asta deserta come stato vuoto con l'assistenza. E2E S07 e fase 2 aggiornati ai nuovi testi («Asta in corso», «Chiude … alle …», «3 buste arrivate»). Provato in locale su un'asta aperta: anello che scorre, nessun prezzo, axe senza violazioni, «riduci movimento». Non visti in locale: pausa fuori orario, ultimi 15 minuti, deserta, riaperta e riconferma con dati veri (worker locale fermo). Fuori tema notato: i link dei documenti nella pagina della richiesta sono alti 17 px (sotto i 44 px).

**2026-10-22 — nuovo design, Momento 4 «Prezzo in scadenza»** (ramo `design/momento-4`; piano approvato da Dan con l'ora del server, il promemoria nel calendario P4 e le schede su desktop). API: `GET /requests/{id}/presentation` ha in più `serverNow` e `reminderDaysBefore` (dalla fotografia dei parametri dell'ultimo giro, come il worker); `GET /requests/{id}/auction` ha in più `reconfirmation.autoCancelAt`, calcolato con `autoCancelAt` di `packages/db` (lo stesso del worker, spostato lì). Sito: stati della garanzia (`apps/web/src/lib/guarantee.ts`, con test): arancio dal giorno del promemoria, l'ultimo giorno le ore che restano dall'ora del server (`guarantee-time-left.tsx`), scadute in grigio in fondo; avviso sulla più conveniente con «Aggiungi la scadenza al calendario» (`add-to-calendar.tsx`, file .ics fatto sul telefono); «I prezzi sono scaduti» con «Chiedi riconferma» e la data di annullamento automatico; «Riconferma in corso» su blu notte con la scadenza e le risposte come buste chiuse, senza prezzi; «Prezzi riconfermati» dopo il giro. Momento 3: la frase delle buste dice quante compagnie hanno offerto (dopo la chiusura l'API non conta le buste). Formattatori nuovi `formatWeekdayDate` e `formatTime`. Provati in locale: pagina delle offerte (axe, aree, «riduci movimento»), aspetto dei quattro stati della garanzia e dell'avviso. Non provati in locale con dati veri gli stati «in scadenza», «ultimo giorno», «scaduta» e «riconferma» (il worker locale non chiude le aste e il database protegge le offerte chiuse, BC-02): li coprono S03 e S06 in CI. Debito: l'anello del tempo della riconferma arriva con il Momento 2 (serve il tempo lavorativo dall'API).

**2026-10-22 — nuovo design, Momento 3 «Apertura delle buste»** (ramo `design/momento-3`; consegna di Claude Design, colori attuali del codice e proposta P1 approvati da Dan). Token in `packages/ui/src/styles.css` (segnali, arancio 50/100/400/700, verde 50, verde 700 più scuro, scala dei testi, ombre) e movimento in `packages/ui/src/motion.css`; Inter Tight per titoli e prezzi; `Button` con misure 36/44/52 e tocco al 97%, `Badge` con raggio 8, nuovi `Icon` e `GuaranteeChip`; `cn` conosce la scala dei testi. `apps/web/src/components/offers-panel.tsx`: alla prima vista di ogni giro d'asta (cookie `astax_offers_seen_<richiesta>_<giro>`) i lucchetti si aprono, le schede entrano a cascata e il risparmio sale (`offers-reveal.tsx`); risparmio sempre rispetto al premio dichiarato; linea del premio (P1); confronto con AI in un foglio dal basso (`ai-compare-sheet.tsx`), con la pagina `confronto-ai` che resta per chi non ha gli script. La scheda «Asta» vuota non compare più dopo l'apertura. Provato in produzione locale su telefono e desktop (axe senza violazioni, aree toccabili ≥ 44 px, «riduci movimento», Esc sul foglio). Non provati in locale: la linea del premio con dati veri (gli E2E non indicano il premio attuale) e S01 fino in fondo (il worker locale non chiudeva le aste): li controlla la CI.

**2026-10-22 — risposte di Dan e lavori piccoli**: 22 (4 ore e 15 minuti, confermati in `docs/ripristino.md`), 23 (dopo la misura), 25 (lotti anche per le società: partita IVA e ragione sociale nelle stesse colonne, intestazioni del modello rinominate, data di nascita del proprietario obbligatoria solo per le persone e controllata all'invio, conducente principale dalla patente; ADR 0014 aggiornato), 26 (lotti in qualsiasi momento, partenza alle 9:00), casi esclusi dei privati come oggi (domanda 27). Estratto conto delle richieste anche per il titolare dell'agenzia richiedente (in «Contabilità»). Tolte da `apps/web/src/lib/wizard-forms.ts` le funzioni delle vecchie schermate del broker (debito tecnico chiuso).

**2026-10-22 — broker, passo 5 del piano e memoria del PC**: voce «Flotte aziendali» con la pagina «In arrivo» (piano del broker completo). Per la poca memoria del computer (8 GB non espandibili) sito e back office in locale girano in produzione (`astax-web-prod`, `astax-admin-prod` in `.claude/launch.json`, dopo il build); gli E2E completi li fa la CI.

**2026-10-22 — agenzie, passo 5 del piano** (risposte 6A, 7A, 8A, 9A): l'intermediario di sezione E di un'agenzia entra come organizzazione `AGENCY` con `ruiSection` E; `withCompanies` (`apps/api/src/onboarding/onboarding.service.ts`) prende le compagnie della sua agenzia dal RUI; `checkOnRui` le confronta con quelle dell'agenzia. Prova in `apps/api/test/int/onboarding.int.test.ts`. Piano delle agenzie completo.

**2026-10-22 — agenzie, passo 4 del piano** ([ADR 0015](adr/0015-agenzia-richiedente.md)): l'agenzia chiede preventivi per i suoi clienti sul canale `BROKER` (permessi dei richiedenti ai ruoli dell'agenzia, `isOrgRequester` e `seesAllClients` in `request-support.ts`); `requesterExclusions` (`packages/db/src/auction-data.ts`) toglie l'agenzia richiedente e le sue compagnie dagli inviti, `excludedCompanies` nella selezione, `COMPANY_OF_THE_REQUESTER` all'invio dell'offerta, `REQUESTER_AGENCY` nell'invito a mano; la dichiarazione sul consenso dei clienti anche per le agenzie (il seed ora aggiorna i destinatari dei testi legali); fattura mensile B anche all'agenzia richiedente. Prove in `apps/api/test/int/agency-requester.int.test.ts`, `packages/shared/src/domain/agency-selection.test.ts` e `tests/e2e/specs/fase7-agenzia-sezioni.spec.ts`. Dopo il pull: `pnpm db:seed`. Da fare: l'estratto conto CONT-05 per l'agenzia richiedente (oggi solo per i broker).

**2026-10-21 — agenzie, passo 3 del piano**: `GET /agency/metrics?days=30|90|365` (tassi in punti base, premi vinti in centesimi) e pagina «Metriche»; `GET /agency/profile` e la scheda dell'agenzia in «Profilo»; voci «Metriche» e «Profilo» nei menu di agenzia e sub-agente. Corretto anche il nome vuoto di «Comunicazioni» nelle preferenze delle notifiche. Prove in `apps/api/test/int/agency.int.test.ts` e `tests/e2e/specs/fase7-agenzia-sezioni.spec.ts`.

**2026-10-21 — agenzie, passo 2 del piano**: «Risultati» con le schede «Non vinte», «In attesa del pagamento» (offerta scelta e firmata, non pagata) e «Vinte»; l'API dà per ogni classifica `outcome` (`NOT_WON`, `AWAITING_PAYMENT`, `WON`). Prova in `apps/api/test/int/acceptance.int.test.ts`; S01 apre la scheda «Vinte».

**2026-10-21 — agenzie, passo 1 del piano** (`docs/piano-agenzie.md`, risposte di Dan 1C, 2, 3B, 4, 5): menu dell'agenzia e del sub-agente con le sezioni chieste da Dan e le altre pagine in fondo (`AGENCY_LINKS`, `SUB_AGENT_LINKS`); «Partecipa all'asta» (prima «Richieste in arrivo») con i filtri asta aperta o chiusa, chiusura entro, pacchetto e senza documenti; «Polizze da emettere».

**2026-10-21 — broker, passo 4 del piano** ([ADR 0014](adr/0014-lotti-dei-broker.md)): lotti dal file Excel (lettore e modello con `fflate`, senza librerie nuove), `RequestBatch` e bozze programmate (migrazione `20261028090000_request_batch`, parametri `batch.auctionDaysBeforeExpiry` 7 e `batch.documentsDaysBeforeAuction` 3, elenchi `coverage` e `startMode`); il giro dell’API `BatchSchedulerService` (ogni `BATCH_SCHEDULE_INTERVAL_MS`, sotto lease) manda l’avviso `batch.documents_due` e invia le bozze nel loro giorno, anche senza documenti (`withoutDocuments`); il filtro delle agenzie `acceptsWithoutDocuments` (Agenzia Uno e Due nei dati di prova nuovi). Prove: `packages/shared/src/domain/batch.test.ts`, `apps/api/src/requests/xlsx.test.ts`, `apps/api/test/int/batches.int.test.ts`, `tests/e2e/specs/broker-lotti.spec.ts`. Domande nuove per Dan: 25 (società nei lotti) e 26 (ora della partenza). Dopo il pull: `pnpm db:migrate` e `pnpm db:seed`.

**2026-10-21 — broker, passo 3 del piano** (`docs/piano-broker.md`, proposta A, risposte 1A e 2A): intermediari di sezione E nella domanda di ingresso, con il numero RUI dell'intermediario per cui lavorano (`principalRuiNumber`, migrazione `20261027090000_section_e`, valore `E` in `RuiSection`); controllo sul RUI con `principalMatches`; organizzazione di tipo broker con sezione E. `conflictedAgencies` (`packages/db/src/auction-data.ts`) toglie dagli inviti l'agenzia per cui lavora l'E, all'apertura, nelle integrazioni di inviti e nell'anteprima del back office. Prova in `apps/api/test/int/onboarding.int.test.ts`. Dopo il pull: `pnpm db:migrate`.

**2026-10-21 — broker, passo 2 del piano** (`docs/piano-broker.md`, proposta G): «Richieste» diventa la tabella di lavoro del broker con filtri (stato e «Da fare», cliente, targa, decorrenza) e la colonna «Da fare» (`apps/web/src/lib/broker-work.ts`, con prove); l'API accetta più stati, il nome del cliente e la decorrenza entro N giorni (nel corpo, mai nell'indirizzo). Menu corto del broker e link in fondo alla pagina (`linksFor` in `packages/ui`). E2E nuovo `tests/e2e/specs/broker-area.spec.ts`.

**2026-10-21 — broker, passo 1 del piano** (`docs/piano-broker.md`, approvato da Dan con le risposte 1-6).

- Il broker usa le stesse 5 schermate del privato per un singolo veicolo, con i pacchetti «Consigliato» e «Su misura». Tolte le vecchie schermate del broker e il codice rimasto senza uso.
- Dichiarazione unica del broker (risposta 3): testo legale nuovo `broker-clients-declaration` (segnaposto da validare), consenso `BROKER_DECLARATION` (migrazione `20261026090000_broker_declaration`). Vale la firma del richiedente o del titolare del suo studio. Prova di integrazione in `apps/api/test/int/intake.int.test.ts`.
- Completamento del back office: per il broker il contraente viene dalla scheda del cliente (LEG-04), con prova in `packages/shared/src/domain/intake.test.ts`.
- CI rossa sul commit precedente (f1e0cdb), corretta: mancava la traduzione `verification.sources.BACK_OFFICE_COMPLETION` nel back office; lo strumento «Invia 3 offerte di prova» prendeva le prime 3 agenzie invitate anche senza prodotto (ora le prime 3 che possono offrire).
- E2E del broker riscritti (fase 2, S02). Dopo il pull: `pnpm db:migrate` e `pnpm db:seed`, poi riavviare api e worker.
- Debito tecnico: in `apps/web/src/lib/wizard-forms.ts` restano funzioni usate solo dalle vecchie schermate (con i loro test); da togliere con il passo 2.
- Da fare: passi 2-5 del piano del broker.

**2026-10-18 — risposte di Dan alle domande aperte** (`docs/domande-aperte.md`, colonna «Risposta»).

- 2B: sessione del privato di 30 giorni dall'ultimo utilizzo, al massimo `session.privateMaxDays` (365, nuovo parametro) dal login.
- 3B: fee ridotto anche con premio di esattamente 200,00 € (FEE-02 «fino a 200 € compresi»).
- 4C: invito nel team valido 30 giorni. 5: resta com'è.
- 13B: il back office annulla un'asta aperta → la richiesta va in «Annullata» (nuovo passaggio nel diagramma); il cliente riceve l'avviso `auction.cancelled.requester` (nuovo).
- 16B: escludendo l'ultima offerta valida dopo il controllo del PDF la richiesta diventa subito «Deserta», con avviso al cliente e al back office (`offer.excluded_last.*`, nuovi).
- 18: il cliente non recede più dall'app: nuovo parametro `withdrawal.onPlatform` (spento); la pagina della polizza indica l'agenzia. Con la conferma 18A neanche il back office registra recessi in AstAx. S08 aggiornato: il flusso completo resta provato nei test di integrazione con il parametro acceso; l'E2E prova la pagina.
- 19B: all'approvazione l'agenzia nuova riceve filtri larghi (tutti i veicoli, province, classi, età e pacchetti, le sue compagnie) e gli orari lavorativi: è subito invitabile alle aste. Nuovi parametri `agency.defaultFilter.maxStartDateDays` (60) e `agency.defaultFilter.maxGuaranteeDays` (30).
- 24: produzione in versione di partenza in Terraform (1 copia per servizio, worker 2, 1 NAT, database in una zona, Redis 1 nodo; protezione dalla cancellazione e backup restano, con prova). Corretto anche il collaudo: aveva 2 copie per servizio mentre la stima ne conta 1. Stima in `docs/costi-aws.md` (~450-650 $).
- Conferme di Dan: 15A (prezzi e targa nelle notifiche: regola 8 di CLAUDE.md cambiata, testi del pacchetto ripristinati con i prezzi; verso le agenzie solo la propria offerta e, dalla classifica, le prime due anonime); 18A (nemmeno il back office registra recessi: parametro rinominato `withdrawal.onPlatform`); 21A (collaudo acceso solo nelle settimane di prova); 1B (tre decorrenze: piano in `docs/piano-decorrenza.md`, da approvare, codice non toccato). Aperte: 22, 23.
- Dopo il pull: `pnpm db:seed` per i parametri nuovi.

**2026-10-18 — fase 8, parte A** (piano approvato da Dan con le proposte A-H; nessuna risorsa cloud creata, nessuna spesa).

- A1 sicurezza nell'app: limiti di frequenza dai nuovi parametri `security.*` (pagine pubbliche, domande di ingresso, codici OTP per numero o indirizzo, token non validi), in Redis; blocco degli accessi e limite dei codici email per indirizzo in Keycloak dai parametri; CSP con nonce e intestazioni di sicurezza; accessi riusciti fuori dalle nostre app e accessi falliti da Keycloak al registro. **Trovato e corretto**: il tempo reale nel browser non si collegava mai (dalla fase 3) perché Socket.IO rispondeva anche all'indirizzo del biglietto; ora `/realtime/socket`, con prova.
- A2 controlli in CI: nuovo job «security» (librerie, Semgrep con regole AstAx, Gitleaks su tutta la storia: tutto pulito), accessibilità con axe sulle schermate principali (corretti i colori di due etichette), `pnpm release:check` (blocca la produzione con testi legali non validati, strumenti di sviluppo accesi o fornitori finti). Semgrep ha trovato la lunghezza del tag di AES-GCM non fissata: corretto.
- A3: coda dei messaggi (`MessageOutbox`): email, SMS e push salvati cifrati con la modifica che li causa e rimandati dal worker se il processo si ferma; fatture allo SDI da sole ogni 5 minuti; avvisi «fattura disponibile» e «pagamento ricevuto» al cliente del broker.
- A4: Web Push vero (chiavi VAPID) e app installabile, ADR 0011 (senza Serwist, niente pagine in cache sul telefono).
- A5: adattatori veri con test di contratto: SES, SMS AWS, KMS AWS, Claude su Bedrock (lettura documenti e spiegazione, prompt versionati), Openapi targhe e SDI (con ricevute su `/webhooks/sdi`). Namirial, Fabrick e RUI IVASS nella parte B (documentazione non pubblica o formato da vedere).
- A6: Sentry e OpenTelemetry senza dati personali, allarmi (`docs/sorveglianza.md`), controllo notturno della chiave delle buste con allarme provato su un'anomalia simulata.
- A7: infrastruttura AWS in Terraform (non creata) con prove di sicurezza su un AWS simulato (solo il worker decifra le buste: la prova fallisce se si rompe la politica), immagini Docker, rilascio da GitHub con approvazione, Temporal Cloud (ADR 0012), dati di riferimento senza dati sintetici (`pnpm db:seed:reference`), stima dei costi in `docs/costi-aws.md`.
- A8 prova di carico k6 (`tests/load`): in piccolo ha trovato «Le mie offerte» lenta (p95 6,96 s, una transazione e una voce di registro per ogni offerta in busta): corretta, p95 193 ms.
- A9-A10: `docs/sicurezza/asvs.md`, `docs/privacy/mappa-dati.md`, `docs/privacy/fornitori.md`, `docs/incidenti.md`, `docs/ripristino.md`, `docs/go-live.md`; strumento di misura della lettura AI (`pnpm --filter @astax/adapters measure:reading`, guida in `docs/collaudo/`). Copie del registro attività nell'archivio con Object Lock (SIC-04), scritte dal worker.
- Domande nuove per Dan: 21-23 in `domande-aperte.md`.

**2026-10-18 — fase 7, passi 9-13, verifica e correzioni** (stesso piano; demo e domande alla fine di tutte le fasi).

- Passo 9, reclami: protocollo «R-anno-numero», risposta entro `complaints.responseDays` giorni di calendario (fine del giorno, ora di Roma); il privato lo presenta dalla sua area (nuova voce «Reclami»), il back office registra quelli arrivati per email, PEC, posta o telefono (nuovo permesso `complaint.register`); ricevuta al reclamante e avviso ai supervisori; il worker avvisa `complaints.reminderDaysBefore` giorni prima della scadenza, una volta; risposta con l'esito (al privato nell'area con l'indicazione dell'IVASS, agli altri per email); esportazione CSV per IVASS, registrata.
- Passo 10, riconciliazione (proposta C): estratto del conto separato in CSV della banca o camt.053; abbinamento automatico per codice della richiesta e importo, solo se un pagamento soltanto corrisponde; coda delle righe senza abbinamento (abbina a mano, ignora, rimetti in coda, sempre con una nota); quadratura giornaliera. Nuovo permesso `payment.reconcile` (contabilità e supervisore).
- Passo 11, caricamento in blocco del broker (proposta H, libreria `fflate`): CSV, o ZIP con il CSV e i documenti; tutto il file si controlla prima e se c'è un errore non si salva niente; per ogni riga il cliente (nuovo o già presente) e una bozza con i documenti. Limite di righe: nuovo parametro `requests.bulkMaxRows` (200). Conservazione (LEG-06, proposta G): ogni giorno il worker, o l'amministratore da «Sicurezza e dati», cancella documenti e dati personali delle richieste non concluse e ferme da `retention.incompleteRequestsMonths` mesi; restano codice, date, offerte e registro; mai una richiesta con polizza, accettazione firmata o pagata, pagamento o fattura.
- Passo 12: cruscotto dell'amministratore (volumi, passaggi, qualità, agenzie, economia, rischio, con filtri per periodo, canale e provincia); «Integrazioni» (adattatore di ogni fornitore, ultimo segnale, problemi); «Report ed esportazioni» (richieste, contabilità in centesimi, registro attività), ogni esportazione registrata. L'approvazione automatica delle richieste verdi c'era già dalla fase 2.
- Passo 13: prova end-to-end `fase7-pannelli.spec.ts` (l'amministratore cambia durata predefinita e fee del privato; una nuova agenzia entra dal sito e il supervisore la approva; il back office in albanese registra e risponde a un reclamo); S05 ora decide la mancata emissione in albanese. Serie completa in locale: 27 prove; al primo giro 19 verdi e 6 rosse, poi corrette e rilanciate tutte e 6 (12 prove, tutte verdi): il menu del privato ha la voce «Reclami»; la prova della fase 1 salva il codice dell'amministratore per quella della fase 7; accettazione, firma e pagamento hanno un tempo massimo di 60 secondi invece di 5 (su un PC carico scadevano) e la firma legge i file prima di bloccare la richiesta.
- CI: era rossa dal primo commit della fase 7 (ordine dei file di test diverso su GitHub, prove che leggevano dati di altri file): corrette le prove (vedi il commit `33217f1`), `check` di nuovo verde in CI.
- Correzioni emerse dalle prove: l'approvazione di un ingresso riusa un account Keycloak professionale già esistente e rifiuta un indirizzo di un privato o di AstAx; il worker esegue le sue pianificazioni subito all'avvio (non dopo 5 minuti); una richiesta nuova prende la data di creazione dall'orologio dell'applicazione (regola 6).
- Domande nuove per Dan: 19 («primo invito») e 20 (termini nuovi) in `domande-aperte.md`.

**2026-10-18 — fase 7, passi 1-8** (piano approvato da Dan il 2026-10-18 con le proposte A-L; demo e domande alla fine di tutte le fasi).

- Passi 1-4 (già pubblicati): ogni parametro si cambia dal pannello in tre pagine («Regole d'asta», «Economia», «Sicurezza e dati») con motivo, data di validità e storico, e un test che le prova tutte; testi delle notifiche nel database con versioni, preferenze per evento e canale nel profilo, centro notifiche con contatore, nessun doppione entro 10 minuti; «Comunicazioni» con anteprima in italiano e albanese, prova a sé stessi e messaggi a un gruppo.
- Passo 5, utenti e documenti legali: «Utenti e permessi» (cerca, blocca e sblocca anche in Keycloak chiudendo le sessioni, azzera il secondo fattore, ruoli del back office; mai su sé stessi); «Contratti e documenti legali»: una nuova versione nasce bozza, il legale la valida, poi si pubblica: da quel momento chi è interessato la riaccetta e riceve l'email `legal.new_version` con la sintesi.
- Passo 6, pacchetti, casi esclusi, elenchi e festività: nuova versione di un pacchetto da una data futura (le richieste tengono la loro); ogni modifica di un caso escluso è una versione con autore e motivo; etichette degli elenchi in italiano e albanese; festività dell'anno con il nome albanese e la proposta dell'anno dopo (date fisse più Pasquetta calcolata dalla Pasqua) da confermare.
- Passo 7, ingresso di agenzie e broker: modulo «Lavora con AstAx» sul sito, poi su un link privato la conferma dell'IBAN con codice via SMS, la polizza di RC professionale in PDF con la scadenza e i contratti; all'invio il controllo sulla copia locale del RUI (numero, sezione, ragione sociale, mandati), importata ogni giorno dal worker con l'adattatore finto (intermediari inventati). Il supervisore approva (organizzazione attiva, mandati dal RUI o «a mano», invito del titolare con l'email di benvenuto; i contratti accettati valgono già al primo accesso) o respinge con il motivo, e il richiedente corregge dallo stesso link.
- Passo 8, back office: cruscotto con le code del proprio ruolo (contatore e attesa più lunga) e gli indicatori del giorno; «Agenzie e broker» con inviti, offerte, vinte, penali, segnalazioni e scadenza della RC, sospensione e riattivazione con motivo, note e proposta di esclusione che decide l'amministratore; «Clienti» con ricerca per nome, codice fiscale o targa, scheda con chi ha aperto i dati, copia dei dati in un file, richieste sui dati personali con la scadenza; «Assistenza» con i ticket, le risposte pronte (elenco modificabile), la risposta via email e le note interne; in «Eccezioni» anche le richieste deserte, le riconferme in corso e i recessi.
- Nuovi parametri (valori prudenti, da confermare): `privacy.requestResponseDays` 30 giorni (da validare con il legale), `support.responseHours` 24 ore. Nuovo permesso `backOffice.dashboard` (tutti i ruoli del back office e l'amministratore), scritto in `docs/permessi.md`.
- Scelta: la sospensione manuale di un'agenzia usa lo stesso meccanismo di EMI-06 (niente nuovi inviti, il lavoro in corso continua); quella di un broker blocca l'organizzazione. L'esclusione (solo l'amministratore) blocca l'organizzazione.
- Correzione nei test: gli id finti di Keycloak si ripetevano tra file di test che usano lo stesso database e collegavano l'utente sbagliato; ora sono unici.
- Come provarlo: `pnpm dev`, poi sul sito «Non sei ancora su AstAx? Chiedi di entrare» con il numero RUI A000000101 («Agenzia Undici», compagnie Alfa e Gamma); il codice SMS arriva in Mailpit; nel pannello, con il supervisore del back office, «Ingressi».
- Prossimi passi: 9 reclami, 10 riconciliazione, 11 caricamento in blocco e conservazione, 12 cruscotto dell'amministratore e report, 13 prove end-to-end e verifica.

**2026-10-17 — fase 6, passi 7-12 e prove finali** (Dan: «procedi per i prossimi passi»).

- Passo 7, rimesse (CONT-01, CONT-02, proposta C): il lunedì (parametro `remittance.runDay`, ora di Roma) il worker prepara le rimesse in bozza; il back office può farlo anche con il pulsante in «Pagamenti». Per ogni agenzia: le polizze emesse fino al venerdì alle 23:59 non ancora rimesse, meno il fee dell'agenzia, il bollo della sua fattura, la quota del broker (se attiva), i premi rimborsati da recuperare e le penali applicate o confermate; quello che non ci sta resta da trattenere la settimana dopo. La contabilità controlla ogni rimessa (e si emette la fattura A all'agenzia, inviata allo SDI finto), genera un file dei bonifici SEPA per giorno (controllato contro lo schema ufficiale, dal conto di AstAx agli IBAN delle agenzie) e segna la rimessa eseguita: l'agenzia riceve l'avviso, senza importi (regola 8). L'agenzia vede in «Contabilità» l'estratto conto (polizze con premio, fee e rimessa), le rimesse con le trattenute, le fatture da scaricare e le penali.
- «Fatturazione» del back office: tutte le fatture con lo stato SDI; quelle «da completare» (proposta D) si completano con codice fiscale e indirizzo e partono allo SDI con lo stesso numero (anche dopo uno scarto).
- Passo 8, broker (decisione 24, CONT-05): il primo del mese la fattura B al broker per i fee del mese prima (30 € a polizza, bollo sopra soglia, pagamento a `invoicing.brokerPaymentTermDays` giorni); in «Contabilità» del broker l'estratto conto (polizze, premio, provvigione se attiva, fee, fattura) con l'esportazione CSV. Il back office può emettere le fatture di un mese a mano da «Fatturazione».
- Passo 9, classifica (CLA-02…04): si pubblica alla firma e ora anche all'annullamento senza accettazione (dal richiedente o automatico dopo 30 giorni), sempre l'ultimo giro con offerte valide, una volta sola, con gli avvisi alle agenzie. Pagina «Risultati» dell'agenzia: prime due offerte senza agenzia né compagnia, la propria posizione («3ª su 5») e lo scarto dalla prima; «esclusa» con il motivo; la classifica si nasconde mentre la richiesta è in riconferma (valore prudente della domanda 17); statistiche su inviti, offerte e vittorie per provincia, classe, tipo di veicolo e compagnia. L'operatore vede solo le proprie offerte.
- Passo 10, rinnovi (processo 10, decisione 39, proposta E): un `PolicyWorkflow` per polizza, avviato all'emissione: questionario dopo 7 giorni, avviso di rinnovo 30 giorni prima della fine (polizza «In scadenza»), fine della polizza («Scaduta»). «Rinnova in asta» crea una richiesta nuova in bozza con i dati salvati, la decorrenza il giorno dopo la fine, la compagnia e il premio attuali, libretto e patente già caricati: manca solo il nuovo attestato. Il broker ha la pagina «Rinnovi» (scadenze dei prossimi 60 giorni per settimana, nuovo parametro `renewal.brokerHorizonDays`), il rinnovo automatico per cliente (la bozza la prepara il workflow, poi serve l'attestato) e l'azione in blocco per un mese. All'asta di un rinnovo l'agenzia che aveva emesso è invitata in automatico, se non è sospesa o esclusa.
- Passo 11, recesso (S08, PAG-04, PAG-05): entro `withdrawal.days` dall'emissione (nuovo parametro, 14 giorni, da validare con il legale: domanda 18) il cliente chiede il recesso da «Polizze»; l'agenzia indica il premio rimborsabile; il supervisore approva il rimborso in «Pagamenti». Poi polizza «Receduta», richiesta «Annullata», il fee resta (nessuna nota di credito), il premio rimborsato si trattiene dalla rimessa successiva dell'agenzia.
- Passo 12, questionario: pagina pubblica dal link dell'email, tre voti e «qualcuno ti ha contattato fuori da AstAx?»; un «sì» apre una segnalazione di aggiramento con la richiesta e l'agenzia, che il supervisore chiude con un esito in «Segnalazioni».
- Passo 13 (prove): E2E `S01-privato-con-ai.spec.ts` esteso fino all'emissione, alle polizze del cliente con la fattura e a «Risultati»; nuovo `S08-recesso.spec.ts`; nuova utenza di prova del supervisore del back office. Integrazione: `remittances.int`, `broker-accounting.int`, `results.int`, `renewals.int`, `withdrawal.int`, `survey.int`; worker: `PolicyWorkflow` a tempo accelerato e i passi della polizza su PostgreSQL.
- Errore trovato con le prove end-to-end e corretto alla radice: `asSystem` (il passaggio al contesto di sistema dentro una transazione) non reggeva due chiamate sovrapposte nella stessa transazione. La prima che finiva rimetteva il contesto normale mentre l'altra stava ancora leggendo, e l'ultima lasciava la transazione «di sistema» fino alla fine, cioè con più permessi del dovuto. Effetto visibile: in «Da emettere» i documenti caricati dall'agenzia a volte non comparivano e «Segna come emessa» restava bloccato. Ora il contesto si prende alla prima chiamata e si restituisce all'ultima; prova `packages/db/test/context.int.test.ts` (fallisce con il codice vecchio) e controllo aggiunto in `acceptance.int`.
- E2E: S01 completo, S02 fino alla fattura mensile e all’estratto conto del broker, S05, S08 e S09 verdi in locale. Nuove utenze di prova: supervisore del back office, titolare del broker, titolare di Agenzia Tre.
- Fattura mensile del broker: ogni polizza ricorda la fattura che l’ha fatturata (migrazione `20261019110000_policy_broker_invoice`). Prima la fattura era «una per mese»: emessa a mano a metà mese, le polizze successive non sarebbero mai state fatturate. Ora una nuova emissione fattura solo le polizze ancora fuori, anche di mesi passati.
- Serie E2E completa (24 prove) in un giro solo: 14 verdi, 6 rosse e 4 non partite. Gli errori nascevano da riavvii dei server di sviluppo e da «sessione scaduta» dopo l’accesso, non legati a file cambiati: sono gli stessi crash di Windows già visti con l’admin. Rilanciate da sole, tutte le prove rosse passano (10 su 10). Trovato però un difetto vero: la pagina «Aste» del back office faceva due letture per ogni asta (fino a 200) in una transazione di 5 secondi, e con molti dati andava in errore. Ora sono due letture raggruppate, e la pagina mostra un avviso invece di rompersi. Da tenere d’occhio la serie completa in CI.
- Scelta tecnica: le pianificazioni del lunedì e del primo del mese sono un timer del worker che segue l'orologio dell'applicazione (anche quello spostato in sviluppo), non uno «schedule» di Temporal; ripeterle lo stesso giorno non crea doppioni.
- Debiti: le fatture B create dal worker partono allo SDI quando il back office apre «Fatturazione» (l'API ha il fornitore SDI e il PDF): in fase 8 un invio automatico; l'avviso `invoice.available` non è ancora mandato; E2E di S05 e S09 e S02 fino alla fattura del broker da scrivere; il back office non ha ancora una schermata per avviare il recesso per conto del cliente (c'è l'API); i suggerimenti di «Risultati» (profili simili da aggiungere ai filtri) sono rinviati alla fase 7.

**2026-10-17 — fase 6, passi 0-4** (piano approvato da Dan il 2026-10-17 con le proposte A-F).

- Passo 0: corretti i 12 punti della verifica della fase 5 (dettaglio nella sezione «Verifica indipendente (fase 5)»).
- Passo 1, regole di calcolo (`packages/shared/src/domain`): rimessa settimanale (premio − fee agenzia − quota broker − residui − recuperi − penali, mai negativa, il resto alla settimana dopo) e il suo limite del venerdì alle 23:59; totali delle fatture con il bollo sopra soglia, numeri per serie e anno, note di credito; seconda offerta di un'altra agenzia e differenza con il fee ricalcolato; sospensione dopo 3 mancate emissioni in 6 mesi; date di fine polizza, rinnovo e questionario; la classifica vista dall'agenzia (CLA-03).
- Passo 2, tabelle (migrazione `20261019080000_after_sale`): polizze, casi di emissione, proposte di seconda offerta, penali, sospensioni, rimesse con le righe, fatture e note di credito con il contatore senza buchi, rimborsi, recessi, quote del broker, questionari, segnalazioni; regole di accesso del database con le prove.
- Passo 3, file e fornitori: file dei bonifici SEPA e fattura elettronica FatturaPA, controllati contro gli schemi ufficiali salvati nel progetto (ADR 0009, nuova libreria `xmllint-wasm`); SDI finto; rimborso nel fornitore di pagamenti finto.
- Passo 4, emissione: pagina «Da emettere» con il dettaglio (contatti, documenti firmati, ricevuta di pagamento), caricamento di polizza, quietanza e certificato in PDF, «Segna come emessa» (polizza, richiesta «Emessa», avvisi, fattura P al privato, documenti nell'area del cliente; per il cliente del broker un link nuovo con codice), «Segnala un problema» al back office; pagina «Polizze» per privato, broker e agenzia. Nel worker: promemoria, termine superato con la penale di 25 € proposta (EMI-03), mancata emissione alla decorrenza con un caso al back office (EMI-04).
- Proposta D (fattura al privato): se il contraente coincide con chi ha l'account la fattura è intestata a lui; altrimenti al titolare dell'account, ma il suo profilo non ha codice fiscale né indirizzo: la fattura resta «da completare» e non parte verso lo SDI finché il back office non completa i dati (schermata nel passo 7).
- Passo 5, mancata emissione (S05): pagina «Eccezioni» del back office, che decide di chi è la colpa. Dell'agenzia: la penale di 100 € sostituisce quella di 25 € per ritardo, l'offerta è «Mancata emissione», al cliente arriva la migliore offerta ancora garantita di un'altra agenzia con 24 ore per rispondere; conferma, firma i documenti della nuova offerta e paga solo la differenza (oppure gli restituiamo la differenza); oppure chiede il rimborso completo. Dei dati del cliente: il nuovo prezzo dell'agenzia, che il back office inserisce, da confermare allo stesso modo. Senza risposta entro le 24 ore, il rimborso completo. La terza mancata emissione in 6 mesi sospende l'agenzia dagli inviti, con l'avviso all'amministratore. Rimborsi: pagina «Pagamenti», dove solo il supervisore approva; il rimborso completo chiude la richiesta («Annullata»).
- Regola 8: tolti gli importi dagli avvisi di seconda offerta, nuovo prezzo e rimborso (domanda 15); gli importi sono nell'app.
- Prove che soffrivano il database condiviso tra i file di test: la coda dei messaggi (team) e la busta chiusa (premi usati anche da altri test); corrette.
- Debito: la seconda offerta per il cliente del broker (dal link) non è ancora fatta: oggi la vede e la decide solo il privato.
- Passo 6, penali (EMI-05) e sospensioni (EMI-06): il back office propone e il supervisore applica (in «Eccezioni»); l'agenzia contesta entro 10 giorni da «Contabilità»; l'amministratore decide (in «Organizzazioni»), dove conferma o revoca anche le sospensioni. Un'agenzia sospesa non viene più invitata alle nuove aste finché la sospensione non è revocata.
- Prossimo passo: passo 7 (rimesse del lunedì, file SEPA, fatture alle agenzie, estratto conto; completamento dei dati di fatturazione).

**2026-10-17 — fase 5, accettazione** (piano approvato da Dan il 2026-10-17 con le proposte A-I; Dan ha chiesto di andare avanti con le fasi e fare domande e demo alla fine).

- Fatto (commit su `main`, pubblicati su GitHub):
  - dominio: fee (FEE-01…03, con i casi di S09 e i 200,00 € esatti), ultimo momento utile (GAR-04), termine di emissione (EMI-01), risparmio e giorni di garanzia, punteggio del confronto AI e controllo del testo del modello;
  - dati: suggerimenti AI, link del cliente del broker, accettazioni, buste di firma, pagamenti, eventi dei fornitori (una sola volta ciascuno), indice reclami delle compagnie;
  - fornitori finti (regola 9): firma (codice 123456 in sviluppo), pagamenti (carta che finisce con 0002 rifiutata, bonifico istantaneo confermato dopo 5 secondi), spiegazione AI; webhook firmati e controllati anche nei finti;
  - privato: pannello delle offerte (migliore per compagnia, «Più conveniente», risparmio, giorni di garanzia rimasti, coperture, PDF, righe in grigio con il motivo quando non si può più accettare); «Confronta con AI» con la conferma del fee che passa da 30,00 € a 35,00 € e il riquadro «Suggerimento generato con AI»; accettazione in quattro passaggi (riepilogo con premio e fee separati, documenti, firma, pagamento) e, dopo il pagamento, l'agenzia che emette e il termine di emissione;
  - broker: «Invia al cliente» di una o più offerte; il cliente apre il link, conferma con un codice, legge, firma e paga il solo premio; niente confronto AI; il broker vede se il cliente ha aperto, firmato e pagato. Il link vale fino alla fine dell'ultima garanzia delle offerte inviate e si chiude quando il broker ne manda uno nuovo;
  - alla firma la classifica è pubblicata (CLA-02) con gli avvisi alle agenzie; al pagamento «In emissione», offerta «Vincente», le altre «Non scelta», contatti all'agenzia vincitrice, termine di emissione e promemoria nel workflow; un pagamento rifiutato riporta a «Offerte disponibili» e si può riprovare senza rifirmare;
  - agenzia: pagina «Da emettere» con i contatti del cliente (solo dopo il pagamento) e il termine;
  - back office: pagina «Indice reclami» (amministratore), ogni modifica nel registro con prima e dopo.
- Problemi trovati e corretti strada facendo:
  - i webhook veri (via HTTP) erano tutti rifiutati come non firmati: con Express 5 il filtro `/^\/webhooks\//` non scattava e il corpo arrivava già trasformato; i fornitori finti chiamavano il gestore direttamente e lo nascondevano. Ora c'è la prova di un webhook firmato mandato due volte via HTTP e gestito una volta sola;
  - dopo il pagamento la pagina dell'accettazione diceva «Non hai ancora scelto un'offerta» (l'offerta scelta diventa «Vincente» e non era più tra quelle mostrate);
  - tornando dalla pagina di firma il cliente del broker perdeva la conferma del codice (cookie legato al percorso del link);
  - due pulsanti che rimandavano alla stessa pagina non la aggiornavano.
- Prova: E2E `S01-privato-con-ai.spec.ts`, `S02-broker-acquisto-dopo-10-giorni.spec.ts`, `fase5-pagamento-rifiutato.spec.ts`; integrazione `apps/api/test/int/acceptance.int.test.ts`, `customer-links.int.test.ts`; dominio `packages/shared/src/domain/acceptance.test.ts`, `ai-comparison.test.ts`; adattatori `packages/adapters/src/signature/providers.test.ts`.
- Ambiente di sviluppo: i test di integrazione e `pnpm check` rigenerano file che l'API avviata con `pnpm dev` osserva: l'API si riavvia e, se nel frattempo girano i test end-to-end, quelli falliscono per «fetch failed». Gli end-to-end vanno lanciati a macchina ferma.
- Prossimo passo: verifica indipendente della fase 5, poi la fase 6; le demo delle fasi 2-5 e le domande 13-16 con Dan quando le fasi sono finite, come ha chiesto.

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

## Proposte approvate per la fase 7 (Dan, 2026-10-18)

A parametri che valgono da ora in poi; B Web Push finto fino alla fase 8; C riconciliazione con CSV di prova e camt.053, abbinamento per importo e codice della richiesta; D verifica RUI e OTP dell'IBAN con i fornitori finti, contratti segnaposto; E assistenza con un registro interno dei ticket, senza strumenti esterni; F esportazioni CSV semplici, da confermare con legale e commercialista; G conservazione: si cancellano documenti e dati personali, restano codice, date e registro; H libreria `fflate` per gli ZIP; I cruscotto con tabelle e barre semplici; J WhatsApp in fase 8; K testi albanesi scritti da Claude, da far rileggere a Dan; L demo alla fine.

## Criteri della fase 7

| Criterio | Prova |
| --- | --- |
| Ogni chiave dei parametri si modifica dal pannello, con validazione, motivo e storico | `settings.int.test.ts` (tutte le chiavi), `groups` test, E2E `fase7-pannelli` |
| Le aste aperte tengono i parametri dell'apertura, le nuove usano i nuovi | `settings.int.test.ts` «a change from the panel and the auctions», worker `activities.int` |
| Modelli delle notifiche: modifica, anteprima, prova; albanese; preferenze e push obbligatorie; niente doppioni | `communications.int`, `preferences.int`, `notification-dispatch.int` |
| Matrice dei permessi di back office e amministratore a tabella | `can.test.ts`, `permissions.int.test.ts` |
| Un'agenzia si registra, il back office la approva, l'agenzia riceve il primo invito | `onboarding.int`, E2E `fase7-pannelli` (domanda 19, risposta B: all'approvazione filtri larghi e orari lavorativi, invitabile subito alle aste) |
| Reclami: protocollo, scadenza, avviso a 5 giorni, esportazione | `complaints.int`, worker `schedules.int` |
| Riconciliazione: abbinamenti e coda | `reconciliation.int`, `reconciliation.test` |
| Conservazione: una richiesta non conclusa di 12 mesi fa si cancella, ed è registrata | `retention.int` (anche: 11 mesi resta, pagata resta) |
| Le esportazioni del registro attività sono registrate | `admin-reports.int` |

## Proposte approvate per la fase 8 (Dan, 2026-10-18)

Parte A, subito e in locale, senza account né spese: sicurezza nell'app (limiti di tentativi, intestazioni, eventi di Keycloak, biglietti del tempo reale in Redis); controlli automatici in CI (Semgrep, librerie, segreti, accessibilità, blocco LEG-03 e strumenti di sviluppo); coda delle email, invio automatico allo SDI, avvisi mancanti; Web Push vero e PWA; adattatori veri con test di contratto; sorveglianza; infrastruttura Terraform scritta ma non creata; prova di carico k6 in piccolo; documenti (ASVS, mappa dei dati, fornitori, incidenti, ripristino, `docs/go-live.md`); strumento di misura della lettura AI. Parte B, con gli accessi di Dan nell'ordine del file della fase: AWS (con stima dei costi prima di creare), domini, sandbox, documenti anonimi, test di sicurezza esterno, collaudo.

A nessuna risorsa cloud e nessuna spesa senza il «crea» di Dan; B Temporal Cloud in UE; C SMS con AWS (alternativa Skebby); D Sentry UE e Grafana Cloud UE; E soglia della lettura AI al 95% dei campi corretti sopra soglia; F i limiti di tentativi nei parametri; G prova di carico vera in collaudo, qui solo in piccolo; H WhatsApp spento, solo la porta.

## Fase 8: stato dei criteri

| Criterio | Parte A (fatto) | Parte B (con gli accessi di Dan) |
| --- | --- | --- |
| S01-S10 in collaudo con le sandbox vere, rapporto in `docs/collaudo/` | S01-S10 verdi in locale e in CI con i finti | Collaudo |
| Test di contratto per ogni adattatore vero | Suite in `packages/adapters/src/contracts` (finto, vero simulato; sandbox saltate) | Con le chiavi delle sandbox; Namirial, Fabrick, RUI da scrivere |
| Il ruolo dell'API non decifra la chiave delle buste; controllo notturno e allarme | Prova Terraform `bc03_only_the_worker_decrypts_the_sealed_bids`; controllo notturno e allarme provati (`schedules.int.test.ts`) | Prova dal vivo in collaudo |
| Test di sicurezza esterno senza problemi alti o critici; ZAP | `docs/sicurezza/asvs.md`, Semgrep, Gitleaks, audit librerie puliti | Società esterna, ZAP sul collaudo |
| Carico: chiusura entro 5 s, p95 < 300 ms, nessun errore | Script k6 e misura delle chiusure; prova piccola superata dopo la correzione | Prova vera in collaudo |
| Ripristino dai backup provato | Backup nel Terraform, procedura in `docs/ripristino.md` | Prova in collaudo |
| Lettura AI ≥ 95% sopra soglia | Strumento di misura | Gli 80 documenti di Dan e l'accesso a Bedrock |
| La pipeline di produzione si ferma con testi legali non validati o strumenti di sviluppo | `pnpm release:check` nel rilascio di produzione | — |

## Verifica indipendente (fase 8, parte A)

Il revisore (agente verificatore) ha trovato 21 punti; corretti tutti quelli che riguardano il codice:

- «fattura disponibile» ripetuta a ogni giro se lo SDI non risponde: ora la copia e l'avviso partono una volta, l'invio allo SDI è un passo a parte con un turno per fattura e la POST non si ripete mai da sola (prova `invoice-delivery.int.test.ts`); confronto del segreto del webhook in byte; rifiuti registrati nel log;
- il blocco della produzione non vedeva firma, pagamenti e RUI finti: ora ogni fornitore deve essere nominato e vero (`REQUIRED_PROVIDERS`), con prova Terraform che API e worker hanno gli stessi fornitori controllati;
- amministrazione di Keycloak raggiungibile da internet: chiusa sul bilanciatore, API e worker usano il nome privato;
- la policy della chiave delle buste si poteva riscrivere (`kms:Put*`): ora no, con prova; ruolo di rilascio ristretto (solo il compito «tools», solo ruoli passati a ECS) e rilascio solo da `main` con CI verde;
- le immagini di API e worker non trovavano i testi delle notifiche: corretto e provato (l'immagine parte e risponde);
- telemetria: escono solo metodo, stato e percorso con identificativi mascherati; nessun IP, user agent, token o chiamata in uscita (prova `telemetry.test.ts`);
- lavori del worker doppi con due istanze: ora sotto un turno (`withLease`, prova); finestra di CloudTrail con 30 minuti di ritardo; eventi di Keycloak letti pagina per pagina (prova);
- coda dei messaggi: una transazione per messaggio, tempi massimi sulle chiamate AWS;
- iscrizioni push solo verso i servizi push dei browser (SSRF, prova); chiavi dei limiti con HMAC; un token valido non è mai bloccato per l'indirizzo, prova del proxy fidato;
- errori di decifratura delle copie delle offerte registrati (`OFFER_OWNER_COPY_UNREADABLE`); `/openapi.json` solo fuori produzione; Gitleaks esclude solo i file di prova, storia pulita; il prompt non scrive la soglia (regola 7).

Restano come rischi accettati, scritti in `infra/terraform/README.md`: la pipeline come via fidata per il codice, la password di Redis nello stato di Terraform. Numeri tecnici (attese della coda, durata degli eventi di Keycloak) restano nel codice: non sono regole di business.

## Verifica indipendente (fase 7)

Il revisore (agente verificatore) ha trovato 14 punti. Corretti nel commit `a68835b`: la conservazione poteva cancellare richieste annullate con firma e pagamento; ricerche di clienti e utenti con nome, codice fiscale o email nell'indirizzo della pagina; mancava il test «modifica dal pannello e istantanea delle aste»; la seconda presentazione dopo un'integrazione non avvisava il back office (doppione); approvazione dell'ingresso non sicura se Keycloak cade; date delle esportazioni e scadenze di reclami e richieste sui dati in UTC invece che in giorni di Roma; CSV aperti a formule; importi contabili con decimali; permesso del caricamento in blocco; limite di righe nel codice; `fflate` non annotata nell'ADR 0001; debiti con scadenza «fase 7» senza nuova data. Restano: l'iscrizione al Web Push dal browser (fase 8, con le chiavi vere) e il significato di «primo invito» (domanda 19).

## Demo per Dan (fase 7)

Prima: `pnpm infra:up`, `pnpm dev` (come per le fasi precedenti). Utenze: amministratore Paola Ricci, supervisore del back office Ilaria Volpe, verificatrice Arta Hoxha (in albanese).

1. **Amministratore, parametri.** http://localhost:3001 → «Regole d'asta» → «Durata predefinita dell'asta»: nuovo valore 5, motivo, «Salva»; «Storico» mostra la versione. «Economia» → «Fee del privato» 31,00 → poi rimetterlo a 30,00.
2. **Comunicazioni.** «Comunicazioni» → un evento → cambia un testo, anteprima in italiano e albanese → «Inviami una prova» (l'email arriva in Mailpit, http://127.0.0.1:8025).
3. **Ingresso di un'agenzia.** Sul sito http://localhost:3000 → «Non sei ancora su AstAx? Chiedi di entrare» → RUI `A000000101`, «Agenzia Undici», compagnie Alfa e Gamma; il codice SMS è in Mailpit; si carica un PDF qualsiasi come polizza; si accettano i contratti. Nel pannello, con il supervisore: «Ingressi» → controllo RUI → «Approva».
4. **Back office in albanese.** Con Arta, «Shqip» in alto: «Ankesat» (reclami) → registra un reclamo arrivato per PEC → rispondi. «Pagamenti» → «Riconciliazione»: si carica un CSV di prova (prima riga `data;valuta;importo;divisa;controparte;causale;riferimento`, una riga con il codice di una richiesta pagata e il suo importo) e la riga si abbina da sola.
5. **Altro da guardare.** Cruscotto (pagina iniziale), «Clienti», «Assistenza», «Agenzie e broker», «Elenchi e festività», «Contratti e documenti legali», «Integrazioni», «Report».

## Verifica indipendente (fase 6, secondo giro)

2026-10-18, agente verificatore sulle correzioni del primo giro. `pnpm check` verde. Problemi trovati e correzioni:

1. Il worker trattava ancora l'agenzia colpevole come quella che deve emettere, mentre il rimborso era in attesa. Partivano l'avviso, la penale per ritardo e un nuovo caso alla decorrenza; il back office poteva decidere una seconda volta, con una seconda penale da 100 € contata per la sospensione. **Corretto**: niente passi per un'offerta «Mancata emissione», e nessuna decisione su un'offerta che non è più quella da emettere. Prove nel worker (fallisce con il codice vecchio) e in `second-offer.int`.
2. Restava un'ultima lettura «di sistema» in parallelo a quelle normali (`acceptance.service`). **Corretto**.
3. Pianificazioni senza prova. **Aggiunta** `apps/worker/test/int/schedules.int.test.ts`: il recupero del lunedì e del mese prima, una sola volta. Corretto anche il testo dell'ADR 0010.
4. Rinnovi in blocco senza prova. **Aggiunta**: solo i rinnovi già aperti, il conteggio di quelli non ancora aperti e la lettura nel registro.
5. Registro degli accessi negati non provato per penali e fatture. **Aggiunte** le prove. Per le fatture il tentativo non arrivava nemmeno al registro, perché il database nascondeva la riga prima: ora è registrato.
6. La colonna nuova delle fatture B non era riempita per le fatture già emesse e non aveva una chiave esterna. **Corretto** con la migrazione `20261019120000_policy_broker_invoice_backfill`. La riga della fattura ora dice «fino al mese».
7. Il bollo della fattura A si calcolava con i parametri del giorno della revisione. **Corretto**: usa quelli della preparazione della rimessa, come la trattenuta. Manca ancora una prova che cambi il parametro tra le due date.
8. «Risultati»: **aggiunta** la prova del tempo medio di emissione. I limiti di lettura (1000 offerte, 5000 inviti) restano: da rivedere con le statistiche complete della fase 7.
9. Questionario: **aggiunte** la prova di due invii contemporanei (una risposta, una segnalazione) e la scadenza in giorni di calendario di Roma.
10. E2E rispetto agli scenari: S05 non arriva all'emissione di Tre né alla penale applicata e trattenuta, S01 non arriva alla rimessa con i numeri dello scenario, e il termine di emissione dopo la seconda offerta non è controllato da nessuna prova. Sono punti aperti per la chiusura con Dan; le parti mancanti sono coperte dalle prove di integrazione con dati generici.

## Verifica indipendente (fase 6, primo giro)

2026-10-17, agente verificatore su tutto il codice della fase 6. Esito e correzioni:

1. Un'agenzia giudicata colpevole della mancata emissione poteva ancora leggere i contatti, emettere la polizza e aprire un nuovo caso finché il rimborso non era approvato. **Corretto**: dopo «Mancata emissione» l'agenzia non vede più la richiesta (404 nel registro); prova in `second-offer.int`.
2. Con la correzione di `asSystem`, una query normale in parallelo a una «di sistema» girava anche lei come sistema. **Corretto**: nei sei punti trovati le letture di sistema non sono più in parallelo con le altre; la regola è scritta nel commento di `asSystem`.
3. Accessi negati non registrati nei servizi nuovi (recessi, penali, fatture, rinnovi). **Corretto**: ora c'è `ACCESS_DENIED` nel registro, con le prove tra organizzazioni diverse.
4. La fattura A all'agenzia prendeva il fee dal parametro del giorno della revisione, non da quello trattenuto nella rimessa. **Corretto**: le righe della fattura vengono dalle righe della rimessa.
5. Bollo e quota del broker non trattenuti per mancanza di capienza andavano persi. **Corretto**: si riportano alla settimana dopo come «da trattenere», prima dei debiti più vecchi; prova in `remittances.int`.
6. Pianificazioni senza ADR e senza recupero dei giorni persi. **Corretto**: ADR 0010; se il worker è fermo il lunedì o il primo del mese, recupera appena riparte.
7. «Risultati» senza scarto medio e tempo medio di emissione. **Aggiunti**.
8. Permessi: il recesso usava un permesso di lettura; il supervisore con la contabilità non poteva scaricare le fatture che vede. **Corretto**: nuovo permesso `withdrawal.request`; `invoice.viewOwn` anche al supervisore con `canSeeAccounting`; `docs/permessi.md` aggiornato.
9. Questionario: link senza scadenza, due invii contemporanei potevano creare due segnalazioni. **Corretto**: nuovo parametro `survey.linkValidDays` (30) e riga bloccata durante la risposta. Resta il debito: se l'email del questionario non parte, non si rimanda.
10. Rinnovi del broker: l'azione in blocco non rispettava i 30 giorni, una transazione sola per tutte le polizze, lettura dei nomi dei clienti non registrata. **Corretto**.
11. CSV del broker con aritmetica in virgola mobile. **Corretto**: solo interi.
12. Punti aperti, da decidere o da fare:
    - la quota del broker si calcola sul premio lordo, mentre il parametro si chiama `percentOfNetPremium`: da chiarire con Dan e il legale (la quota oggi è spenta);
    - manca una prova di integrazione con la quota del broker accesa e una con natura e dicitura cambiate nei parametri;
    - il fee dell'agenzia non è «fotografato» all'apertura dell'asta come il fee del broker: se il parametro cambia, vale quello del giorno della preparazione della rimessa;
    - debiti già annotati: seconda offerta per il cliente del broker, avviso `invoice.available`, invio automatico allo SDI delle fatture B.

## Criteri della fase 5

| Criterio | Stato | Prova |
| --- | --- | --- |
| S01 fino al pagamento confermato: presentazione, confronto AI, scelta libera, firma, classifica pubblicata, 555,00 €, contatti ad Agenzia Uno, termine alle 16:30 | Fatto | E2E `S01-privato-con-ai.spec.ts` (dalle schermate, con le offerte inviate dalle agenzie); `acceptance.int.test.ts` (con gli orari esatti di S01: Uno 3ª su 5, termine alle 16:30 in `acceptance.test.ts`, «EMI-01 S01…») |
| Test del fee con S09 e i 200,00 € esatti | Fatto | `packages/shared/src/domain/acceptance.test.ts` («FEE-02 S09…», «FEE-02 S09 exactly 200,00 €…», «FEE-03 S09…») |
| Confronto AI: 403 a broker e link; suggerimento salvato con pesi, dati, punteggi, modello, versione del prompt e testo; testo di riserva se il controllo fallisce | Fatto | `acceptance.int.test.ts` («PRES-06 the AI comparison is for privates only», «PRES-06 PRES-08 FEE-01…», «PRES-08 a model text that fails the check…»); il link non ha alcun indirizzo per il confronto (`customer-links.int.test.ts`, «FEE-03 with the code…» senza fee con AI) |
| Pagamento rifiutato: torna a «Offerte disponibili» e si riprova; webhook duplicato senza effetti doppi | Fatto | E2E `fase5-pagamento-rifiutato.spec.ts`; `acceptance.int.test.ts` («PAG-03…», «PAG-02 the same signed webhook twice…») |
| Link del broker con codice, scadenza con la garanzia; S02 fino al pagamento | Fatto | E2E `S02-broker-acquisto-dopo-10-giorni.spec.ts`; `customer-links.int.test.ts` (prova falsa rifiutata, solo le offerte inviate, scadenza alle 23:59 dell'ultima garanzia, nessun codice dopo) |
| Documenti firmati ed evidenze salvati; MUP con le parti e i compensi giusti; segnaposto legali fuori dalla produzione | Fatto | `acceptance.int.test.ts` («PRES-05 LEG-05…» legge il PDF: AstAx, Agenzia Uno, Compagnia Alfa, 520,00 €, 35,00 €, «[DA VALIDARE — LEGALE]»; «LEG-05 CLA-02…»: due documenti firmati e la prova della firma salvati) |
| GAR-04: dopo l'ultimo momento utile l'API rifiuta l'accettazione | Fatto | `acceptance.int.test.ts` («GAR-04 past the last useful moment…»); `acceptance.test.ts` (giovedì 19/11 alle 15:00) |
| Contatti all'agenzia vincitrice solo dopo la conferma del pagamento (prima e dopo) | Fatto | `acceptance.int.test.ts` («PAG-03…» prima, «PAG-02 EMI-01 S01…» dopo), `customer-links.int.test.ts` |

## Verifica indipendente (fase 5)

Primo giro, 2026-10-17: 12 punti. Corretti il 2026-10-17 (passo 0 della fase 6, approvato da Dan):

- 1: con un bonifico in arrivo non si cambia offerta («C'è un pagamento in arrivo»); cambiando offerta il pagamento aperto viene chiuso presso il fornitore e non si può più pagare; il link nuovo del broker non può pagare la scelta firmata da un link precedente;
- 2: il token del link è tolto dai log (anche quello del link di consenso) e non va più ai fornitori: tornano a `/offerta/ritorno/{id del link}` e la pagina trova il token nel cookie di chi ha messo il codice; niente targa nell'email/SMS dell'offerta né prima del codice;
- 3: alla fine delle garanzie decade anche l'accettazione firmata dopo un pagamento rifiutato. «Abbandonato» (PAG-03) vale come: il cliente sceglie un'altra offerta, oppure finiscono le garanzie; nessun timer in più;
- 4: la conferma immediata del bonifico di prova risponde solo con `DEV_TOOLS=true`;
- 5: la migliore per compagnia si calcola sempre su tutte le offerte: il broker non può inviare un'offerta che non sia la migliore della sua compagnia;
- 6: domanda 17 per Dan, con il valore prudente;
- 7: il compenso è mostrato offerta per offerta quando non è uguale per tutte (anche nella conferma del confronto AI); l'API vuole la conferma esplicita dell'aumento (`feeIncreaseAccepted`);
- 8: il broker non riceve più gli indirizzi di firma e pagamento del suo cliente;
- 9: una firma rifiutata o scaduta fa decadere l'accettazione: il cliente sceglie di nuovo e riceve una busta nuova;
- 10: la prova sbagliata sul link è nel registro (`ACCESS_DENIED`, senza il token); il webhook di firma blocca la richiesta come accettazione e pagamento;
- 11: tolte le voci doppie del registro; `offer.won.bo` anche al supervisore; la scadenza del cookie viene dall'API. Restano: il testo di `offer.won` (documenti firmati e ricevuta in «Da emettere» arrivano col passo 4 della fase 6), il set dei documenti per canale nel codice (LEG-05 «configurabile», fase 7), i testi italiani dentro i PDF del firmatario finto (documenti di prova, non interfaccia);
- 12: prove nuove: GAR-04 anche al pagamento; contatti assenti prima del pagamento anche nel dettaglio della richiesta per l'agenzia e nelle notifiche di tutte le agenzie; webhook di firma e di incasso mandati due volte via HTTP e gestiti una volta; termine di emissione alle 16:30 calcolato dall'API; Cinque «1ª su 5»; dati usati e testo nel suggerimento AI; link senza prova, revocato e scaduto all'accettazione e al pagamento; checkout chiuso; bonifico in arrivo.

Trovata anche la causa del test che falliva «una volta sola»: i file di test condividono il database e la prova prendeva la prima notifica di classifica di Agenzia Uno, anche di un'altra richiesta; ora filtra per richiesta. Stessa causa per la prova della busta chiusa, che ora usa premi che nessun altro test usa.

1. Possibile doppio incasso: si può cambiare offerta con un pagamento aperto (bonifico in attesa); il link nuovo del broker può pagare l'accettazione firmata dal link precedente.
2. Dati sensibili: il token del link finisce nei log delle richieste e negli indirizzi di ritorno dati ai fornitori; la targa è nell'email/SMS `offer.link_to_client` e si vede prima del codice.
3. PAG-03 e decisione 22 solo in parte: pagamento abbandonato non gestito; dopo un rifiuto l'accettazione firmata resta viva anche dopo la scadenza delle garanzie.
4. Regola 13: la conferma immediata del bonifico di prova non è legata a `DEV_TOOLS`.
5. PRES-02: il broker può inviare un'offerta che non è la migliore della sua compagnia; il cliente firma e poi il pagamento fallisce.
6. CLA-02 e decisione 32: la classifica pubblicata alla firma resta pubblica se poi il pagamento fallisce e arriva una riconferma (domanda per Dan).
7. Fee nell'interfaccia: un solo fee mostrato per tutte le righe (sbagliato con offerte a cavallo dei 200 €).
8. Il broker riceve l'indirizzo di firma del suo cliente e potrebbe firmare al suo posto.
9. Firma rifiutata o scaduta: il cliente resta bloccato sulla stessa busta.
10. Registro: la prova sbagliata sul link non è registrata; il webhook di firma non blocca la richiesta.
11. Minori: voci doppie nel registro, testo di `offer.won`, set dei documenti scritto nel codice, testi italiani nel firmatario finto, destinatari di `offer.won.bo`.
12. Prove deboli: GAR-04 al pagamento, contatti «prima» del pagamento (anche telefono e notifiche), webhook duplicato sul primo incasso e sulla firma, link scaduto o revocato all'accettazione e al pagamento, termine delle 16:30 a livello di API.

## Demo per Dan (fase 5)

Prima: Docker Desktop acceso; in PowerShell, nella cartella `C:\Users\clien\Searches\astax`, `pnpm infra:up`, `pnpm install`, `pnpm db:migrate` (tabelle nuove della fase 5), `pnpm db:seed`, poi `pnpm --filter @astax/ui build` e `pnpm dev`. Password e codici come nelle demo precedenti; il codice della firma di prova è sempre 123456.

1. **Le offerte di Giulia (dal telefono).** Giulia invia una richiesta, il back office la approva; in «Aste» premi «Invia 3 offerte di prova» e «Fai scattare il prossimo passo» fino a «Chiusa». Giulia apre il preventivo: una riga per compagnia, «Più conveniente», il risparmio sul premio attuale, i giorni di garanzia rimasti, le coperture, il PDF; nessun nome di agenzia.
2. **Confronto con AI.** Premi «Confronta con AI»: la pagina dice che il compenso passa da 30,00 € a 35,00 €; conferma. Compare il riquadro «Suggerimento generato con AI».
3. **Scelta, firma, pagamento.** Scegli un'offerta qualsiasi (anche non la più bassa): riepilogo con premio e compenso separati, documenti (informativa precontrattuale, lettera di incarico, set informativo), «Firma i documenti» → codice 123456 → «Paga» → carta `4242 4242 4242 4242`. Giulia vede «Pagato», l'agenzia che emette e il termine. Per vedere il rifiuto, usa prima una carta che finisce con 0002: il pagamento non va e si può riprovare.
4. **L'agenzia (dal computer).** Entra come titolare dell'agenzia vincitrice: in «Da emettere» c'è la richiesta con email e telefono del cliente e il termine di emissione.
5. **Il broker.** Paolo crea una richiesta per un cliente con la sua email; dopo la chiusura, nel dettaglio spunta un'offerta e preme «Invia al cliente». Il cliente apre il link dalla mail (in Mailpit, http://localhost:8025), chiede il codice, lo inserisce, sceglie, firma e paga il solo premio (nessun compenso). Paolo vede «Il cliente ha pagato».
6. **Indice reclami.** Come amministratore (`paola.ricci@astax.test`) nel back office apri «Indice reclami» e inserisci un valore inventato per una compagnia: la modifica è nel «Registro delle attività».

## Criteri della fase 4

| Criterio | Stato | Prova |
| --- | --- | --- |
| Scenari S03, S06 (end-to-end) e S10 | Fatto | E2E `S03-riconferma.spec.ts`, `S06-parita.spec.ts`, `S10-sub-agente-due-agenzie.spec.ts`. S03 con le risposte dalle schermate delle agenzie: Uno conferma lo stesso premio, Tre lo aggiorna con un PDF nuovo, Cinque rinuncia; il cliente vede solo Alfa e Gamma. Le scadenze esatte di S03 (24 ore lavorative, garanzia minima, solo le agenzie dell'ultimo giro, busta chiusa) sono provate in `apps/worker/test/int/activities.int.test.ts` e `apps/api/test/int/reconfirmation.int.test.ts` |
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

- domanda 16 per Dan: cosa fare quando il back office esclude l'ultima offerta rimasta;

Secondo giro, 2026-10-17: dei 17 problemi 7 risolti, 8 in parte, 2 rinviati (replay e domanda 16), più un problema nuovo. Corretti:

- nuovo: una richiesta «Scaduta» con una riconferma chiesta ma non più ammessa (parametro abbassato nel frattempo) restava in attesa per sempre: ora la richiesta in sospeso conta solo entro `reconfirmation.maxPerRequest`;
- l'affidamento a un collega riconosceva ancora come «lavora per un'altra agenzia» qualunque errore: ora il salvataggio intermedio sta dentro il passo di sistema e solo l'indice unico vale come conflitto (test nel pacchetto del database);
- il PDF per l'agenzia ora è un documento nuovo con solo le pagine disegnate: niente metadati, campi di modulo, annotazioni o allegati del file del cliente; il test lo verifica anche sui byte;
- una conferma senza PDF nuovo deve avere anche le stesse coperture e note; anche la modifica successiva senza PDF è rifiutata (test);
- l'avviso di esclusione non contiene più il motivo scritto dal back office (regola 8): il motivo si legge in «Le mie offerte»;
- i giorni del cruscotto contano giorni di calendario di Roma; l'attesa del segnale di riconferma è una costante tecnica con il suo commento;
- rifiuti registrati anche per il cruscotto e l'elenco dell'area agenzia;
- nel «Team» la colonna si chiama «Ultima attività in questa organizzazione», perché è quello che mostra.

Dopo il secondo giro: `pnpm check` verde (36 compiti; due giri interrotti da un crash di Windows all'avvio dei test del database, che da soli passano 63 su 63) e E2E 18 su 18.

Restano: il test «ogni endpoint» controlla le risposte GET e non quelle delle azioni; la lettura del registro per la colonna del «Team» non è a sua volta registrata.

Dopo i due giri, 2026-10-17:

- S03 end-to-end con le risposte vere delle agenzie dalle schermate (conferma, aggiornamento con PDF nuovo, rinuncia), senza prezzi visibili a nessuno durante il giro;
- prova di «replay»: `apps/worker/test/replay.test.ts` rilegge con il codice attuale 11 storie di workflow registrate con il codice della fase 3 (aste deserte concluse e richieste ancora nelle garanzie), esportate da `apps/worker/scripts/export-histories.ts` senza il nome del computer; con un workflow modificato apposta il test fallisce, quindi la prova funziona. Nuova dipendenza di sviluppo `@temporalio/proto` 1.24.0 (già presente come parte di Temporal), per leggere le storie;
- il test fragile di `fase4-agenzia.spec.ts` non si è più ripresentato nei giri completi successivi.

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
| L'elenco RUI è finto; l'adattatore vero (dati aperti IVASS) manca | Regola 9 | Fase 8, parte B: il formato delle colonne del file IVASS va visto su un file reale |
| I requisiti di un pacchetto si modificano come testo JSON (controllato) | Una scheda con i campi è più comoda per l'amministratore | Dopo la demo, se Dan la chiede |
| I ticket di assistenza si aprono a mano dal back office; le email in arrivo non creano ticket da sole | Proposta E: registro interno, nessuno strumento esterno | Dopo il lancio, se Dan lo chiede (servirebbe la ricezione delle email con SES) |
| Dalla «Deserta» il back office non può ancora aprire una nuova asta (S04) | La riapertura automatica con filtri allargati c'è (ASTA-08); la fase 7 mostra le deserte in «Eccezioni». Una nuova asta a mano con filtri scelti dal back office aspetta una decisione di Dan su quali filtri allargare | Dopo la demo |
| Filtri, capacità, orari di ricezione e prodotti delle agenzie impostati solo dai dati di prova | Le schermate delle agenzie sono della fase 4 (proposta D approvata) | Fase 4 |
| Avviso «Nuova richiesta in target» a tutti i membri attivi dell'agenzia, anche con la distribuzione per filtri personali | La scelta dell'agenzia rispetta i filtri dei membri; i destinatari dell'avviso no | Fase 4, con le schermate dell'agenzia |
| `KmsEvent` come registro delle chiavi al posto di CloudTrail | Nessun KMS vero in sviluppo (ADR 0005) | Fatto in parte (fase 8): il controllo notturno legge anche CloudTrail (`CloudTrailKmsEvents`); da provare in collaudo |
| Il richiedente non può annullare una richiesta con l'asta aperta | Solo il back office annulla un'asta aperta (domanda 13, risposta B: la richiesta va in «Annullata») | Se Dan lo chiede |
| Colonna `Verification.excludedAgencies` della fase 2 non usata | Le esclusioni dall'anteprima stanno in `InvitationExclusion` | Alla prossima migrazione che tocca la tabella |
| I test dei workflow scaricano il server di test di Temporal la prima volta | Senza rete quei test falliscono, non passano in silenzio | — |
| Offerte di prova degli strumenti di sviluppo con il primo prodotto dell'agenzia e coperture del pacchetto Completo | Bastano alle demo | — |
| TypeScript 6.0 invece di 7.0 | typescript-eslint non supporta ancora la 7 | Quando esce il supporto |
| Codice di accesso via SMS; SMS veri | Serve il fornitore SMS; oggi gli SMS finiscono in Mailpit | Fatto in parte (fase 8): adattatore `AwsSmsSender`; mancano il mittente registrato e la sandbox (parte B) |
| `RuiRecord.linkedNumber` da trasformare in elenco | Un sub-agente può lavorare per più agenzie (dubbio 10) | Fasi 3-4 |
| Keycloak segnala «già autenticato come un altro utente» su un computer condiviso senza «Esci» | Sessione Keycloak rimasta nel browser; non fatto in fase 2 | Con `prompt=login` nelle app, fase 7 |
| Client dell'API generato da OpenAPI per i frontend | La descrizione OpenAPI non contiene ancora gli schemi dei corpi (gli input sono validati con Zod): un client generato oggi avrebbe solo i percorsi. I tipi delle risposte sono scritti a mano in `apps/web/src/lib/requests.ts` e `apps/admin/src/lib/verification.ts` | Fase 4, pubblicando gli schemi Zod in OpenAPI |
| TanStack Query, React Hook Form, PWA con Serwist e Web Push | I moduli della fase 2 usano le azioni del server di Next.js, che funzionano anche senza JavaScript; il controllo dei campi lo fa l'API | Web Push e app installabile fatti senza Serwist (ADR 0011); TanStack Query e React Hook Form non servono finché i moduli usano le azioni del server |
| Procedura del privato a passi con più domande per schermata, non «una domanda per schermata» | Sei passi, ognuno salva una parte completa della bozza | Da rivedere con Dan dopo la demo |
| Correzione del back office su un gruppo di campi (veicolo, classe CU, compagnia, scadenza) | Gli altri dati si correggono chiedendo un'integrazione | Dopo la demo, se Dan la chiede |
| Motivi di esclusione solo dall'elenco dei casi esclusi | Nessun «altro» con testo libero | Da decidere con Dan |
| Procedura con al massimo due conducenti | Bastano per i casi del pilota | Quando serve |
| Archivio documenti del privato: una chiamata all'API per ogni richiesta | Pochi preventivi per persona | Quando cresce, con un endpoint unico |
| Dashboard del broker con i contatori | Non era nel piano della fase 2 | Dopo la demo, se Dan la chiede |
| Approvazione automatica (`verification.autoApproveGreen`, spenta nel pilota) in una transazione separata dopo l'invio, nell'API | Serve il ruolo di sistema; se fallisce la richiesta va al back office con la notifica. L'apertura dell'asta parte comunque dall'evento `RequestApproved`, consegnato dal worker | Quando si accende nel pilota |
| Ricerche (codice fiscale, targa) tenute in chiaro sul server (Redis) per 15 minuti accanto alla sessione, legate al contesto attivo e cancellate con «Esci» | Non devono finire nell'indirizzo della pagina (regola 8) | Fase 8, cifrandole con la chiave dei campi |
| Guscio delle schermate duplicato tra `apps/web` e `apps/admin` | Piccole differenze (contesto, lingua) | Quando cresce, in `packages/ui` |
| Eccezione alla regola pnpm sull'età minima dei pacchetti per Next.js 16.4.1 e React 19.3.1 | Correggono vulnerabilità critiche | Da togliere appena superano l'età minima |
| Testi in albanese del back office da far rileggere a un madrelingua | Tradotti da Claude (anche quelli nuovi della verifica) | Prima del lancio: rilettura di Dan o di un madrelingua (proposta K), compresi i testi nuovi della fase 7 |
| IP vero del browser solo dietro il nostro proxy (`WEB_TRUSTED_PROXY`); in locale si registra l'indirizzo dell'app web | L'intestazione X-Forwarded-For può essere falsificata dal browser | Fatto in parte (fase 8): `API_TRUST_PROXY` e `WEB_TRUSTED_PROXY` impostati nel Terraform; da provare in collaudo |
| Comuni soppressi non presenti in `seed/comuni.csv` (solo i comuni attuali) | Il codice fiscale di chi è nato in un comune poi soppresso non trova il comune: la procedura chiede di scrivere all'assistenza, il controllo automatico non confronta il luogo | Fase 8, con l'elenco ISTAT dei comuni soppressi |
| Etichetta della formula esperta in `seed/elenchi.json` con «26 anni» scritto nel testo | La schermata mostra anche l'età minima presa dal parametro, ma l'etichetta dell'elenco va aggiornata a mano se cambia | Fatto in parte (fase 7): l'etichetta ora si cambia dal pannello «Elenchi e festività», senza toccare il codice |
| `S3_REGION` e `S3_BUCKET` nuovi in `.env.example` | `pnpm env:init` non riscrive un `.env` esistente: l'API usa valori predefiniti se mancano | — |
| Rimborso di un pagamento incassato per un'accettazione non più valida (pagamento arrivato dopo la fine della garanzia) | Solo registrato; il rimborso con il fornitore è del dopo-acquisto | Fase 6 |
| Pagina «Risultati» delle agenzie con la classifica | La classifica è calcolata e pubblicata alla firma; la pagina è della fase 6 | Fase 6 |
| Un incasso arrivato per un'accettazione non più valida (checkout già chiuso presso un fornitore vero) è solo registrato | Con il finto non può succedere; il rimborso automatico è nel passo 11 della fase 6 | Fase 6 |
| Il link di consenso del broker (fase 2) mette la targa nell'email | Il link dell'offerta non la mette più; quello del consenso è della fase 2 | Con la risposta alla domanda 15 |
| L'API accetta un secondo «Confronta con AI» sulla stessa richiesta (nuovo suggerimento salvato, fee invariato) | La schermata nasconde il pulsante dopo il primo uso | Da decidere con Dan se bloccarlo |
| Nessun valore di prova nell'indice reclami | Il confronto lo considera neutro finché manca; i valori si inseriscono dalla pagina | Con i dati veri, da Dan |
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
| 0009 | [File SEPA e fatture elettroniche: formato e controllo](adr/0009-file-sepa-e-fatture-elettroniche.md) | 2026-10-17 |
| 0010 | [Pianificazioni del lunedì e del primo del mese](adr/0010-pianificazioni-del-worker.md) | 2026-10-17 |
| 0011 | [Web Push e app installabile senza Serwist](adr/0011-web-push-e-pwa.md) | 2026-10-18 |
| 0012 | [Temporal Cloud nella regione UE](adr/0012-temporal-cloud.md) | 2026-10-18 |
