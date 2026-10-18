# 0012 — Temporal Cloud nella regione UE

- **Data:** 2026-10-18
- **Stato:** approvata (proposta B del piano della fase 8, approvato da Dan il 2026-10-18)
- **Fase:** 8

## Contesto

Il file della fase 8 chiede una decisione tra Temporal Cloud nell'UE e un'installazione propria di Temporal su AWS. Temporal tiene i tempi delle aste, delle garanzie e delle emissioni (ADR 0008): se si ferma, le aste non chiudono. Un'installazione propria vuol dire un cluster in più (servizi di Temporal, il loro database, gli aggiornamenti, le copie di sicurezza) da far funzionare giorno e notte.

## Decisione

- **Temporal Cloud**, namespace in una regione dell'UE (Francoforte o Milano se disponibile), uno per il collaudo e uno per la produzione.
- Accesso con una **chiave API** per ambiente (`TEMPORAL_API_KEY`, in AWS Secrets Manager); con la chiave la connessione usa TLS. Senza chiave l'API e il worker si collegano al Temporal locale di sviluppo, come oggi.
- Nei payload dei workflow restano solo identificativi (SIC-06, già così dalla fase 3): Temporal Cloud non vede dati personali, prezzi o documenti. La cifratura dei payload, facoltativa nel file della fase, non serve finché vale questa regola.

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| Temporal installato su ECS con il suo database | Più lavoro di gestione e reperibilità per una piccola squadra; il costo dell'abbonamento è minore del tempo speso |
| Code e timer fatti in casa (database + cron) | Rinuncia alle garanzie di Temporal sui tempi e sui nuovi tentativi, su cui poggia ASTA-04 |

## Conseguenze

- Costo mensile di Temporal Cloud in base alle azioni consumate: la stima va nel prospetto dei costi che Dan approva prima di creare gli ambienti.
- Contratto e accordo sul trattamento dei dati con Temporal Technologies (elenco dei fornitori in `docs/go-live.md`).
- Le prove a tempo accelerato restano sull'ambiente di test di Temporal, senza rete.
