# Decisioni di architettura (ADR)

Ogni scelta tecnica che non è già scritta nelle specifiche, o che se ne discosta, diventa un ADR: un file breve, numerato, che non si modifica dopo l'approvazione (si scrive un nuovo ADR che lo sostituisce).

Nome del file: `NNNN-titolo-breve.md`, per esempio `0001-stack-e-versioni.md`. Modello: [`0000-modello.md`](0000-modello.md).

ADR attesi:

| Numero | Titolo | Fase |
| --- | --- | --- |
| 0001 | Stack e versioni | 1 |
| 0002 | Autenticazione e accesso dei privati | 1 |
| 0003 | Storage S3 locale: SeaweedFS invece di MinIO | 1 |
| 0004 | Libreria e formato della busta chiusa | 3 |
| 0005 | Temporal: Cloud UE o installazione propria | 8 |

I numeri seguono l'ordine in cui le decisioni vengono prese: la 0003 è arrivata in fase 1, prima di quelle previste.
