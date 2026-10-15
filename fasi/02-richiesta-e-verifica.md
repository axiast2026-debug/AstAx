# Fase 2 — Richiesta e verifica

**Obiettivo.** Privati e broker creano una richiesta completa con lettura automatica dei documenti; il back office la verifica con la checklist e la approva, chiede un'integrazione o la esclude.

**Si chiude quando:** una richiesta va dal privato alla verifica approvata.

## Prima di iniziare

- Fase 1 chiusa in `docs/stato.md`.
- Da leggere: `docs/specifiche/00-panoramica-e-processi.md` (processo 1), `02-utenza-broker.md`, `03-utenza-privato.md`, `06-utenza-back-office.md` (coda e scheda di verifica), `09-decisioni-e-valori-predefiniti.md` (§2, §3, §4), `docs/modello-dati.md` (sezione «Clienti e richieste»), `docs/adattatori.md` (targa, lettura documenti, storage, cifratura dei campi), regole VIS-01, VIS-12, ASTA-10, LEG-04.
- Serve da Dan: la revisione, riga per riga, dei campi del preventivo (§3 della scheda 09), perché è il punto in cui contano l'esperienza con i portali delle compagnie.

## Cosa comprende

- Schema `QuoteData` e funzioni di dominio: codice fiscale (controllo, omocodia, data e comune di nascita, sesso), formati di targa, casi esclusi, colonne derivate, conformità della formula esperta (età minima dei conducenti dai parametri).
- Import dell'elenco dei comuni ISTAT con i codici catastali (script ripetibile).
- Adattatori finti: targa, lettura documenti (con esempi a bassa confidenza), storage MinIO, cifratura dei campi con indice cieco.
- Procedura guidata del privato (mobile, sei passaggi, bozza salvata a ogni passaggio): veicolo e attestato, conducenti e patenti, pacchetto (testi da `seed/pacchetti.json`), durata e validità minima (dai parametri), consensi con codice OTP, riepilogo e invio.
- Procedura guidata del broker (desktop, sei passaggi): cliente esistente o nuovo, veicolo, conducenti, copertura, asta, consenso con link al cliente (`consent.signature_request`, codice OTP) o caricamento del consenso già raccolto; elenco clienti e scheda cliente; elenco richieste con filtri; dettaglio con stato e cronologia.
- Controllo automatico verde, giallo, rosso: rosso per casi esclusi o incoerenze gravi (codice fiscale non valido, patente scaduta); giallo per campi sotto soglia di confidenza o differenze minori (per esempio residenza); verde altrimenti.
- Coda di verifica e scheda di verifica del back office: documenti a sinistra, dati estratti a destra affiancati a quelli dell'attestato, checklist con esito automatico, correzione e nota, differenze evidenziate. Azioni: approva, chiedi integrazione (motivi da elenco più testo), escludi.
- Correzioni del back office ai dati: nuova versione di `quoteData` con valore prima e dopo nel registro.
- Integrazione: il richiedente vede cosa manca, completa e la richiesta torna in coda.
- Area del privato: home, elenco preventivi, dettaglio con cronologia, archivio documenti.
- Notifiche (in app ed email su Mailpit): `request.submitted.bo`, `request.integration_requested`, `request.excluded`, `consent.signature_request`, `auth.otp`.
- Parametro `verification.autoApproveGreen` (già nel seed, spento): se acceso, le richieste verdi si approvano da sole. Resta spento durante il pilota (decisione 18b).

Non comprende: apertura dell'asta (fase 3). L'approvazione registra la decisione `APPROVED` e l'evento `RequestApproved`; la fase 3 lo trasforma nell'apertura.

## Criteri di accettazione

- [ ] End-to-end: Giulia Neri completa la procedura con targa e documenti finti, conferma i consensi con il codice e invia; l'operatore di verifica trova la richiesta verde in coda, apre la scheda e approva; la cronologia mostra ogni passaggio.
- [ ] End-to-end: Paolo Verdi crea una richiesta per Anna Riva con il link di consenso, e un'altra caricando il consenso già raccolto.
- [ ] Un caso escluso dichiarato nella procedura (per esempio uso taxi) blocca l'invio con un messaggio chiaro; un veicolo con più di trent'anni arriva in coda come rosso con il motivo.
- [ ] Un documento a bassa confidenza porta la richiesta in giallo, con i campi evidenziati.
- [ ] Integrazione chiesta → il richiedente completa → la richiesta torna in coda con la cronologia aggiornata.
- [ ] Dopo l'invio il richiedente non può modificare i dati (409); una correzione del back office crea una nuova versione registrata.
- [ ] Un test sullo schema dimostra che `quoteData` non contiene telefono ed email (base di VIS-01).
- [ ] Codice fiscale, telefono ed email sono cifrati nel database; la ricerca esatta per codice fiscale funziona con l'indice cieco.
- [ ] Opzioni di durata e validità vengono dai parametri.
- [ ] La procedura del privato funziona su viewport mobile, si usa da tastiera e ogni campo ha un'etichetta.
- [ ] Ogni apertura della scheda o di un documento da parte del back office è registrata.

## Test richiesti

- Unità: codice fiscale (anche omocodie), targhe, casi esclusi, controllo automatico, colonne derivate, formula esperta.
- Integrazione: invio con e senza consenso (LEG-04), stati della richiesta, versioni di `quoteData`, cifratura e indice cieco.
- End-to-end: i due percorsi del privato e del broker fino all'approvazione; integrazione; esclusione.

## Demo per Dan

Da telefono: una richiesta completa come privato. Da computer: la stessa come broker, con il link di consenso aperto da un secondo browser. Da back office in albanese: verifica, una richiesta di integrazione e un'approvazione.
