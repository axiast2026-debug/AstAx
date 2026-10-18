# Prove di carico (fase 8, k6)

Criteri del file della fase 8: **200 aste contemporanee, 1.000 utenti di agenzia, 50 offerte nell'ultimo minuto della stessa asta**; la chiusura entro 5 secondi dall'ora prevista, il 95% delle risposte dell'API sotto 300 ms al carico nominale, nessun errore.

La prova vera si fa **in collaudo** (proposta G): questo PC non regge 1.000 utenti. Qui si prova in piccolo che gli script funzionano.

| Script | Cosa misura | Soglie |
| --- | --- | --- |
| `agency-reads.js` | Utenti di agenzia che aprono cruscotto, richieste in arrivo, offerte, notifiche, con pause da persona | Nessun errore; p95 < 300 ms |
| `offers-burst.js` | 50 agenzie che mandano l'offerta nello stesso minuto, sulla stessa asta | Tutte accettate (201), nessun errore |
| `measure-closings.mjs` | Dal database: ritardo di chiusura delle aste di una finestra di tempo | Nessuna oltre 5 secondi |

## Come si prepara

1. **Token.** `node tests/load/tokens.mjs users.json > tests/load/.state/tokens.json`: entra come il browser (password e codice TOTP) e scrive token e contesto di ogni utente di agenzia. In locale `users.json` si fa con gli utenti delle prove end-to-end (`tests/e2e/.state`, dopo una serie end-to-end); in collaudo con utenti di prova creati apposta (mai utenti veri, mai in produzione: lo script si rifiuta con `NODE_ENV=production`).
2. **Aste.** In collaudo: 200 richieste di prova approvate insieme (stesso orario di chiusura) e 50 agenzie di prova invitate a una di esse; `offers.json` con token, contesto, asta e l'intestazione `X-Offer` di ciascuna, più un PDF di preventivo coerente con il premio (`PDF_FILE`). Lo script che le crea si scrive nella parte B, quando c'è il collaudo.
3. **Strumento.** k6 da Docker: `docker run --rm -i --network host -v "$PWD/tests/load:/load" -w /load grafana/k6:<versione> run ...`.

I file in `.state/` contengono token: non vanno mai nel repository (`.gitignore`).

## Risultati

| Data | Dove | Prova | Esito |
| --- | --- | --- | --- |
| 2026-10-18 | PC di sviluppo (API in modalità sviluppo, poca memoria) | `agency-reads.js`, 20 utenti per 1 minuto, prima della correzione | Nessun errore, ma p95 6,96 s: «Le mie offerte» apriva ogni offerta in busta chiusa con una transazione e una voce di registro a testa (p50 4,6 s) |
| 2026-10-18 | Stesso PC | Stessa prova, dopo la correzione (una transazione, decifrature in parallelo, una voce di registro per tutte) | **Superata**: nessun errore, p95 193 ms; «Le mie offerte» p50 75 ms |
