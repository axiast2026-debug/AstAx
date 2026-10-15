# Fase 7 — Pannelli e notifiche

**Obiettivo.** Back office e amministratore governano tutto dall'interfaccia; le notifiche arrivano sui canali giusti con testi modificabili; le funzioni rimaste delle aree utente sono complete.

**Si chiude quando:** tutti i parametri sono modificabili dall'interfaccia.

## Prima di iniziare

- Fase 6 chiusa in `docs/stato.md`.
- Da leggere: `docs/specifiche/06-utenza-back-office.md`, `07-utenza-amministratore.md`, `01-utenze-elementi-comuni.md` (notifiche, profilo), `docs/notifiche.md`, `seed/notifiche.yaml`, `docs/permessi.md` (back office e amministrazione), regole LEG, SIC-04, ASTA-09.
- Serve da Dan: rilettura delle traduzioni in albanese del back office e dei testi delle notifiche.

## Cosa comprende

- **Notifiche:** caricamento di `seed/notifiche.yaml` in `NotificationTemplate` con versioni; motore dei modelli (formattazione di importi e date in `it` e `sq`, pulizia delle variabili vuote); canali in app, email, SMS e Web Push (chiavi VAPID); preferenze per evento e canale nel profilo; `forcePush` e `mandatory`; nessuna notifica doppia per lo stesso evento; centro notifiche con contatore.
- **Pannello dell'amministratore:** cruscotto (volumi, passaggi, qualità, agenzie, economia, rischio, con filtri); regole d'asta; pacchetti e casi esclusi con versioni; economia (fee, soglie, penali, rimborsi, quota del broker, pesi del confronto AI); utenti e permessi (bloccare, sbloccare, reimpostare il secondo fattore, ruoli del back office); agenzie e broker (esclusioni, contestazioni, storico delle decisioni); documenti legali (versioni, editor Markdown, validazione, pubblicazione con nuova accettazione); comunicazioni (editor dei modelli con anteprima in `it` e `sq`, invio di prova, messaggi a gruppi); integrazioni (stato ed errori di ogni adattatore); registro attività (filtri, esportazione); report ed esportazioni (reclami per IVASS, estratti per il Garante, contabilità, revisori). Ogni modifica chiede un motivo e registra prima e dopo.
- **Pannello del back office completo:** dashboard operativa con code e attese massime; eccezioni (deserte, mancate emissioni, dati cambiati dopo l'accettazione, riconferme, recessi); pagamenti e riconciliazione con import dell'estratto conto (CSV o `camt.053`), abbinamento assistito e quadratura giornaliera; agenzie e broker (coda di ingresso con verifica RUI, mandati, RC professionale, contratti; approvazione o rifiuto; sospensione; proposta di esclusione); clienti (ricerca per nome, codice fiscale, targa; scheda; richieste sui dati personali); assistenza tramite lo strumento esterno; registro reclami (protocollo, scadenza a 45 giorni, avviso a 5 giorni, risposta, esportazione); segnalazioni con il registro degli accessi; fatturazione con stati SDI. Interfaccia completa anche in albanese.
- **Ingresso di agenzie e broker** dal sito: dati della società, numero RUI, mandati, documento della RC professionale, IBAN con conferma OTP, accettazione dei contratti; poi la coda del back office. Import periodico degli elenchi RUI con l'adattatore finto.
- **Caricamento in blocco del broker:** modello CSV più archivio dei documenti; controllo riga per riga; una bozza per riga; righe con errori da correggere.
- **Conservazione (LEG-06):** cancellazione automatica delle richieste non concluse dopo 12 mesi, con registrazione; esportazione dei dati di un cliente; cancellazione su richiesta, con i blocchi per gli obblighi di conservazione.
- **Elenchi e festività:** editor con etichette `it` e `sq`; calcolo della Pasquetta per l'anno successivo da confermare.
- **Approvazione automatica delle richieste verdi:** parametro `verification.autoApproveGreen`, spento.

## Criteri di accettazione

- [ ] Ogni chiave di `seed/parametri.json` si modifica dal pannello, con validazione, motivo e storico; un test scorre tutte le chiavi.
- [ ] Le aste aperte conservano i parametri di apertura; le nuove usano quelli modificati.
- [ ] I modelli delle notifiche si modificano, si vedono in anteprima e si inviano in prova; il back office li riceve in albanese se ha scelto `sq`; preferenze e push obbligatorie sono rispettate; nessun doppione.
- [ ] La matrice dei permessi del back office e dell'amministratore (`docs/permessi.md`) è verificata da un test a tabella per tutti i ruoli.
- [ ] Un'agenzia si registra, il back office la approva, l'agenzia riceve il primo invito.
- [ ] Il registro dei reclami assegna il protocollo, calcola la scadenza, avvisa a 5 giorni ed esporta.
- [ ] La riconciliazione abbina le righe dell'estratto ai pagamenti; le righe senza abbinamento vanno in coda.
- [ ] La cancellazione per conservazione elimina una richiesta non conclusa di 12 mesi fa (orologio controllato) e lo registra.
- [ ] Le esportazioni del registro attività sono a loro volta registrate.

## Test richiesti

- Unità: motore dei modelli, formattazione `it` e `sq`, validazione dei parametri, abbinamento della riconciliazione, controllo del CSV del caricamento in blocco.
- Integrazione: modifica dei parametri e istantanea delle aste, preferenze delle notifiche, ingresso delle agenzie, reclami, conservazione.
- End-to-end: amministratore che cambia la durata predefinita e un fee; back office in albanese che gestisce una mancata emissione e un reclamo; ingresso di una nuova agenzia.

## Demo per Dan

Come amministratore: cambiare la durata predefinita dell'asta e il fee del privato, modificare un testo di notifica e inviarlo in prova. Come back office in albanese: approvare una nuova agenzia, gestire un reclamo, riconciliare un estratto conto di prova.
