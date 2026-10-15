# Fase 6 — Dopo l'acquisto

**Obiettivo.** L'agenzia emette nei termini, AstAx gestisce ritardi e mancate emissioni, rimette i premi, fattura i fee, pubblica i risultati alle agenzie e propone i rinnovi.

**Si chiude quando:** gli scenari privato, broker, mancata emissione e premio basso sono completi (S01, S02, S05, S08, S09).

## Prima di iniziare

- Fase 5 chiusa in `docs/stato.md`.
- Da leggere: `docs/specifiche/00-panoramica-e-processi.md` (processo 4), `04-utenza-agenzia.md` (Da emettere, Risultati, Contabilità), `02-utenza-broker.md` (Polizze, Rinnovi, Contabilità), `06-utenza-back-office.md` (Eccezioni, Pagamenti, Fatturazione), regole EMI, CONT, CLA, PAG-04…06, `docs/decisioni-aggiunte.md` (23-31).
- Serve da Dan: conferma del commercialista su natura IVA, dicitura in fattura, imposta di bollo e frequenza delle fatture (parametri `invoicing.*`). Si può partire con i valori proposti e cambiarli dopo.

## Cosa comprende

- **Emissione:** «Da emettere» completo (conto alla rovescia, dati, contatti, documenti firmati, ricevuta); caricamento di polizza, quietanza e certificato; «segna come emessa» → `Policy`; notifiche al privato, al broker e al cliente del broker; documenti nell'area del cliente; elenchi delle polizze per privato, broker e agenzia.
- **Termini:** avviso 60 minuti prima (agenzia e back office); termine superato → proposta di penale per ritardo; segnalazione di un problema da parte dell'agenzia (`IssuanceProblem`) → caso al back office.
- **Mancata emissione (EMI-04):** decisione del back office sulla causa; colpa dell'agenzia → penale, stato «Mancata emissione», proposta della seconda offerta con 24 ore per confermare, addebito o rimborso della differenza e ricalcolo del fee; colpa di dati del cliente → nuovo prezzo dall'agenzia e conferma del cliente, oppure rimborso.
- **Penali (EMI-05, EMI-06):** proposta, applicazione del supervisore, contestazione dell'agenzia, decisione dell'amministratore (pagine semplici, il pannello completo è in fase 7); sospensione automatica dopo 3 mancate emissioni in 6 mesi.
- **Rimesse (CONT-01, CONT-02):** pianificazione del lunedì (Temporal, fuso di Roma) che crea le rimesse in bozza con premi, fee, penali, recuperi e quote del broker (se attive) e il residuo da riportare; revisione della contabilità; file SEPA `pain.001` validato contro lo schema XSD ufficiale; «eseguita»; notifica; estratto conto dell'agenzia.
- **Fatture (CONT-03, CONT-04):** numerazione per serie e anno senza buchi; fattura al privato all'emissione; fattura all'agenzia per rimessa; fattura mensile al broker (pianificazione del primo giorno del mese); dati FatturaPA con natura, dicitura e bollo dai parametri; XML validato contro lo schema ufficiale; adattatore SDI finto con stati; PDF di cortesia; note di credito per i rimborsi del fee.
- **Classifica e risultati:** pagina «Risultati» dell'agenzia e del sub-agente (CLA-03) con statistiche di base (tasso di risposta, di vittoria, scarto medio, tempo medio di emissione); pubblicazione all'annullamento senza accettazione (CLA-02) e annullamento automatico delle richieste scadute da 30 giorni (GAR-06).
- **Contabilità del broker (CONT-05)** ed esportazione CSV.
- **Rinnovi:** `PolicyWorkflow` con avviso a 30 giorni; «Rinnova in asta» del privato con bozza già compilata (serve il nuovo attestato); rinnovo automatico per cliente del broker e azione in blocco per le scadenze del mese; agenzia attuale invitata in automatico.
- **Recesso e rimborsi (PAG-04, PAG-05):** richiesta del cliente, premio rimborsabile indicato dall'agenzia, approvazione del supervisore, rimborso tramite adattatore, recupero dalla rimessa dell'agenzia.
- **Questionario post-vendita** a 7 giorni: la risposta «sì» alla domanda «sei stato contattato da altri?» crea una segnalazione di aggiramento.

## Criteri di accettazione

- [ ] Gli scenari S01 (completo), S02, S05, S08 e S09 passano.
- [ ] I test delle rimesse coprono penali, recuperi, quote del broker, residui riportati e il divieto di rimesse negative; il file SEPA supera la validazione XSD.
- [ ] La numerazione delle fatture non ha buchi anche con emissioni concorrenti; il bollo si applica sopra soglia; natura e dicitura vengono dai parametri; l'XML supera la validazione dello schema FatturaPA.
- [ ] Il ciclo delle penali funziona con contestazione e decisione; la sospensione scatta alla terza mancata emissione in 6 mesi (test con orologio controllato).
- [ ] La classifica è visibile solo dopo la pubblicazione e mostra esattamente i dati di CLA-03; l'offerta esclusa vede la variante.
- [ ] Il rinnovo parte a 30 giorni e invita l'agenzia attuale.
- [ ] La risposta «sì» al questionario crea una segnalazione per il back office.

## Test richiesti

- Unità: rimesse, numerazione e importi delle fatture, bollo, differenze della seconda offerta, sospensione.
- Workflow: termini di emissione, seconda offerta, `PolicyWorkflow`, pianificazioni.
- Integrazione: penali, rimborsi, fatture e note di credito, recupero dalla rimessa.
- End-to-end: S01, S02, S05, S08, S09.

## Demo per Dan

Chiudere S01 fino alla rimessa del lunedì e alla fattura; simulare la mancata emissione di S05 con la seconda offerta; aprire la pagina «Risultati» di Agenzia Uno; generare il file dei bonifici; vedere l'estratto conto del broker.
