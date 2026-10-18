# Registro dei fornitori ICT (fase 8)

Fornitori che trattano dati di AstAx o da cui AstAx dipende. Per ciascuno servono il contratto e, quando tratta dati personali, l'accordo sul trattamento (art. 28 GDPR). Le colonne «Contratto» e «Accordo dati» le completa Dan con il legale.

| Fornitore | Servizio | Dati che vede | Dove | Ruolo (da confermare con il DPO) | Uscita (se cambia fornitore) | Contratto | Accordo dati |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Amazon Web Services | Server, database, file, chiavi, email (SES), SMS, Claude su Bedrock, CloudTrail, backup | Tutti i dati, cifrati | UE, Milano | Responsabile | Terraform ricrea tutto altrove; dati esportabili | Da firmare | DPA di AWS |
| Temporal Technologies | Tempi delle aste e dei passi (Temporal Cloud, ADR 0012) | Solo identificativi e tempi | UE | Responsabile | Temporal installabile in proprio | Da firmare | Da firmare |
| Openapi | Dati del veicolo dalla targa; fatturazione elettronica SDI | Targa; dati delle fatture | Italia | Responsabile | Adattatore per InfoTarga, A-Cube | Da firmare | Da firmare |
| Namirial | Firma FEA con OTP | Nome, codice fiscale, telefono, email del firmatario; documenti | Italia | Responsabile (e prestatore di fiducia) | Adattatore per InfoCert | Da firmare | Da firmare |
| Fabrick | Incasso di premio e fee | Nome, email, importi | Italia | Responsabile / titolare autonomo per i pagamenti | Adattatore per Nexi | Da firmare | Da firmare |
| Sentry (Functional Software) | Errori del software | Tipo dell'errore e punti del codice, nessun dato personale | UE | Responsabile | Si spegne togliendo la chiave | Da firmare | DPA di Sentry |
| Grafana Labs | Tempi delle chiamate | Percorsi e tempi, nessun dato personale | UE | Responsabile | Si spegne togliendo la chiave | Da firmare | DPA di Grafana |
| GitHub (Microsoft) | Codice e CI | Solo codice; nessun dato reale (repository pubblico) | — | — | Git è portabile | Account esistente | — |
| Fornitore del test di sicurezza | Test esterno | Accesso al collaudo con dati sintetici | — | — | — | Da scegliere | NDA |

Il registro va tenuto aggiornato a ogni nuovo fornitore e riletto ogni anno; serve anche per le eventuali richieste di IVASS sui fornitori esterni critici.
