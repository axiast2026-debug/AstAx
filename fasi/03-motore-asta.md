# Fase 3 — Motore d'asta

**Obiettivo.** Dall'approvazione l'asta si apre da sola, invita le agenzie giuste, riceve offerte cifrate e si chiude da sola all'ora calcolata sul calendario lavorativo, anche dopo un riavvio.

**Si chiude quando:** un'asta apre e chiude da sola con offerte cifrate.

## Prima di iniziare

- Fase 2 chiusa in `docs/stato.md`.
- Da leggere: `docs/busta-chiusa.md` (per intero), `docs/specifiche/08-architettura-tecnica.md` (motore d'asta), `docs/architettura-codice.md` (workflow), regole BC, ASTA, GAR-01…02, PRES-01…02, OFF-01…06, `docs/modello-dati.md` (sezioni «Compagnie e agenzie» e «Asta e offerte»), `docs/decisioni-aggiunte.md` (6-18).
- Serve da Dan: nulla di bloccante. Se ha già indicazioni dalle prime agenzie su filtri e capacità, conviene averle ora.

## Cosa comprende

- **Funzioni di dominio:** calendario lavorativo (somma di ore lavorative, frazioni della durata, sovrapposizione con gli orari di ricezione, cambi dell'ora legale); garanzia minima; ordinamento e parità (PRES-01); migliore offerta per compagnia (PRES-02); conformità delle coperture dichiarate al pacchetto (OFF-06); selezione delle agenzie (ASTA-05) con varietà di compagnie e rotazione; momento del promemoria (ASTA-07); rabbocco (ASTA-04).
- **Dati:** compagnie inventate, mandati, filtri, capacità, aste, inviti, prese in carico, offerte con versioni cifrate, classifica.
- **Busta chiusa** come in `docs/busta-chiusa.md`, con KMS finto: due chiavi master separate, quella delle buste caricata solo dal worker; `libsodium`.
- **Worker Temporal** con `QuoteRequestWorkflow`: segnale di approvazione → selezione → apertura (chiavi, inviti, notifiche) → timer di rabbocco, promemoria e chiusura → chiusura (apertura delle buste, conformità, classifica, migliori per compagnia, stati) → riapertura automatica se deserta (ASTA-08) → timer delle garanzie e passaggio a «Scaduta» quando sono tutte finite → promemoria GAR-05. Segnali del back office: prolungamento, nuovi inviti, annullamento.
- **API:** stato dell'asta per il richiedente (conto alla rovescia, numero di offerte; per il broker anche il numero di agenzie invitate); presa in carico, invio, modifica e ritiro dell'offerta e lettura della copia per l'agenzia (solo API: le schermate dell'agenzia sono in fase 4); elenco aste del back office in tempo reale senza prezzi; azioni del back office con motivo e registrazione.
- **Scheda di verifica:** anteprima delle agenzie selezionate (quante, quali compagnie coprono) con esclusione motivata.
- **Tempo reale:** WebSocket per contatori e cambi di stato (richiedente, elenco aste del back office).
- **Notifiche:** `auction.opened.requester`, `auction.invited`, `auction.closing_soon`, `auction.closed.requester`, `auction.closed.agency`, `auction.reopened.requester`, `auction.deserted.requester`, `auction.deserted.bo`, `guarantee.expiring`, `request.expired`.
- **Richiedente:** conto alla rovescia e contatore; dopo la chiusura un elenco semplice delle migliori offerte per compagnia (l'esperienza completa arriva in fase 5).
- **Strumenti di sviluppo** (attivi solo con `DEV_TOOLS=true`, mai in produzione, e il rilascio in produzione fallisce se sono accesi): far scattare subito il prossimo timer di una richiesta con un segnale al workflow; spostare in avanti l'orologio applicativo in sviluppo e collaudo; inviare offerte di prova a nome delle agenzie sintetiche. Servono alle demo e ai collaudi manuali.

## Criteri di accettazione

- [ ] L'approvazione apre l'asta con l'ora di chiusura corretta; i test del calendario coprono l'esempio di ASTA-02, il sabato, un festivo, i cambi dell'ora legale del 25/10/2026 e del 28/03/2027, un'approvazione notturna e una domenicale.
- [ ] Le offerte inviate via API sono cifrate; lo scenario S07 passa.
- [ ] L'asta si chiude da sola all'ora prevista (test con il tempo accelerato di Temporal) e si chiude correttamente anche se il worker è fermo all'ora di chiusura e riparte dopo.
- [ ] Un'offerta inviata dopo la chiusura è rifiutata, anche in un test di concorrenza con l'attività di chiusura.
- [ ] Lo scenario S04 passa; i test di dominio di S06 passano.
- [ ] La selezione rispetta filtri, capacità giornaliera, pausa, orari di ricezione, validità massima garantibile, sospensione, varietà di compagnie, rotazione, massimo di 8 e rabbocco di 4 a metà asta sotto le 3 offerte.
- [ ] Prolungamento (garanzia minima invariata), nuovi inviti solo nella prima metà (dopo: 409) e annullamento funzionano e sono registrati.
- [ ] Un'asta aperta non cambia se l'amministratore modifica i parametri (ASTA-09).
- [ ] Un test serializza la storia dei workflow e non trova premi, codici fiscali o nomi di compagnie (BC-07, SIC-06).
- [ ] I testi delle notifiche resi per le agenzie non contengono dati di contatto del cliente né prezzi (test sui modelli resi).

## Test richiesti

- Unità: tutte le funzioni di dominio elencate, con il codice della regola nel nome.
- Workflow: apertura, rabbocco, promemoria, chiusura, riapertura, garanzie, segnali del back office, riavvio del worker.
- Integrazione: cifratura, 403 per ruolo, concorrenza invio-chiusura, selezione con dati sintetici.
- End-to-end: S04, S07.

## Demo per Dan

Approvare una richiesta, guardare l'asta nel pannello del back office (contatori senza prezzi), inviare offerte da un comando di sviluppo come se fossero tre agenzie, provare a leggerle da amministratore (rifiutato e registrato), attendere la chiusura e vedere il risultato dal lato del richiedente.
