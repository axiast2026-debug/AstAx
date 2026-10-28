# 0021 — Coperture in tre scelte, eventi naturali e atti vandalici separati, kasko

- **Data:** 2026-10-28
- **Stato:** accettata (Dan, 2026-10-28, `docs/piano-procedura-privato.md`, passo 6)
- **Riferimenti:** OFF-04, OFF-06; `docs/specifiche/09-decisioni-e-valori-predefiniti.md` §2; `seed/pacchetti.json`; `packages/shared/src/domain/coverage.ts`

## Contesto

Dan ha chiesto che il privato scelga tra tre possibilità: «RCA obbligo di legge», «Consigliate» (RCA, assistenza stradale, infortuni del conducente, tutela legale, più riconoscibili) e «Su misura», dove eventi naturali e atti vandalici sono separati e ci sono anche kasko collisione, full kasko e collisione con animali selvatici. Fino a oggi la kasko era fuori dall'MVP e «eventi naturali e atti vandalici» era una sola voce, salvata così in pacchetti, richieste e offerte.

## Decisione

1. **Voci nuove del modello.** `naturalEvents` e `vandalism` al posto di `naturalEventsVandalism`; in più `collisionKasko`, `fullKasko`, `wildlifeCollision`. Tutte e cinque si dichiarano come furto e incendio: inclusa o no, con scoperto in percentuale e minimo in euro; il pacchetto chiede uno scoperto massimo e un minimo massimo (OFF-06).
2. **I dati di prima restano validi.** Pacchetti, richieste e offerte salvati prima con la voce unica si leggono così: la voce unica vale per eventi naturali e per atti vandalici; le tre voci kasko mancano, quindi non richieste e non incluse. Una richiesta «Su misura» che aveva scelto la voce unica ha scelto le due nuove.
3. **Versione 2 dei pacchetti** (`seed/pacchetti.json`, valida dal 2026-10-28): stesse soglie di prima, la voce unica divisa in due, le voci kasko non richieste; per «Su misura» le voci kasko hanno le soglie larghe del modello («lo propone l'agenzia»). Le aste aperte prima usano la versione in vigore alla loro apertura (regola 7).
4. **Tre scelte nella richiesta** di privato e broker: Base («RCA obbligo di legge»), Consigliato («Consigliate», con l'elenco delle coperture in evidenza) e Su misura. Plus e Completo restano nel catalogo per le agenzie e i filtri, non nella richiesta.
5. **Modulo dell'offerta dell'agenzia:** una riga per ogni voce, con scoperto e minimo per le cinque voci nuove.

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| Migrare nel database i JSON salvati | Tocca offerte sigillate e richieste inviate; la lettura compatibile ottiene lo stesso senza cambiare i dati |
| Kasko con un valore assicurato dichiarato | Diverso tra compagnie; per il pilota bastano scoperto e minimo, i dettagli stanno nel PDF |

## Conseguenze

- Le soglie della kasko vanno validate con le agenzie del pilota, come le altre franchigie (spec 09).
- I filtri delle agenzie per pacchetto non cambiano; nessuna agenzia è obbligata a offrire kasko: con una voce scelta e non inclusa l'offerta è esclusa (OFF-06).
