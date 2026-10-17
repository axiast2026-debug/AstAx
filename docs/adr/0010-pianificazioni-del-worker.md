# 0010 — Pianificazioni del lunedì e del primo del mese

- **Data:** 2026-10-17
- **Stato:** proposta (scelta tecnica della fase 6, da far vedere a Dan con la demo)
- **Fase:** 6

## Contesto

La fase 6 chiede due lavori a data fissa:

- la preparazione delle rimesse il lunedì (CONT-01, parametro `remittance.runDay`);
- la fattura mensile ai broker il primo del mese (decisione 24).

Il file della fase parla di «pianificazioni». Temporal ha gli «schedule», ma seguono l'ora vera del server. In sviluppo e nelle demo l'orologio dell'applicazione si può spostare in avanti (regola 13), e i lavori devono seguire quello. Inoltre uno «schedule» che salta un giorno perché il worker è fermo va recuperato a mano.

## Decisione

- Un timer del worker (`apps/worker/src/schedules.ts`) controlla ogni `SCHEDULES_INTERVAL_MS` (5 minuti di base) con l'orologio dell'applicazione.
- Rimesse: prepara sempre quelle dell'ultimo giorno di rimessa fino a oggi. Una rimessa per agenzia e giorno, quindi ripetere non crea doppioni e un worker fermo il lunedì recupera appena riparte.
- Fatture B: emette ogni giorno quelle del mese prima che mancano, una per broker e mese. Un worker fermo il primo del mese recupera il giorno dopo.
- Il back office ha comunque i pulsanti a mano: «Prepara le rimesse della settimana» in «Pagamenti» e «Emetti le fatture mensili ai broker» in «Fatturazione».
- Le fatture B create dal worker partono allo SDI dall'API, che ha il fornitore SDI e genera il PDF. Oggi succede quando il back office apre «Fatturazione»; in fase 8 un invio automatico.

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| Schedule di Temporal | Non segue l'orologio spostato delle demo; i giorni saltati non si recuperano da soli |
| Cron del sistema operativo | Un pezzo in più da installare e tenere d'accordo con il worker; stesso problema dell'orologio |

## Conseguenze

- Con più copie del worker il controllo gira in ognuna. Per le rimesse è innocuo: c'è un vincolo unico per agenzia e giorno. Per le fatture B c'è solo il controllo prima dell'emissione: con più copie del worker (fase 8) serve un vincolo unico per broker e mese, o un blocco.
- Se in produzione si vorrà un orario preciso (per esempio il lunedì alle 6), basta aggiungerlo come parametro al controllo.
