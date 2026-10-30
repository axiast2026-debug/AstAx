# 0026 — Sub-agenti e collaboratori (sez. E): i poteri del titolare, senza team

- **Data:** 2026-10-30
- **Stato:** accettata (Dan, 2026-10-30, `docs/piano-ruoli-acquisto-icone.md`)
- **Riferimenti:** SIC-01, VIS-13; ADR 0015, ADR 0024

## Contesto

Dan ha fissato i ruoli.

**Chiedono preventivi:**
- privati;
- broker (sez. B);
- collaboratori (sez. E) di un broker;
- agenti (sez. A);
- sub-agenti (sez. E) di un agente.

**Offrono:**
- agenti;
- sub-agenti.

Sub-agenti e collaboratori si iscrivono allo stesso modo, da «Lavora con AstAx», con il proprio RUI sez. E e il RUI di chi li incarica. Il sub-agente ha gli stessi poteri dell'agente, tranne creare un team. Lo stesso vale per il collaboratore rispetto al broker (risposta 2). Il team resta solo per i dipendenti del titolare (risposta 1).

Chi si iscrive con la sez. E diventa già oggi un'organizzazione propria (`ruiSection = E`), di cui è titolare (`OWNER`). Così aveva già tutti i poteri del titolare, team compreso.

## Decisione

1. **Una regola del permesso può escludere le organizzazioni sez. E.** La regola ha l'opzione `notForSectionE`, e l'attore che appartiene a un'organizzazione sez. E porta `sectionE: true`. Oggi l'unico permesso escluso è `team.manage`: la voce «Team» sparisce dal menu e l'API risponde 403.
2. **Tutto il resto è identico al titolare,** controllato da una prova a tabella su ogni azione. Questo comprende richieste, clienti, offerte (per il sub-agente), filtri, prodotti, contabilità, registro accessi e IBAN.
3. **I membri del team** (`SUPERVISOR`, `OPERATOR`) restano i dipendenti del titolare, con le abilitazioni che il titolare concede.
4. **L'iscrizione non cambia.** Cambiano solo i testi, che ora nominano sub-agenti e collaboratori.

## Conseguenze

- `/me` e il contesto attivo dicono `organization.sectionE`, così web e admin calcolano il menu con la stessa regola dell'API.
- Un'organizzazione sez. E creata prima con un team non perde i membri, ma non può più gestirli. Nella demo non ce ne sono.
