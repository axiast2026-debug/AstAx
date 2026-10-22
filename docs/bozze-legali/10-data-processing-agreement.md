# Accordo sul trattamento dei dati

**Bozza n. 1 del 22/10/2026 — [DA VALIDARE — LEGALE]**

| | |
| --- | --- |
| Chiave del documento | `data-processing-agreement` |
| Chi lo firma | L'agenzia (sez. A) e il broker (sez. B), tramite il titolare o il legale rappresentante |
| Quando | All'ingresso (09 §7) |
| Fonti | `docs/specifiche/00` (tabella dei ruoli; Ruolo 1 «Accordo sul trattamento dei dati»; Ruolo 3 «Accordo privacy»; Responsabilità di AstAx), `01` («Chi vede cosa»), `04`, `05`; `docs/regole-di-dominio.md` (VIS-01…13, SIC-01…08, LEG-04, LEG-06); `docs/busta-chiusa.md`; `docs/privacy/mappa-dati.md`; `docs/privacy/fornitori.md`; `docs/punti-aperti.md` («Ruoli privacy», «Dati in Albania», «Conservazione»); `docs/adr/0014`, `0015`; GDPR artt. 4, 24, 26, 28, 32-34, 44-46 |

> Convenzioni: [MAIUSCOLO] = dato da fornire.

## Proposta sui ruoli (per il legale e il DPO)

> **Nota per il legale:** ruoli privacy (`docs/punti-aperti.md`, «Ruoli privacy»: «Titolare e responsabile per agenzie e broker, nelle diverse fasi»). Le specifiche indicano due orientamenti: per le agenzie, «in fase d'asta l'agenzia tratta i dati per conto di AstAx (responsabile, art. 28 GDPR); dopo l'emissione diventa titolare autonoma per il contratto. Da validare» (specifiche 00, riga 147); per i broker, «il broker resta titolare dei dati dei propri clienti, i ruoli di AstAx e delle agenzie vanno definiti per iscritto» (specifiche 00, riga 69). La proposta seguente è quella che ci sembra più coerente con i flussi di dati descritti; la decisione spetta al legale e al DPO.

| Fase e canale | AstAx | Agenzia invitata | Agenzia vincitrice | Broker / agenzia richiedente |
| --- | --- | --- | --- | --- |
| Richiesta e verifica, canale privato | Titolare | — | — | — |
| Richiesta e verifica, canale intermediari | Titolare autonomo (propria attività di intermediazione: verifica, asta, incasso, obblighi IVASS e fiscali) | — | — | Titolare autonomo dei dati dei propri clienti |
| Asta (dalla apertura alla chiusura e fino alla scelta del cliente) | Titolare | **Responsabile per conto di AstAx** (art. 28), per il solo calcolo dell'offerta | — | Titolare autonomo |
| Dopo il pagamento confermato: emissione e gestione del contratto | Titolare per incasso, rimesse, documenti, reclami | Agenzie non vincitrici: nessun trattamento ulteriore, cancellazione | **Titolare autonomo** (emissione, contratto, assistenza, sinistri, obblighi verso la compagnia) | Titolare autonomo |

**Perché questa proposta.**
- Durante l'asta l'agenzia riceve i dati solo perché AstAx la invita, per la finalità decisa da AstAx (preparare un'offerta per un cliente di AstAx o dell'intermediario richiedente), con i mezzi decisi da AstAx (Piattaforma, dati senza contatti, filigrana, registro degli accessi): è lo schema tipico del responsabile.
- Dopo il pagamento l'agenzia tratta i dati per obblighi propri (emissione su mandato della compagnia, assistenza, obblighi verso compagnia e IVASS): è titolare autonoma, come già dicono le specifiche.
- Nel canale degli intermediari, AstAx svolge un'attività di intermediazione propria con obblighi propri (conto separato, reclami, fatturazione) e decide le modalità dell'asta: la qualificazione come responsabile del broker sembra poco coerente; la contitolarità (art. 26) è un'alternativa da valutare se le finalità dell'asta sono considerate decise insieme.

> **Nota per il legale:** alternative da valutare: (a) agenzie titolari autonome già in fase d'asta (usano i dati per formulare un'offerta propria, nel proprio interesse commerciale); (b) contitolarità AstAx-intermediario richiedente per la fase d'asta; (c) AstAx responsabile dell'intermediario richiedente. Ognuna cambia l'informativa (documento 02), la dichiarazione unica (documento 09) e questo accordo.

> **Nota per il legale:** compagnie. Per calcolare il preventivo l'agenzia inserisce i dati nei portali delle compagnie: anche la compagnia riceve i dati durante l'asta, prima di ogni scelta del cliente. Con la proposta sopra, l'inserimento nel portale è un trattamento svolto dall'agenzia come responsabile di AstAx: va deciso se la compagnia è un sub-responsabile (scenario poco realistico), un destinatario autonomo, o se l'inserimento nel portale va qualificato diversamente; e come dirlo nell'informativa.

---

**Tra** [RAGIONE SOCIALE] («AstAx»), titolare del trattamento, DPO [DPO]

**e** {{ragione sociale}}, iscritta al RUI sez. {{A / B}} n. {{numero RUI}} («Intermediario»), referente privacy {{nome, email}}

## Parte I — Disposizioni comuni

**Art. 1 — Oggetto.** L'accordo regola i trattamenti di dati personali connessi all'uso della piattaforma AstAx («Piattaforma») da parte dell'Intermediario, secondo i ruoli indicati nella tabella che precede, che ne fa parte.

**Art. 2 — Dati e interessati.** Interessati: clienti privati, clienti dell'Intermediario, contraenti, proprietari e conducenti dei veicoli. Dati: identificativi, dati del veicolo, storia assicurativa, patente, immagini dei documenti; dopo il pagamento, telefono ed email. Non sono trattate categorie particolari di dati; la nazionalità non è raccolta.

**Art. 3 — Misure di sicurezza della Piattaforma.** AstAx garantisce, tra le altre, le misure dell'Allegato 1. L'Intermediario usa la Piattaforma solo con utenze personali protette da secondo fattore, non condivide le credenziali e configura i permessi dei propri utenti secondo il principio del minimo necessario.

**Art. 4 — Violazioni dei dati.** Ciascuna parte informa l'altra senza ingiustificato ritardo, e comunque entro [ORE] ore dalla scoperta, di ogni violazione che riguardi dati trattati tramite la Piattaforma, con le informazioni dell'art. 33.3 GDPR, e collabora alla gestione.

**Art. 5 — Diritti degli interessati.** Le parti si informano reciprocamente, entro [GIORNI] giorni, delle richieste di esercizio dei diritti ricevute che riguardano l'altra, e collaborano per rispondere nei termini (AstAx risponde oggi entro 30 giorni).

**Art. 6 — Trasferimenti.** I dati della Piattaforma sono conservati nell'Unione europea. AstAx può far accedere ai dati personale del proprio back office che opera da [PAESE BACK OFFICE], con le garanzie dell'art. 46 GDPR. L'Intermediario non trasferisce fuori dall'Unione europea i dati ricevuti tramite la Piattaforma senza garanzie adeguate e senza informare AstAx.

> **Nota per il legale:** accesso del back office dall'Albania (`docs/punti-aperti.md`, «Dati in Albania»): garanzie da decidere con il DPO.

## Parte II — L'Intermediario come responsabile del trattamento durante l'asta (art. 28 GDPR)

Questa Parte si applica all'agenzia invitata a un'asta, per i dati di ogni richiesta, dall'invito fino alla chiusura del ciclo dell'asta (accettazione e pagamento del cliente, oppure scadenza o annullamento della richiesta).

**Art. 7 — Istruzioni.** L'agenzia tratta i dati solo per calcolare e presentare l'offerta sulla Piattaforma, secondo le istruzioni documentate di AstAx contenute in questo accordo, nelle Condizioni d'uso per i professionisti e nella Piattaforma. Non usa i dati per altre finalità, in particolare per contattare il cliente o il richiedente (divieto di aggiramento), per finalità commerciali proprie o per arricchire proprie banche dati.

**Art. 8 — Persone autorizzate.** L'agenzia fa trattare i dati solo dai propri utenti abilitati sulla Piattaforma (titolare, supervisori, collaboratori sez. E e dipendenti), vincolati alla riservatezza, e ne risponde. I collaboratori vedono solo le richieste nei propri filtri.

**Art. 9 — Misure dell'agenzia.** L'agenzia: consulta i dati e i documenti nella Piattaforma, che registra ogni apertura e appone una filigrana con agenzia, utente, data e ora; non scarica né conserva copie fuori dalla Piattaforma se non nella misura strettamente necessaria al calcolo; inserisce nei sistemi della compagnia solo i dati necessari al preventivo; adotta sui propri dispositivi misure adeguate (art. 32 GDPR).

**Art. 10 — Sub-responsabili.** L'agenzia è autorizzata in via generale a inserire i dati nei sistemi di preventivazione delle compagnie mandanti, nei limiti indicati nella Nota sulle compagnie. Non ricorre ad altri sub-responsabili senza autorizzazione scritta di AstAx.

**Art. 11 — Cancellazione.** Al termine del ciclo dell'asta, se l'agenzia non ha vinto, cancella entro [N GIORNI] giorni ogni copia di dati e documenti eventualmente estratta dalla Piattaforma, e su richiesta lo conferma per iscritto. I dati restano consultabili solo nella Piattaforma, nei limiti in cui la Piattaforma li mostra.

> **Nota per il legale:** il codice non prevede oggi un termine di cancellazione per le agenzie non vincitrici né una conferma: dopo la chiusura l'agenzia vede solo le proprie offerte e il loro stato (VIS-05), ma i documenti scaricati prima restano sui suoi dispositivi. Decidere il termine e se aggiungere un divieto di scaricamento.

**Art. 12 — Assistenza e verifiche.** L'agenzia assiste AstAx negli obblighi degli artt. 32-36 GDPR, mette a disposizione le informazioni necessarie a dimostrare il rispetto dell'art. 28 e consente verifiche, anche tramite il registro degli accessi della Piattaforma, che il titolare dell'agenzia può consultare per i propri utenti.

## Parte III — L'Intermediario come titolare autonomo

**Art. 13 — Agenzia vincitrice.** Dalla conferma del pagamento l'agenzia vincitrice riceve anche telefono ed email del cliente e tratta i dati come titolare autonomo per emettere la polizza, gestire il contratto, l'assistenza e i sinistri e adempiere agli obblighi verso la compagnia e le autorità. Fornisce al cliente, se dovuta, la propria informativa.

**Art. 14 — Intermediario richiedente.** Il broker (o l'agenzia) che chiede preventivi per i propri clienti è titolare autonomo dei loro dati: raccoglie incarico, informativa e consenso (o rende la dichiarazione unica, documento 09), comunica i dati ad AstAx e registra sulla Piattaforma le revoche del consenso. AstAx tratta i dati ricevuti come titolare autonomo per la propria attività (verifica, asta, incasso, rimesse, fatturazione, reclami, sicurezza e prevenzione delle frodi), e li comunica alle agenzie invitate secondo la Parte II.

**Art. 15 — Conservazione.** Ciascuna parte conserva i dati di cui è titolare per i tempi previsti dalla legge e dalla propria informativa. Sulla Piattaforma: richieste non concluse cancellate dopo 12 mesi; contratti e documenti contabili conservati per 10 anni (valori in vigore, da validare).

## Parte IV — Durata

**Art. 16.** L'accordo dura quanto l'accordo di collaborazione. Alla cessazione gli obblighi di cancellazione, riservatezza e assistenza restano in vigore per i dati ancora detenuti.

---

### Allegato 1 — Misure di sicurezza della Piattaforma (sintesi)

- Dati conservati in data center nell'Unione europea (Italia) presso [FORNITORE CLOUD]; cifratura in transito e a riposo; cifratura dedicata per codice fiscale, partita IVA, telefono, email e IBAN.
- Busta chiusa: le offerte sono cifrate all'arrivo e decifrate solo dal processo automatico di chiusura; nessun utente, nemmeno di AstAx, può leggerle prima.
- Contatti del cliente mai comunicati alle agenzie prima della vittoria e del pagamento, in nessuna schermata, esportazione, notifica o log.
- Permessi verificati per ruolo, contesto e organizzazione con negazione predefinita; sicurezza a livello di riga nel database.
- Registro degli accessi e delle azioni solo in aggiunta, con catena di hash e copie non modificabili.
- Filigrana sui documenti visti dalle agenzie; note delle offerte senza recapiti o link.
- Nessun dato personale nei log tecnici e negli strumenti di monitoraggio.
- Autenticazione a due fattori per tutte le utenze professionali; sessioni a durata limitata.
- Ripristino in caso di guasto grave entro 4 ore, con perdita massima di 15 minuti di dati.
