# Fase 4 — Offerte

**Obiettivo.** Agenzie e sub-agenti lavorano davvero in piattaforma: trovano le richieste, le prendono in carico, offrono, modificano, rispondono alle riconferme. Il richiedente può chiedere una riconferma.

**Si chiude quando:** gli scenari di parità, riconferma e sub-agente sono superati.

## Prima di iniziare

- Fase 3 chiusa in `docs/stato.md`.
- Da leggere: `docs/specifiche/04-utenza-agenzia.md`, `05-utenza-sub-agente.md`, `00-panoramica-e-processi.md` (processo 2 e «Prezzo garantito e riconferma»), regole OFF, GAR-06…08, VIS-01, VIS-06, VIS-08…11, `docs/decisioni-aggiunte.md` (13-17).
- Serve da Dan: soglie di rivalsa e franchigie dei pacchetti confermate con 3-4 agenzie del pilota (`seed/pacchetti.json`). Se cambiano, si aggiorna il seed con una nuova versione dei pacchetti.

## Cosa comprende

- **Area agenzia (desktop):** dashboard con contatori e indicatori dei 30 giorni; «Richieste in arrivo» ordinate per chiusura, con le colonne della specifica e filtri; dettaglio della richiesta con tutti i dati del preventivo e i documenti (filigrana VIS-10, avviso «ogni apertura viene registrata», mai contatti); presa in carico, rilascio, «non interessato» con motivo.
- **Modulo offerta:** premio lordo annuo; compagnia tra i mandati verificati; prodotto dalla libreria; dichiarazione delle coperture per ogni voce del pacchetto con le differenze evidenziate; massimali, franchigie, scoperti; «garantito fino al» non prima della garanzia minima; PDF obbligatorio; note con filtro (VIS-11); conferma esplicita che l'offerta è vincolante. Modifica e ritiro fino alla chiusura.
- **«Le mie offerte»:** viste per stato; sezione «offerte aperte» (GAR-08); risposte alle riconferme (conferma, aggiorna, rinuncia).
- **Libreria prodotti** (decisione 17) nella sezione «Agenzia».
- **Filtri e capacità:** filtri dell'agenzia, filtri personali (solo restrizioni), massimo giornaliero, orari di ricezione, pausa, distribuzione.
- **Team dell'agenzia:** inviti, ruoli, abilitazioni (`canIssue`, `canSeeColleagueOffers`, `canSeeAccounting`), sospensione; registro degli accessi dei propri utenti (VIS-08).
- **Sub-agente:** menu ridotto, selettore delle agenzie, blocchi di OFF-02 e OFF-03 con messaggi chiari.
- **Gestione delle prese in carico** da parte di titolare e supervisore (liberare, riassegnare).
- **Riconferma lato richiedente:** pulsante «Chiedi riconferma» quando la richiesta è «Scaduta» (massimo 2); giro `RECONFIRMATION` nel workflow con nuove chiavi e 24 ore lavorative; esito «Offerte disponibili» o «Deserta»; notifiche `reconfirmation.requested` e `reconfirmation.completed.requester`.
- **Controllo del PDF alla chiusura** (OFF-09) con l'adattatore finto di lettura: segnalazioni al back office; esclusione motivata da parte del back office finché il cliente non ha accettato; notifica `offer.excluded_after_review`.
- **Filtro delle note:** funzione di dominio che riconosce numeri di telefono in vari formati, email anche scritte a parole («chiocciola», «punto it»), link e indirizzi web.

## Criteri di accettazione

- [ ] Gli scenari S03, S06 (end-to-end) e S10 passano.
- [ ] Il modulo rifiuta: compagnia senza mandato verificato, garanzia sotto il minimo, PDF mancante, note con telefono, email o link. Coperture dichiarate inferiori al pacchetto: avviso all'invio ed esclusione alla chiusura con motivo.
- [ ] La copia per l'agenzia si legge solo da chi ne ha diritto (autore, titolare, supervisore, operatori con `canSeeColleagueOffers`); gli altri ricevono 403; ogni lettura è registrata.
- [ ] Due utenti della stessa agenzia che prendono in carico nello stesso istante: uno solo ci riesce.
- [ ] I documenti scaricati o visualizzati da un'agenzia portano la filigrana (il test la verifica sul file).
- [ ] Un test chiama tutti gli endpoint dell'area agenzia con i dati di prova e non trova mai telefono ed email del cliente nelle risposte.
- [ ] Il controllo del PDF segnala una differenza tra premio dichiarato e premio letto; il back office esclude con motivo; dopo l'accettazione del cliente l'esclusione è rifiutata.
- [ ] I filtri personali non possono allargare quelli dell'agenzia.
- [ ] Il titolare vede gli accessi dei propri utenti ai dati dei clienti.

## Test richiesti

- Unità: filtro delle note, validazioni del modulo, conformità al pacchetto, filtri personali.
- Integrazione: prese in carico concorrenti, permessi della copia per l'agenzia, riconferma (busta chiusa compresa), esclusione dopo il controllo del PDF.
- End-to-end: S03, S06, S10; percorso completo di un'agenzia dall'invito all'offerta; percorso di un sub-agente con due agenzie.

## Demo per Dan

Con tre browser: Agenzia Uno, Agenzia Tre (Marco Rossi) e un privato. Marco prende in carico per Uno e prova da Tre; Sofia offre per Tre; il privato fa scadere le offerte (orologio di sviluppo) e chiede la riconferma; le agenzie rispondono; il privato vede le nuove offerte.
