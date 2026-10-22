# 0015 — L'agenzia che chiede preventivi per i suoi clienti

- **Data:** 2026-10-22
- **Stato:** accettata (piano delle agenzie approvato da Dan il 2026-10-21, passo 4; risposte 3, 4 e 5)
- **Riferimenti:** `docs/piano-agenzie.md` (proposta E)

## Contesto

Dan vuole che agenti e sub-agenti possano aprire aste per i propri clienti, come i broker. Alle loro aste le altre agenzie partecipano, ma **non possono offrire con le compagnie che hanno in comune con l'agenzia richiedente** (risposta 3B); per il sub-agente valgono le compagnie della sua agenzia (risposta 5). La fee è di **30 €**, come per il broker (risposta 4).

Oggi le richieste hanno due canali: `PRIVATE` (il privato per sé) e `BROKER` (un'organizzazione per un suo cliente). Tutto il percorso del canale `BROKER` — consenso con la dichiarazione dello studio, completamento del back office, contraente uguale al cliente, link al cliente per scegliere, firmare e pagare, fee FEE-03, contatti all'agenzia che emette, avvisi e rinnovi — non dipende dal tipo di organizzazione: dipende solo dal fatto che chi chiede è un'organizzazione con un suo cliente.

## Decisione

1. **Il canale `BROKER` vuol dire «un intermediario per il suo cliente»**, broker o agenzia. Non si aggiunge un canale nuovo: il percorso resta uno solo, già provato. Dove serve sapere chi è (etichette del back office, fatture) si guarda il tipo dell'organizzazione richiedente.
2. **Chi può chiedere:** i controlli che oggi dicono «solo broker» diventano «broker o agenzia» con una sola funzione (`isOrgRequester`). I permessi dei richiedenti (richiesta, clienti, lotti, link al cliente, riconferma) vanno anche ai ruoli dell'agenzia. Titolare e supervisori vedono tutti i clienti dell'agenzia; l'operatore (sub-agente) solo i suoi.
3. **Consenso:** la dichiarazione unica sul consenso dei clienti (`broker-clients-declaration`) vale anche per l'agenzia: la firma il titolare.
4. **Esclusione per compagnia (risposta 3B):** a un'asta di un'agenzia, ogni altra agenzia è invitata solo per le sue compagnie **non** in comune con l'agenzia richiedente; un'agenzia senza compagnie rimaste non è invitata; l'agenzia richiedente non è mai invitata alla sua asta (ha tutte le compagnie in comune con sé). All'invio dell'offerta si controlla di nuovo: un'offerta con una compagnia in comune è rifiutata.
5. **Fee (risposta 4):** come per il broker, 30 € (`fees.broker.amountCents`) dovuti dall'agenzia richiedente a polizza emessa, nella fattura mensile (serie B) intestata all'agenzia.

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| Un canale nuovo `AGENCY` | Circa il doppio dei punti da cambiare (una ventina di rami del percorso broker, i tipi del sito e del back office, una migrazione) per un percorso identico |
| Escludere del tutto le agenzie con una compagnia in comune (risposta 3A) | Dan ha scelto la 3B: più offerte per il cliente |

## Conseguenze

- Nei filtri e nei conteggi del back office le richieste delle agenzie risultano nel canale «broker»; le etichette usano il tipo dell'organizzazione.
- La selezione delle agenzie riceve le compagnie escluse della richiesta; il controllo dell'offerta (OFF-04) le rifiuta.
