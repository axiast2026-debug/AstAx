# 0014 — Lotti dei broker: file Excel, richieste programmate, documenti a tempo

- **Data:** 2026-10-21
- **Stato:** accettata (piano del broker approvato da Dan il 2026-10-21, passo 4)
- **Riferimenti:** `docs/piano-broker.md` (proposte C, D, E; risposte 4, 5, 6)

## Contesto

Dan vuole che il broker carichi in una volta tutti i rinnovi, per esempio quelli del mese, con un file Excel a formato fisso. Ogni riga diventa una richiesta; l'asta parte 7 giorni prima della scadenza della polizza; 3 giorni prima dell'asta si chiedono i documenti al broker; l'asta può partire anche senza documenti (invitando solo le agenzie che lo accettano); il broker può far partire l'asta quando vuole.

Oggi esiste il caricamento in blocco della fase 7 (CSV, con uno ZIP facoltativo di documenti): crea clienti e bozze, che il broker completa una per una.

## Decisione

1. **Il file `.xlsx` si legge e si scrive senza librerie nuove.** Un `.xlsx` è uno ZIP di file XML. Lo apriamo con `fflate`, che il progetto usa già per gli ZIP, e leggiamo solo quello che serve: il primo foglio, le stringhe condivise, testo, numeri e date di Excel. Le formule non si eseguono (si legge il valore salvato), le entità XML non si espandono, il file ha un limite di dimensione e il numero di righe viene dal parametro `requests.bulkMaxRows`. Il modello da scaricare si genera nello stesso modo.
2. **Il lotto (`RequestBatch`) è un contenitore.** Il file si controlla tutto prima di salvare (come il CSV): se una riga è sbagliata la pagina dice quale e perché, e non si salva niente. Poi ogni riga diventa subito una richiesta in bozza del broker, con il cliente (quello già presente o uno nuovo), i dati essenziali (targa, data di nascita, residenza, tipo di guida), le garanzie e la decorrenza. La richiesta ricorda il lotto, la riga e la scadenza della polizza attuale.
3. **Date programmate, dai parametri** (regola 7): asta = scadenza − `batch.auctionDaysBeforeExpiry` (7 giorni); documenti = asta − `batch.documentsDaysBeforeAuction` (3 giorni). Se la data dell'asta è già passata, la richiesta parte al primo giro utile.
4. **L'invio programmato lo fa l'API, non il worker.** Un controllo periodico dell'API (come la consegna delle fatture allo SDI) invia in verifica le richieste del lotto arrivate alla loro data, con gli stessi casi d'uso del broker: consenso dalla dichiarazione dello studio (risposta 3), registro attività, avviso al back office. Il back office completa i dati e approva; l'asta si apre all'approvazione. Il broker può inviare prima una richiesta del lotto dalle solite 5 schermate (risposta 6).
5. **Documenti a tempo:** il giorno dei documenti il broker riceve un avviso con le richieste del lotto ancora senza libretto. Un avviso per richiesta, una volta sola.
6. **Senza documenti (risposta 4):** una richiesta del lotto inviata senza libretto è segnata «senza documenti». A quell'asta sono invitate solo le agenzie che nei filtri hanno «Accetto richieste senza documenti» (nuovo filtro, spento di base).
7. **Persone e società.** Dan, 2026-10-22 (domanda 25): anche le società. Una riga con 11 cifre al posto del codice fiscale è una società: ragione sociale nella colonna del cognome, partita IVA, sede negli indirizzi; niente data di nascita del proprietario (obbligatoria solo per le persone, controllata all'invio); il conducente principale è la persona della patente.

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| Una libreria per Excel (exceljs, SheetJS) | Dipendenze grandi per leggere un foglio a formato fisso; SheetJS su npm non è più aggiornata. `fflate` è già nel progetto |
| Chiedere un CSV | Dan ha chiesto Excel: è quello che i broker usano |
| L'invio programmato nel worker | Il worker non ha i casi d'uso della richiesta: andrebbero duplicati controlli, consenso e registro |
| Un nuovo stato «programmata» | Una bozza con la data dell'asta basta: lo stato resta quello che il broker già conosce, e la tabella di lavoro mostra la data |

## Conseguenze

- Nuovi parametri `batch.auctionDaysBeforeExpiry` e `batch.documentsDaysBeforeAuction`; nuova tabella `RequestBatch`; nuove colonne della richiesta (`batchId`, `batchLine`, `policyExpiryDate`, `scheduledSubmitAt`, `documentsDueAt`, `documentsNotifiedAt`, `withoutDocuments`).
- Il controllo periodico dell'API gira in ogni copia, sotto un lease del database: una richiesta è inviata una volta sola.
- Il lettore Excel accetta solo il modello di AstAx: intestazioni in quell'ordine, primo foglio. Le intestazioni sono diventate «Cognome o ragione sociale» e «Codice fiscale o partita IVA» il 2026-10-22: i modelli scaricati prima vanno riscaricati.
