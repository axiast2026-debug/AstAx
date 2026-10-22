# Decisioni di architettura (ADR)

Ogni scelta tecnica che non è già scritta nelle specifiche, o che se ne discosta, diventa un ADR: un file breve, numerato, che non si modifica dopo l'approvazione (si scrive un nuovo ADR che lo sostituisce).

Nome del file: `NNNN-titolo-breve.md`, per esempio `0001-stack-e-versioni.md`. Modello: [`0000-modello.md`](0000-modello.md).

ADR attesi:

| Numero | Titolo | Fase |
| --- | --- | --- |
| 0001 | Stack e versioni | 1 |
| 0002 | Autenticazione e accesso dei privati | 1 |
| 0003 | Storage S3 locale: SeaweedFS invece di MinIO | 1 |
| 0004 | Accesso dalle app web: token solo sul server | 1 |
| 0005 | Busta chiusa: libreria, formato e KMS finto | 3 |
| 0006 | Temporal: Cloud UE o installazione propria | 8 |
| 0007 | Dati della richiesta cifrati, bozza a sezioni, proprietà delle righe | 2 |
| 0008 | Worker delle aste e tempo reale | 3 |
| 0009 | File SEPA e fatture elettroniche: formato e controllo | 6 |
| 0010 | Pianificazioni del lunedì e del primo del mese | 6 |
| 0011 | Web Push e app installabile senza Serwist | 8 |
| 0012 | Temporal Cloud nella regione UE | 8 |
| 0013 | Richiesta del privato in due tempi: dati essenziali e completamento del back office | dopo la 8 |
| 0014 | Lotti dei broker: file Excel, richieste programmate, documenti a tempo | dopo la 8 |
| 0015 | L'agenzia che chiede preventivi per i suoi clienti | dopo la 8 |
| 0016 | I dati veri nella home pubblica | dopo la 8 |

I numeri seguono l'ordine in cui le decisioni vengono prese: la 0003 e la 0004 sono arrivate in fase 1, prima di quelle previste.
