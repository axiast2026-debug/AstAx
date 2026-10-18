# Sorveglianza e allarmi (fase 8)

Proposta D approvata da Dan: errori su **Sentry** (regione UE), tempi delle richieste su **Grafana Cloud** (regione UE) tramite OpenTelemetry, allarmi su **CloudWatch** dai log dei servizi. Tutto è spento finché non ci sono le chiavi: senza `SENTRY_DSN` e `OTEL_EXPORTER_OTLP_ENDPOINT` nessun dato esce dai processi.

## Cosa esce, e cosa no (regola 8)

| Dove | Cosa arriva | Cosa non arriva mai |
| --- | --- | --- |
| Sentry | Tipo dell'errore e punti del codice (stack), servizio, versione | Messaggio dell'errore, richiesta, intestazioni, cookie, utente, valori delle variabili, tracce di navigazione |
| Grafana (OpenTelemetry) | Metodo, percorso senza parametri, stato e durata delle chiamate HTTP | Query string, intestazioni, corpi; i controlli di salute non sono tracciati |
| CloudWatch (log) | Le righe di log dei servizi, già con soli identificativi | Dati personali, prezzi, documenti (regola 8, test `release-gate` e Semgrep `astax-no-personal-data-in-logs`) |

Codice: `apps/api/src/telemetry.ts`, `apps/worker/src/telemetry.ts` (caricati per primi da `instrument.ts`); test `apps/api/test/telemetry.test.ts`.

## Variabili

| Variabile | A cosa serve |
| --- | --- |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `RELEASE` | Progetto Sentry (UE), ambiente (`collaudo`, `produzione`), versione rilasciata |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` | Indirizzo OTLP di Grafana Cloud e il suo token (in Secrets Manager) |

## Allarmi

Ogni allarme è una riga di log con il campo `alarm`; in AWS un filtro di metrica di CloudWatch la conta e l'allarme manda un'email (e in seguito un SMS) a chi è reperibile. I filtri sono nel Terraform (`infra/terraform`).

| Allarme | Riga di log | Quando scatta | Chi interviene |
| --- | --- | --- | --- |
| Passo d'asta che continua a fallire | `alarm: "WORKFLOW_STEP_FAILING"` (worker) | Un'attività di Temporal fallisce per la terza volta di fila | Tecnico reperibile |
| Chiusura d'asta in ritardo | `alarm: "AUCTION_CLOSE_LATE"` (worker, con `delayMs`) | Una chiusura arriva più di 5 secondi dopo l'ora prevista | Tecnico reperibile |
| Errori dei webhook | Riga `request` dell'API con percorso `/webhooks/...` e stato ≥ 400 | Più di 5 in 15 minuti | Tecnico reperibile, poi il fornitore |
| Termine di emissione scaduto | `alarm: "ISSUANCE_DEADLINE_MISSED"` (worker) | Ogni volta (c'è anche la notifica al back office) | Back office |
| Decifratura anomala della busta chiusa | `alarm: "KMS_ANOMALY"` (worker) | Il controllo notturno trova una decifratura prima della chiusura, da un ruolo diverso dal worker o senza asta | Amministratore (riceve anche notifica ed email) e tecnico |
| Errori imprevisti | Livello `error` (50) di API e worker; e Sentry | Più di 10 in 5 minuti | Tecnico reperibile |

## Controllo notturno delle chiavi (BC-03)

Ogni giorno il worker legge le decifrature fatte con la chiave della busta chiusa dall'ultimo controllo e le confronta con le aste: chi ha decifrato (solo il worker), per quale asta, e quando (non prima della chiusura, con 5 secondi di tolleranza). Le fonti sono due e indipendenti:

1. il registro dell'applicazione (`KmsEvent`), sempre;
2. CloudTrail di AWS, con `KMS_PROVIDER=aws`, `KMS_SEALED_BIDS_KEY_ID` (ARN) e `KMS_WORKER_ROLE_ARN`: è la fonte che non dipende dall'applicazione.

Un'anomalia finisce nel registro attività (`KMS_ANOMALY`), arriva agli amministratori (`security.kms_anomaly.admin`, obbligatoria) e scrive la riga di allarme. Prova: `apps/worker/test/int/schedules.int.test.ts` («a simulated early decryption raises the alarm»).
