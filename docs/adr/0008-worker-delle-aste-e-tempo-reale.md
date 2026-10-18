# 0008 — Worker delle aste e tempo reale

- **Data:** 2026-10-16
- **Stato:** proposta
- **Fase:** 3

## Contesto

Nella fase 3 l'asta si apre, si rabbocca, manda i promemoria, si chiude e si riapre da sola. Deve funzionare anche dopo un riavvio. Le specifiche indicano Temporal (`docs/architettura-codice.md`, «Workflow»). In più, il richiedente e il back office devono vedere i contatori senza ricaricare la pagina. Due vincoli guidano le scelte:

- l'ADR 0004 tiene i token solo sul server delle app web: il browser non ha mai un token dell'API;
- la regola 8 e BC-07 vietano dati personali e dati delle offerte nei payload di Temporal.

## Decisione

1. **`apps/worker`**: un processo Node con il worker di Temporal (coda `astax-requests`), il dispatcher dell'outbox (spostato dall'API, come previsto) e il KMS finto con la sola chiave `astax-sealed-bids` (ADR 0005). L'API non ha più il dispatcher.
2. **`QuoteRequestWorkflow`**: uno per richiesta, con id `quote-request-{id}`.
   - L'approvazione scrive l'evento `RequestApproved`; l'outbox lo consegna al worker, che avvia il workflow con il segnale `approved` (`signalWithStart`). Se la consegna fallisce, l'outbox riprova; un secondo avvio è innocuo.
   - Il workflow riceve e passa solo identificativi, conteggi e istanti; mai premi, nomi o codici fiscali. Un test lo controlla sulla storia serializzata.
3. **Tempi**: le attività calcolano gli istanti con il calendario di dominio e i parametri copiati all'apertura (ASTA-09). Il workflow aspetta fino a quegli istanti assoluti. Prolungamenti e nuovi inviti arrivano come segnali (`auctionExtended`, `invitationsAdded`, `auctionCancelled`), e il workflow ricalcola i timer.
4. **Attività idempotenti**: ognuna controlla lo stato prima di agire. Per esempio la chiusura non fa nulla su un'asta già chiusa, e un'apertura ripetuta ritrova l'asta già aperta. Così una ripetizione di Temporal non produce doppioni.
5. **Concorrenza tra chiusura e invio** (BC-05): la chiusura porta l'asta a `CLOSING` con un blocco sulla riga (`SELECT … FOR UPDATE`); l'invio di un'offerta prende lo stesso blocco e controlla stato e ora. Uno dei due arriva per secondo e vede l'altro.
6. **Tempo reale**: Socket.IO nell'API, con l'adattatore Redis.
   - Il browser si collega con un **biglietto** valido 30 secondi e usabile una volta sola. Il server dell'app web lo chiede all'API con il token dell'utente (`POST /realtime/ticket`), quindi il token non arriva mai al browser. La connessione usa l'indirizzo `/realtime/socket` (fase 8: con `/realtime` il server Socket.IO rispondeva anche a `/realtime/ticket` e il biglietto non arrivava mai).
   - L'API mette la connessione solo nelle «stanze» che quell'utente può seguire: le proprie richieste, oppure l'elenco aste per il back office.
   - I messaggi dicono solo che cosa è cambiato (`{type, requestId}`): la pagina rilegge i dati dall'API con i soliti controlli. Il worker pubblica i cambiamenti su Redis, e l'API li inoltra.
7. **Strumenti di sviluppo** (`DEV_TOOLS=true`, mai in produzione): il segnale `fireNextTimer` fa scattare subito il prossimo timer; un comando invia offerte di prova a nome delle agenzie sintetiche.

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| Timer nel database con un processo che controlla ogni minuto | Riscrive a mano quello che Temporal garantisce (riavvii, ripetizioni, storia), contro le specifiche |
| L'API avvia il workflow dentro la transazione dell'approvazione | Se Temporal non risponde, l'approvazione fallisce, oppure resta salvata senza asta; l'outbox separa le due cose |
| Token dell'API nel browser per il WebSocket | Contro l'ADR 0004 |
| Aggiornamento periodico della pagina (polling) | Più carico e più ritardo; le specifiche chiedono il tempo reale |

## Conseguenze

- `pnpm dev` avvia anche il worker; la UI di Temporal (http://localhost:8233) mostra i workflow, con soli identificativi.
- I test dei workflow usano l'ambiente di test di Temporal a tempo accelerato, con le attività finte. I test delle attività usano PostgreSQL vero.
- Il server di test a tempo accelerato di Temporal si scarica la prima volta (nella CI e in locale); se non si può scaricare, quei test falliscono invece di passare in silenzio.
