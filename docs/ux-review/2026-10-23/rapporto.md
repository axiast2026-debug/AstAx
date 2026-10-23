# Revisione UX di AstAx — 23 ottobre 2026

Ramo `ux/revisione-2026-10-23`. Mandato di Dan: meno passaggi, funzioni che tolgono fatica, estetica coerente con il sistema visivo; corsia A implementata, corsia B proposta. Regola superata rispetto al mandato: il back office è **solo in italiano** (ADR 0017 del 22 ottobre): nessun testo in albanese è stato aggiunto o mantenuto.

## 1. In cinque righe

1. **Tredici flussi misurati prima e dopo** (schermate, tocchi, campi, scelte, file, tempo stimato, axe a 390 e 1440 px): le schermate non cambiano, perché i passaggi che restano sono quelli obbligatori o del servizio; cambiano fatica e chiarezza.
2. **Meno da scrivere e da guardare:** campi visibili sul percorso del privato 39 → 32, del broker 51 → 42, dell'agenzia 67 → 47; la data di nascita non si scrive più (3 → 2 campi scritti per il privato, 8 → 7 per il broker); l'emissione passa da 9 a 6 tocchi.
3. **Ripresa e feedback:** una bozza si riapre al passo giusto; «Scegli questa offerta» dice che sta preparando i documenti; i PDF dell'emissione partono alla scelta.
4. **Estetica e accessibilità:** pagina di accesso nei colori AstAx; pannello del broker e pagina del cliente nel nuovo design; aree da 44 px, bordi 3:1, un h1 per pagina; axe «dopo» senza alcuna segnalazione su 72 schermate (prima: 8, tutte «page-has-heading-one»).
5. **Dieci proposte di corsia B** (link magico nell'email del codice, codice automatico per il cliente del broker, offerta senza presa in carico esplicita, dati dalla targa, approvazione automatica delle verdi…) e cinque domande per Dan. Il controllo indipendente non ha trovato bloccanti; le sue correzioni sono applicate.

### Numeri prima e dopo per ogni flusso

| Flusso | Schermate | Tocchi | Campi scritti | Scelte | File | Campi visibili in tutto | Tempo stimato | Problemi axe |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Privato: dalla prima visita alla richiesta inviata | 13 | 13 | 3 → **2** | 2 | 3 | 39 → **32** | 112 s → **109 s** | 2 → **0** |
| Privato: asta in corso | 2 | 0 | 0 | 0 | 0 | 0 | 6 s | 1 → **0** |
| Privato: apertura, confronto AI, scelta, firma, pagamento | 8 | 7 | 2 | 1 | 0 | 3 | 52 s | 0 |
| Privato: polizza emessa | 2 | 0 | 0 | 0 | 0 | 0 | 6 s | 1 → **0** |
| Privato: prezzi scaduti e riconferma | 2 | 1 | 0 | 0 | 0 | 0 | 8 s | 0 |
| Privato: integrazione chiesta | 3 | 2 | 0 | 0 | 0 | 9 | 12 s | 1 → **0** |
| Broker: richiesta per un cliente nuovo | 12 | 13 | 8 → **7** | 1 | 3 | 51 → **42** | 139 s → **133 s** | 1 → **0** |
| Broker: confronto e invio al cliente | 3 | 1 | 0 | 1 | 0 | 6 → **4** | 13 s | 0 |
| Cliente del broker: dal link al pagamento | 6 | 7 | 3 | 1 | 0 | 1 | 49 s | 0 |
| Agenzia: dall'avviso all'offerta | 7 | 7 | 6 | 3 | 1 | 67 → **47** | 85 s | 0 |
| Agenzia: esito ed emissione | 4 | 9 → **6** | 1 | 0 | 3 | 7 | 65 s → **61 s** | 0 |
| Sub-agente: cambio di agenzia | 4 | 4 | 3 | 1 | 0 | 3 | 38 s | 0 |
| Back office: verifica e approvazione | 7 | 7 | 4 | 0 | 0 | 64 | 56 s | 2 → **0** |
| Back office: richiesta di integrazioni | 3 | 3 | 2 | 3 | 0 | 60 | 32 s | 0 |

- Privato: dalla prima visita alla richiesta inviata: copertura: 15 → 8 campi
- Broker: richiesta per un cliente nuovo: nuovo-cliente: 8 → 6 campi; copertura: 15 → 8 campi
- Broker: confronto e invio al cliente: confronto-offerte: 3 → 2 campi; link-inviato: 3 → 2 campi
- Agenzia: dall'avviso all'offerta: modulo-offerta: 29 → 19 campi; ricevuta-busta-chiusa: 27 → 17 campi

Nota sui conteggi: «campi visibili» conta anche gli input di file nascosti dietro un pulsante (`sr-only`), per esempio i 3 dell'emissione; il tempo stimato cambia poco perché i passaggi obbligatori (foto, consenso, firma, pagamento) restano quelli.

## 2. Come abbiamo misurato

Uno strumento Playwright a parte dalla CI (`tests/e2e/ux-review/`, `pnpm exec playwright test --config ux-review.config.ts` da `tests/e2e`, con `UX_PHASE=prima|dopo`) percorre ogni flusso come una persona, conta **schermate** (pagine viste), **tocchi** (clic e pulsanti), **campi** scritti, **scelte** (caselle, radio, elenchi), **file** (foto e PDF) e i secondi di **attesa** del sistema; fotografa ogni schermata a 390 px (telefono) e 1440 px (computer) e la controlla con axe (WCAG 2.2 AA, tutti gli impatti, più le migliori pratiche). Risultati in `misure/<fase>/<flusso>.json`, schermate in `schermate/<fase>/<flusso>/` (non nel repository: 32 MB; quelle utili sono in `immagini/`).

Stima del tempo per una persona reale: 3 s per schermata, 1,5 s per tocco, 6 s per campo scritto, 2 s per scelta, 10 s per foto o file, più le attese misurate. I tempi reali dello strumento su questo PC non sono significativi (la macchina è lenta e la rete è locale).

Le schermate a piena pagina mostrano il pulsante fisso e la barra del menu a metà pagina: è un effetto della cattura, non un difetto.

## 3. Problemi trovati, in ordine di gravità

Prova: schermata «prima» in `immagini/` o numero della misura di partenza (`misure/prima/riepilogo.txt`).

| # | Problema | Chi lo subisce | Prova | Corsia |
| --- | --- | --- | --- | --- |
| 1 | La prima schermata del privato (email e codice) è la pagina di Keycloak con il tema di base: grigio, blu Microsoft, nessun nome del servizio | Privati, broker, agenzie, back office | `prima-accesso-390.png` | A |
| 2 | Una bozza riaperta porta a una pagina che dice solo «Continua la procedura» e poi riparte **dal primo passo**, non da dove si era rimasti | Privati, broker | codice `request-view.tsx` (`steps[0]`) | A |
| 3 | La data di nascita del proprietario si scrive a mano anche se il bot l'ha letta dalla patente, e il broker la riscrive anche se l'ha già data con il codice fiscale del cliente | Privati, broker | misura: 3 campi scritti nel flusso del privato, 8 in quello del broker | A |
| 4 | Schermata «Copertura»: 15 campi visibili, compresi i 6 delle garanzie «Su misura» e la data anche con «appena l'agenzia emette» | Privati, broker | `prima-copertura-390.png`, misura «copertura=15» | A |
| 5 | Modulo dell'offerta dell'agenzia: 29 campi visibili, con i massimali separati anche con «Massimale unico» e i dettagli di ogni garanzia non inclusa; massimale e capitale da scrivere anche quando il pacchetto li fissa | Agenzie, sub-agenti | `prima-offerta-1440.png`, misura «modulo-offerta=29» | A |
| 6 | «Scegli questa offerta» resta muto per 10-30 secondi mentre si preparano i PDF da firmare | Privati, clienti dei broker | nota in `docs/stato.md` del 22 ottobre; misura «attesa 4 s» in locale | A |
| 7 | Emissione: ogni PDF chiede due tocchi (scegli il file, «Carica») | Agenzie | misura: 9 tocchi per 3 file | A |
| 8 | Pannello «Invia al cliente» del broker e pagina del cliente dal link ancora nel vecchio stile: caselle da 16 px, link da 17 px, prezzi piccoli, pulsanti «Scegli» di 36 px | Broker, clienti dei broker (dal telefono) | `prima-broker-offerte-1440.png`, `prima-cliente-link-390.png` | A |
| 9 | Nuovo cliente del broker: 8 campi con i blocchi «Persona» e «Società» entrambi visibili; «Nuovo cliente» in fondo a una lista lunga | Broker | `prima-nuovo-cliente-1440.png`, misura «nuovo-cliente=8» | A |
| 10 | Aree toccabili sotto i 44 px: link dell'account e del menu (web e back office), link dei documenti, caselle della richiesta di integrazione (16 px), barra in basso del privato (40 px) | Tutti | codice (`py-2`, `h-4 w-4`, `text-xs py-3`) | A |
| 11 | Back office: campi con bordo `warm-200` (contrasto sotto 3:1, WCAG 1.4.11); nella colonna «Documenti» i campi letti dal bot con i nomi interni (`ownerSurname`, `claimsMainLast5y`) | Back office | `prima-verifica-1440.png` | A |
| 12 | Nella richiesta il pacchetto compare come codice («RECOMMENDED») | Privati, broker | `prima-riconferma-390.png` | A |
| 13 | Home del privato con due pulsanti arancio quando c'è una richiesta in corso («Nuovo preventivo» e l'azione della scheda) | Privati | codice `private-home.tsx` | A |
| 14 | Accesso con codice via email: tre schermate (email, codice, documenti) prima della home; il codice va copiato a mano | Privati | misura: 13 schermate dal primo arrivo alla richiesta inviata | B |
| 15 | Il cliente del broker deve toccare «Mandami il codice» prima di ricevere il codice: un passaggio che il sistema potrebbe fare da solo | Clienti dei broker | misura: 7 tocchi | B |
| 16 | «Prendi in carico» e offerta sono due momenti separati: un'agenzia che vuole solo offrire fa un tocco e un ricaricamento in più | Agenzie | misura: 7 tocchi | B |
| 17 | «Partecipa all'asta» senza impaginazione: con i dati di prova la pagina elenca oltre 100 righe; l'elenco non ricorda i filtri | Agenzie | `prima-partecipa-1440.png` | B |
| 18 | Il back office vede «710 notifiche non lette»: il centro notifiche del back office non distingue le urgenti | Back office | `prima-verifica-1440.png` (barra in alto) | B |
| 19 | Le foto dei documenti non hanno un ritaglio o un controllo di qualità dell'immagine prima dell'invio (solo il responso del bot) | Privati, broker | flusso | B |
| 20 | Sub-agente di due agenzie: il cambio di contesto è un menu a tendina più «Vai» nella barra; la scelta iniziale è una pagina a sé | Sub-agenti | `prima-contesto-1440.png` | B (poco beneficio) |

Cosa manca (non solo cosa c'è): un riepilogo modificabile prima dell'invio esiste («Controlla e invia»), ma le voci non sono link al passo da correggere; nessuna scorciatoia da tastiera per le agenzie; nessun promemoria nel calendario per la chiusura dell'asta (c'è per la scadenza del prezzo).

## 4. Modifiche fatte (corsia A)

Un commit per modifica sul ramo `ux/revisione-2026-10-23`. Nessuna dipendenza nuova. Nessuna migrazione del database.

| # | Problema | Soluzione | Prova |
| --- | --- | --- | --- |
| A1 (problema 2, 13) | La bozza ripartiva dal primo passo e la home aveva due pulsanti arancio | `resumeStep` (`apps/web/src/lib/resume.ts`): aprire una bozza porta al primo passo ancora da compilare; la pagina della richiesta di una bozza reindirizza lì (non per le bozze dei lotti, che partono da sole); nella procedura «Torna alle richieste» e «Annulla questa bozza». In home «Nuovo preventivo» diventa contornato quando c'è qualcosa in corso. L'API dice `scheduledSubmitAt` nel dettaglio | `resume.test.ts` (4 casi); misura «dopo»: dalla home una bozza si riprende con 1 tocco invece di 2 |
| A2 (problema 3) | Data di nascita scritta due volte | Proposta dalla patente letta dal bot («Letta dalla patente: controlla che sia giusta») o, per il cliente del broker, dalla sua scheda; la scheda del nuovo cliente prende data di nascita e sesso dal codice fiscale | `intake.int.test.ts` (il dettaglio della richiesta porta `customerBirthDate`); misura «dopo»: privato 3 → 2 campi scritti, broker 8 → 7 |
| A3 (problemi 4, 5, 9) | Troppi campi visibili | CSS `:has()` senza script (`globals.css`, `data-shows-when`; i browser senza `:has()` vedono tutto): garanzie «Su misura» solo con quel pacchetto, data solo con «Da una data che scelgo», persona o società nel nuovo cliente, massimali separati solo se scelti, dettagli di una garanzia solo se inclusa. Il modulo dell'offerta parte dai minimi del pacchetto (massimale unico, capitale infortuni) | misura «dopo»: copertura 15 → 8 campi, modulo dell'offerta 29 → 19, nuovo cliente 8 → 6 |
| A4 (problema 6) | «Scegli questa offerta» muto | `PendingButton` con «Preparo i documenti da firmare…» e spinner (pulsazione con «riduci movimento»); lo stesso sulla pagina del cliente dal link | schermata `dopo-scelta-attesa-390.png` |
| A5 (problema 7) | Due tocchi per ogni PDF dell'emissione | Il file parte appena scelto (`AutoSubmitFile`, già usato per le foto); link da 44 px; titolo nel carattere dei titoli. Helper e2e `issuePolicy` aggiornato | misura «dopo»: emissione 9 → 6 tocchi |
| A6 (problema 8) | Pannello del broker e pagina del cliente nel vecchio stile | Le stesse schede delle offerte del privato: prezzo in Inter Tight, chip della garanzia, «Più conveniente», link da 44 px, un solo pulsante arancio per schermata; su «Nuova richiesta» il pulsante «Nuovo cliente» accanto alla ricerca | schermate `dopo-broker-offerte-1440.png`, `dopo-cliente-link-390.png`; S02 invariato |
| A7 (problemi 10, 11) | Aree sotto i 44 px, bordi poco contrastati, nomi interni dei campi | Link dell'account, menu e cambio contesto da 44 px (sito e back office); campi del back office con bordo 3:1 e focus visibile; caselle dell'integrazione da 20 px in righe da 44 px; colonna «Documenti» della verifica con i nomi italiani dei campi letti (`readFields`) | schermata `dopo-verifica-1440.png`; axe «dopo» senza violazioni |
| A8 (problema 12) | Pacchetto come codice | La richiesta mostra il nome del pacchetto dai parametri | schermata «dopo» della richiesta |
| A9 (problema 1) | Pagina di accesso con il tema di base di Keycloak | Foglio di stile del tema `astax` (`infra/keycloak/themes/astax/login/resources/css/astax.css`): blu notte, scheda bianca, Inter, campi da 48 px con bordo 3:1, pulsante arancio con testo blu notte, niente movimento con «riduci movimento». Solo CSS: nessuna logica di accesso toccata | schermate `prima-accesso-390.png` → `dopo-accesso-390.png` |
| A0 | Mancava uno strumento per misurare | `tests/e2e/ux-review/` (vedi § 2), fuori dalla CI | `misure/prima` e `misure/dopo` |

Test toccati: `resume.test.ts` (nuovo), `intake.int.test.ts` (asserzione nuova), helper e2e `issuePolicy`. Nessun test disattivato o indebolito.

## 5. Proposte (corsia B), in ordine di impatto

| # | Proposta | Motivo | Impatto | Come la farei | Tocca |
| --- | --- | --- | --- | --- | --- |
| B1 | **Codice via email che si compila da solo e link magico.** L'email del codice contiene anche un link che entra direttamente; sul telefono il campo del codice usa `autocomplete="one-time-code"` (già c'è) e un SMS come alternativa | Oggi: email → codice copiato a mano → documenti → home: 3 schermate e 2 campi prima di iniziare | Alto: ogni accesso del privato | Nell'estensione Keycloak `email-code`: un token monouso nel link, stesse scadenze e limiti del codice; pagina di arrivo che consuma il token | Accesso e sicurezza (SIC), Keycloak |
| B2 | **Codice del cliente del broker inviato all'apertura del link.** Il primo tocco «Mandami il codice» sparisce: aprendo il link il codice parte da solo (con il limite di invii di oggi) | Un tocco e una schermata in meno per chi arriva dal telefono | Medio-alto | `GET /customer-links/{token}` manda il codice alla prima apertura; pagina con il solo campo del codice | Accesso (OTP), limiti di frequenza |
| B3 | **Offerta senza presa in carico esplicita.** Il modulo dell'offerta è sempre visibile; l'invio dell'offerta prende in carico e offre in un colpo (OFF-02 e OFF-03 restano: il server rifiuta se un collega ha già in carico) | Un tocco e un ricaricamento in meno per ogni offerta; la presa in carico resta per chi vuole bloccare la richiesta senza offrire subito | Medio-alto | `POST /offers` con presa in carico implicita se libera; messaggio chiaro se la richiesta è di un collega | Regola del servizio (OFF-03) |
| B4 | **«Partecipa all'asta» con filtro predefinito «asta aperta», impaginazione e filtri salvati per persona** | Con molte aste la lista è lunga e lenta; i filtri si perdono a ogni visita | Medio | Parametro `agency.incoming.pageSize`; filtri salvati nelle preferenze dell'utente (tabella nuova); default «OPEN» | Regola «chi vede cosa» (le chiuse restano visibili con il filtro), nuova tabella |
| B5 | **Notifiche del back office per priorità.** Contatore delle sole urgenti (integrazioni scadute, aste da chiudere, segnalazioni) e «segna tutte lette» per categoria | 710 non lette rendono il contatore inutile | Medio | Campo `priority` sugli eventi di notifica (seed/notifiche.yaml) e filtro nel centro notifiche | Notifiche (nuova colonna), parametri |
| B6 | **Dati del veicolo dalla targa** prima della foto del libretto: marca, modello, immatricolazione precompilati, il libretto resta per la verifica | Il back office completa oggi 29 campi; molti arriverebbero dalla targa | Alto per il back office | Adattatore già previsto (`Openapi targhe`, fase 8 A5) acceso anche nel completamento; costo per chiamata | Fornitore esterno, costi |
| B7 | **Ritaglio e controllo della foto sul telefono** prima dell'invio (nitidezza, luce), con la cattura da fotocamera guidata | Meno foto illeggibili e meno giri | Medio | Libreria di ritaglio lato browser (dipendenza nuova) oppure controllo di nitidezza in canvas senza librerie | Dipendenza nuova |
| B8 | **Promemoria nel calendario per la chiusura dell'asta** (file .ics, come per la scadenza del prezzo) e notifica push «le buste si aprono tra 15 minuti» | Chi aspetta sa quando tornare | Basso-medio | Riuso di `add-to-calendar.tsx`; nuovo evento di notifica | Notifiche (testo nuovo da validare) |
| B9 | **Approvazione automatica delle richieste «verdi»** accesa nel pilota (`verification.autoApproveGreen`, già pronta) | Toglie il passaggio del back office per le richieste senza differenze | Alto quando i dati arrivano dal bot e dalla targa | Solo parametro, ma è una regola del servizio (chi verifica) | Regola del servizio, decisione di Dan |
| B10 | **Scorciatoie da tastiera per le agenzie** (`/` cerca, `j`/`k` righe, `o` apri, `p` prendi in carico) | Chi usa l'app tutti i giorni | Basso-medio | Piccolo script sulla tabella, aiuto con `?` | Nessuna regola; rimandata per tempo |

Passaggi obbligatori: nessuno è stato tolto, nascosto o preselezionato. Restano invariati: consegna di DIP, DIP aggiuntivo e informative (pagina «Firma e paga», con la spunta «Ho letto i documenti» non preselezionata); consenso privacy con spunta separata e vuota (schermata «Controlla e invia»); firma con il fornitore e verifica dei documenti nel back office; riepilogo con il totale prima del pagamento.

## 6. Modifiche tentate e annullate

- **Reindirizzo della pagina della richiesta per tutte le bozze.** Annullato per le bozze dei lotti (ADR 0014): la loro pagina dice il giorno in cui partono da sole; il reindirizzo vale solo per le bozze senza data programmata.
- **Conferma dell'invito a mano nel back office dentro lo strumento di misura.** Il messaggio «Richiesta inviata» sparisce quando la pagina si aggiorna da sola dopo l'invito (canale in tempo reale, ADR 0008): lo strumento ora aspetta solo l'invio. Non è un difetto dell'app, ma un comportamento da tenere presente: un messaggio di conferma che dura meno di un secondo non serve a nessuno (vedi domanda 3).

## 7. Domande aperte

1. **Link magico nell'email del codice (B1):** vale la pena toccare l'estensione Keycloak? È il passaggio che toglie più schermate al privato.
2. **Codice automatico per il cliente del broker (B2):** un invio senza tocco è accettabile per il legale (è un messaggio non richiesto dal destinatario)?
3. **Messaggi di conferma nel back office:** con la pagina che si aggiorna da sola, i messaggi «Richiesta inviata» possono sparire subito. Meglio un avviso che resta finché non lo chiudi?
4. **Approvazione automatica delle verdi (B9):** quando accenderla nel pilota?
5. **Dati dalla targa (B6):** quale fornitore e quale budget per chiamata?
