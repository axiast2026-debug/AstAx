# 0024 — Aste aperte a tutte le agenzie, filtri per le email, IBAN alla prima offerta

- **Data:** 2026-10-29
- **Stato:** accettata (Dan, 2026-10-29, `docs/piano-agenzia-filtri-richiesta.md`)
- **Riferimenti:** ASTA-04, ASTA-05, ASTA-06, ASTA-08, VIS-01, VIS-06, EMI-06, GAR-07; ADR 0015, ADR 0023

## Contesto

Finora un'asta invitava al massimo 8 agenzie scelte con i filtri, la rotazione e la capacità (ASTA-04, ASTA-05). Solo le invitate vedevano la richiesta e potevano offrire. Dan:

- in «Partecipa all'asta» l'agenzia vede tutto l'elenco, con i filtri a mano o con «Applica i miei filtri»;
- i filtri servono a scegliere le aste che si ricevono per email;
- tutte le agenzie possono offrire (risposta A).

Dan ha anche chiesto:

- l'IBAN solo alla prima offerta, inserito da chi la invia (risposta B);
- niente IBAN e niente polizza di RC professionale nella registrazione;
- nome, email e telefono del cliente solo dopo l'acquisto.

## Decisione

1. **Tutte le aste aperte per tutte le agenzie.**
   - Ogni agenzia attiva vede ogni asta aperta e può offrire. Valgono le seguenti esclusioni:
     - un'agenzia sospesa (EMI-06);
     - un'agenzia lasciata fuori dal back office (ASTA-06);
     - l'agenzia richiedente e quelle in conflitto (ADR 0015);
     - un'agenzia senza mandati verificati con cui possa offrire;
     - le riconferme (GAR-07), che restano solo per chi aveva un'offerta valida.
   - L'agenzia entra nell'asta alla prima apertura o alla prima azione: si crea l'invito con origine `OPEN_LIST`, che vale come partecipazione per la presa in carico, l'offerta, la rinuncia e il registro.
2. **I filtri decidono le email.**
   - All'apertura ricevono l'invito e l'email tutte le agenzie con i filtri compatibili, senza limite e senza rotazione. Il parametro `invitations.max` non limita più gli inviti automatici; vale ancora per gli inviti a mano del back office.
   - Pausa, capacità giornaliera e orari di ricezione valgono solo per le email.
   - La prima asta si apre anche se nessun filtro è compatibile; la riapertura di un'asta deserta (ASTA-08) manda l'email alle compatibili non ancora avvisate.
3. **«Applica i miei filtri».** In «Partecipa all'asta» si filtra a mano (anche per classe CU, sinistri ed età del conducente) oppure con i filtri salvati dell'agenzia e del singolo utente (VIS-06).
4. **IBAN alla prima offerta.**
   - Senza IBAN dell'agenzia l'offerta riceve `IBAN_REQUIRED`.
   - Chi la invia, anche un sub-agente, chiede un codice via SMS sul proprio cellulare. Se l'account non ha un cellulare, lo scrive e diventa il suo.
   - Poi inserisce IBAN e codice (`/agency/iban`). Il registro tiene chi e quando, mai l'IBAN.
   - Al broker l'IBAN si chiede la prima volta che serve.
5. **Registrazione.**
   - Niente IBAN e niente polizza di RC professionale.
   - Il comune si sceglie dai suggerimenti, con il codice ISTAT e la provincia messi dal sistema.
   - Con un errore restano i dati scritti.
6. **La richiesta vista dall'agente.**
   - Si vedono i dati ANIA confermati, tranne il nome dell'intestatario e la scadenza della copertura, con la frase di Dan.
   - Si vedono il codice fiscale (o la partita IVA) e l'indirizzo del cliente, la tipologia del preventivo, la richiesta (guida, garanzie, scatola nera, decorrenza, validità, durata) e tutti i documenti, carta d'identità compresa.
   - L'API non manda più veicolo, persone e storia assicurativa: niente nomi prima dell'acquisto. I nomi restano nei documenti, che servono al preventivo (risposta C).
7. **Date** in GG/MM/AAAA ovunque.

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| Elenco di tutte le aste, offerta solo per le invitate | Dan ha scelto che offrano tutte (risposta A) |
| IBAN solo dal titolare | Dan: lo inserisce chi invia la prima offerta (risposta B) |
| Nascondere i documenti fino all'acquisto | Dan: servono al preventivo (risposta C) |

## Conseguenze

- Il numero di agenzie che partecipano non ha più un tetto; il broker vede come sempre il numero, senza nomi (VIS-03).
- Le regole ASTA-04, ASTA-05, ASTA-06 e ASTA-08 sono riscritte in `docs/regole-di-dominio.md`.
- La registrazione e il back office «Ingressi» mostrano IBAN e polizza solo per le richieste di ingresso fatte prima.
