# Backup e ripristino (fase 8)

## Cosa si salva

| Cosa | Come | Quanto |
| --- | --- | --- |
| PostgreSQL | Backup automatico di RDS con ripristino a un istante (ogni 5 minuti circa) e snapshot giornaliero di AWS Backup | `backup_retention_days` (35 giorni) |
| Documenti (S3) | Versioni degli oggetti, backup giornaliero di AWS Backup | 35 giorni; versioni precedenti 30 giorni |
| Copie del registro attività | S3 con Object Lock in modalità COMPLIANCE: nessuno, nemmeno l'amministratore, può cancellarle | `audit_retention_days` (10 anni) |
| Configurazione | Terraform e codice nel repository; segreti in Secrets Manager (con versioni) | — |
| Redis | Solo dati temporanei (sessioni, tempo reale, limiti): non serve ripristinarlo | Snapshot 7 giorni |
| Temporal | Su Temporal Cloud (ADR 0012); i workflow si ricostruiscono dagli stati nel database | — |

## Obiettivi (confermati da Dan il 2026-10-22, domanda 22)

| | Obiettivo |
| --- | --- |
| Tempo massimo per tornare in servizio (RTO) | 4 ore |
| Dati persi al massimo (RPO) | 15 minuti |

## Prova di ripristino (da fare in collaudo, parte B)

1. Annotare l'ora T e contare alcune righe di controllo (richieste, offerte, registro).
2. Ripristinare RDS all'istante T in una nuova istanza (`restore-db-instance-to-point-in-time`), cambiare il segreto `DATABASE_URL_*` verso la nuova istanza, riavviare i servizi.
3. Controllare: le righe contate, `pnpm audit:verify` sulla catena del registro, un accesso e un preventivo di prova end-to-end.
4. Ripristinare un documento cancellato da una versione precedente su S3.
5. Scrivere qui sotto i tempi misurati e i dati persi.

| Data | Ambiente | Tempo di ripristino | Dati persi | Esito |
| --- | --- | --- | --- | --- |
