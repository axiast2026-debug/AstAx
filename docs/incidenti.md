# Procedura per gli incidenti (fase 8)

Vale per collaudo e produzione. Da rileggere con il legale e il DPO prima del lancio (tempi di notifica, contatti).

## Chi fa cosa

| Ruolo | Chi | Compiti |
| --- | --- | --- |
| Reperibile tecnico | Da nominare (turni) | Riceve gli allarmi (`docs/sorveglianza.md`), valuta, contiene, ripristina |
| Responsabile dell'incidente | Dan o un suo delegato | Decide, tiene i contatti con clienti, agenzie, fornitori |
| DPO | Da nominare | Valuta se c'è una violazione di dati personali e la notifica |

## Passi

1. **Rilevare.** Un allarme, una segnalazione del back office o di un cliente. Il reperibile apre una scheda dell'incidente con ora, cosa si vede e chi è stato avvisato.
2. **Classificare.** Gravità: alta (servizio fermo, dati esposti, busta chiusa a rischio), media (funzione importante rotta, ritardi nelle chiusure), bassa (difetto con un'alternativa).
3. **Contenere.** Esempi: bloccare un utente (pannello «Utenti»), sospendere un'agenzia, revocare le sessioni, togliere a un ruolo il permesso su una chiave KMS, fermare un servizio, mettere una regola nel WAF. Non cancellare log né dati: servono alle indagini.
4. **Busta chiusa.** Con l'allarme `KMS_ANOMALY` o un sospetto di lettura anticipata delle offerte: avvisare subito il responsabile; le aste coinvolte si annullano con motivazione e si riaprono (ASTA-08), le agenzie e i richiedenti sono informati.
5. **Dati personali.** Se dati personali sono stati letti, modificati, persi o resi indisponibili: il DPO valuta subito; la notifica al Garante va fatta **entro 72 ore** da quando AstAx ne ha conoscenza (art. 33 GDPR), e agli interessati senza ritardo se il rischio è alto (art. 34).
6. **Autorità di settore.** Se l'incidente tocca l'attività di intermediazione (pagamenti, polizze, contratti), il legale valuta le comunicazioni a IVASS.
7. **Ripristinare.** Dai backup (`docs/ripristino.md`) o con un rilascio correttivo; controllare la catena del registro (`pnpm audit:verify`).
8. **Chiudere.** Entro 5 giorni lavorativi una nota: cosa è successo, cause, impatto, cosa si cambia perché non si ripeta. Le note restano in un archivio interno (non nel repository pubblico).

## Contatti da tenere pronti

Fornitori (`docs/privacy/fornitori.md`) con i loro canali di emergenza; Garante per la protezione dei dati personali (modulo di notifica online); IVASS; legale; DPO. L'elenco con numeri e indirizzi sta in un documento interno, non nel repository pubblico (regola 12).
