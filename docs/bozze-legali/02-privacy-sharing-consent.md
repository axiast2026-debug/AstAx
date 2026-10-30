# Informativa privacy e consenso alla condivisione con le agenzie

**Bozza n. 1 del 22/10/2026 — [DA VALIDARE — LEGALE]**

| | |
| --- | --- |
| Chiave del documento | `privacy-sharing-consent` |
| Chi lo accetta | Il privato; nel canale degli intermediari, il cliente del broker (o dell'agenzia richiedente) tramite il link di consenso, oppure l'intermediario per i propri clienti con la dichiarazione unica (documento 09) |
| Quando | Prima dell'invio della richiesta (LEG-04); di nuovo a ogni nuova versione |
| Fonti | `docs/specifiche/00` (ruoli, Albania), `01`, `03`, `09` §7; `docs/regole-di-dominio.md` (VIS, SIC, LEG); `docs/privacy/mappa-dati.md`; `docs/privacy/fornitori.md`; `docs/punti-aperti.md` («DPO e privacy», «Consensi con una spunta sola», «Dichiarazione unica del broker»); `docs/adr/0013`, `0015`, `0016`, `0011`; `docs/notifiche.md`; `seed/parametri.json` (`retention.*`, `privacy.requestResponseDays`, `consent.linkValidityDays`) |

> Convenzioni: [MAIUSCOLO] = dato da fornire. I termini numerici vengono dai parametri in vigore.

---

## Parte I — Informativa sul trattamento dei dati personali (artt. 13 e 14 del Regolamento (UE) 2016/679, «GDPR»)

### 1. Titolare del trattamento e responsabile della protezione dei dati

Titolare è [RAGIONE SOCIALE] («AstAx»), sede legale [SEDE LEGALE], P.IVA [P.IVA], PEC [PEC], email privacy [EMAIL PRIVACY]. Responsabile della protezione dei dati (DPO): [DPO], contattabile a [EMAIL DPO].

> **Nota per il legale:** ruoli privacy nel canale degli intermediari (`docs/punti-aperti.md`, «Ruoli privacy»). Per i clienti di un broker o di un'agenzia richiedente, questa informativa presuppone che AstAx sia titolare autonomo dei dati che riceve dall'intermediario. La scelta va coordinata con l'Accordo sul trattamento dei dati (documento 10), dove è proposta e motivata.

### 2. Quali dati trattiamo

| Categoria | Esempi |
| --- | --- |
| Identità e contatti | Nome, cognome, codice fiscale o partita IVA, data e luogo di nascita, residenza, telefono, email |
| Dati del veicolo | Targa, marca, modello, allestimento, alimentazione, potenza, immatricolazione, uso, valore se indicato |
| Dati per il preventivo | Conducenti e tipo di guida, patente, storia assicurativa (classe di merito, sinistri degli ultimi anni, compagnia e scadenza attuali), garanzie richieste, decorrenza, premio attuale se indicato |
| Documenti | Immagini di libretto, patente, documento d'identità, attestato di rischio |
| Dati contrattuali e di pagamento | Offerta scelta, documenti firmati e prove della firma, esito e importi del pagamento (mai il numero completo della carta), fatture |
| Dati di utilizzo e sicurezza | Accessi, dispositivi, indirizzo IP, registro delle azioni e delle accettazioni dei documenti legali |
| Comunicazioni | Messaggi di assistenza, reclami, risposte al questionario dopo la vendita |

Non raccogliamo la nazionalità e non trattiamo categorie particolari di dati (art. 9 GDPR).

### 3. Da dove provengono i dati

Dall'interessato; dall'intermediario (broker o agenzia) che chiede il preventivo per il proprio cliente; dalla lettura automatica dei documenti caricati; dal servizio di ricerca dei dati del veicolo dalla targa ([FORNITORE DATI VEICOLO]); dalle agenzie che emettono la polizza (documenti di polizza).

### 4. Perché trattiamo i dati e su quale base

| Finalità | Base giuridica |
| --- | --- |
| a) Registrazione, accesso e gestione dell'account | Esecuzione del contratto (art. 6.1.b GDPR) |
| b) Lettura dei documenti, verifica della richiesta da parte del back office, organizzazione dell'asta | Misure precontrattuali e contratto (art. 6.1.b) |
| c) Comunicazione dei dati utili al preventivo alle agenzie invitate all'asta | Consenso specifico (art. 6.1.a), Parte II di questo documento — vedi Nota |
| d) Accettazione, firma FEA, pagamento, comunicazione dei contatti all'agenzia vincitrice, emissione, rimesse | Contratto (art. 6.1.b) |
| e) Obblighi di legge: fatturazione e contabilità, gestione dei reclami e comunicazioni all'IVASS, conservazione dei documenti di intermediazione | Obbligo legale (art. 6.1.c) |
| f) Sicurezza, prevenzione di frodi e di aggiramenti della Piattaforma, registro degli accessi ai dati | Interesse legittimo di AstAx e degli utenti (art. 6.1.f) |
| g) Confronto con AI, solo se il privato lo chiede | Contratto (art. 6.1.b) |
| h) Notifiche di servizio (asta, offerte, garanzie, emissione, rinnovo) | Contratto (art. 6.1.b) |
| i) Questionario di soddisfazione dopo l'emissione | [BASE GIURIDICA — DA DEFINIRE] |

> **Nota per il legale:** base giuridica della condivisione con le agenzie. Le specifiche (LEG-04) e il codice la trattano come un consenso revocabile: senza consenso non si invia la richiesta; dopo la revoca non si aprono nuove aste, quelle in corso continuano. Va valutato se la base corretta sia invece l'art. 6.1.b (misure precontrattuali richieste dall'interessato), mantenendo la spunta come autorizzazione contrattuale. La scelta cambia il testo della Parte II e gli effetti della revoca.

> **Nota per il legale:** questionario post-vendita (`survey.daysAfterIssuance` = 7 giorni) e domanda «sei stato contattato da altri?», usata anche per scoprire aggiramenti (specifiche 00, Processo 4, punto 9): definire la base giuridica (interesse legittimo o consenso).

### 5. Decisioni automatizzate e intelligenza artificiale

5.1 Un sistema di intelligenza artificiale legge i documenti caricati ed estrae i dati; il back office controlla e conferma ogni dato prima dell'asta. Il sistema non prende decisioni con effetti giuridici sull'interessato (art. 22 GDPR): ammissione all'asta, esclusioni e integrazioni le decide una persona.

5.2 Il confronto con AI è facoltativo. Il punteggio si calcola con criteri fissi; il modello di intelligenza artificiale riceve solo i dati riassuntivi delle offerte, senza dati personali, e scrive la spiegazione. Ogni suggerimento è conservato con i dati e i criteri usati.

5.3 I servizi di intelligenza artificiale sono erogati da [FORNITORE AI] in data center nell'Unione europea; il fornitore non usa i dati per addestrare i propri modelli e non li conserva oltre la singola elaborazione.

### 6. A chi comunichiamo i dati

| Destinatario | Quali dati e quando |
| --- | --- |
| Agenzie assicurative invitate all'asta (sez. A del RUI) e loro collaboratori (sez. E) | Durante l'asta, i dati utili al preventivo e i documenti, **mai telefono ed email**. Ogni apertura è registrata; i documenti portano una filigrana con agenzia, utente, data e ora |
| Agenzia vincitrice e compagnia che emette | Dopo il pagamento confermato: anche telefono ed email, per l'emissione e l'assistenza |
| Intermediario richiedente (broker o agenzia) | Per i propri clienti: i dati della richiesta, le offerte, l'esito |
| Personale di AstAx (back office, amministratori) | Secondo il ruolo; ogni accesso ai dati di un cliente è registrato |
| Fornitori che trattano dati per conto di AstAx | Infrastruttura cloud ([FORNITORE CLOUD], data center in Italia), firma FEA ([FORNITORE FEA]), pagamenti ([FORNITORE PAGAMENTI]), fatturazione elettronica ([FORNITORE SDI]), dati del veicolo ([FORNITORE DATI VEICOLO]), intelligenza artificiale ([FORNITORE AI]), email e SMS ([FORNITORE EMAIL/SMS]), gestione dei tempi delle aste ([FORNITORE WORKFLOW], solo identificativi). Elenco aggiornato su richiesta |
| Autorità | IVASS, Garante, autorità giudiziaria e fiscale, quando previsto dalla legge |

I dati non sono diffusi. La home pubblica della Piattaforma mostra solo dati anonimi o aggregati (tipo di veicolo, provincia, numero di offerte), mai nomi, targhe, prezzi, compagnie o agenzie.

> **Nota per il legale:** le notifiche al richiedente (app, email, push) possono contenere i prezzi delle offerte e la targa (`CLAUDE.md`, regola 8, risposta di Dan alla domanda 15). Va valutato se questo è accettabile per i canali email e push e se va detto nell'informativa. Attenzione: `docs/adr/0011-web-push-e-pwa.md` (riga 15) afferma ancora che il testo delle push «non contiene prezzi né dati personali».

> **Nota per il legale:** le agenzie inseriscono i dati nei portali delle compagnie per calcolare il preventivo: anche le compagnie ricevono i dati durante l'asta. Va deciso come rappresentarlo qui (destinatari autonomi?) e nell'Accordo sul trattamento dei dati.

### 7. Dove sono i dati e trasferimenti fuori dall'Unione europea

7.1 I dati sono conservati in data center nell'Unione europea (Italia). I fornitori sono stabiliti nell'Unione europea.

7.2 Parte del personale del back office può operare da un paese fuori dall'Unione europea ([PAESE BACK OFFICE]), accedendo da remoto ai dati che restano in Italia. L'accesso avviene con le garanzie dell'art. 46 GDPR ([GARANZIA — per esempio clausole contrattuali standard]); ogni accesso è registrato.

> **Nota per il legale:** dati e back office in Albania (`docs/punti-aperti.md`, «Dati in Albania»; specifiche 00, righe 214-217). L'Albania non ha una decisione di adeguatezza: il DPO decide le garanzie (clausole contrattuali standard e valutazione d'impatto del trasferimento) e se l'accesso da remoto va descritto come trasferimento.

### 8. Per quanto tempo conserviamo i dati

| Dati | Conservazione (valori in vigore) |
| --- | --- |
| Richieste non concluse con un acquisto | 12 mesi, poi cancellazione automatica |
| Contratti, documenti di intermediazione e contabili | 10 anni |
| Registro degli accessi e delle azioni | 10 anni (da confermare) |
| Log tecnici (senza dati personali) | Fino a 400 giorni |
| Dati dell'account senza richieste | [TERMINE — DA DEFINIRE] |

> **Nota per il legale:** i tempi di conservazione (`docs/punti-aperti.md`, «Conservazione»; LEG-06) sono valori provvisori: 12 mesi e 10 anni da validare con il DPO; manca un termine per gli account inattivi; per la FEA il DPCM 22/02/2013 prevede termini più lunghi per alcuni documenti (vedi documento 05).

### 9. I diritti dell'interessato

L'interessato può chiedere accesso, rettifica, cancellazione, limitazione, portabilità e opporsi al trattamento basato sull'interesse legittimo (artt. 15-22 GDPR); può revocare il consenso in ogni momento, senza effetto sui trattamenti già svolti. Dal profilo può scaricare una copia dei dati, correggerli o chiedere la cancellazione dell'account, salvo gli obblighi di conservazione. AstAx risponde entro il termine in vigore (oggi 30 giorni), e comunque entro i termini dell'art. 12 GDPR. L'interessato può proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).

### 10. Sicurezza

Tra le misure adottate: cifratura dei dati in transito e a riposo, con cifratura dedicata di codice fiscale, partita IVA, telefono, email e IBAN; offerte cifrate fino alla chiusura dell'asta («busta chiusa»); accesso con secondo fattore per i professionisti; permessi per ruolo con negazione predefinita; registro degli accessi non modificabile; filigrana sui documenti visti dalle agenzie; nessun dato personale nei log tecnici.

> **Nota per il legale:** valutazione d'impatto (art. 35 GDPR) da completare prima del lancio (`docs/punti-aperti.md`, «DPO e privacy»); il materiale di supporto è in `docs/privacy/mappa-dati.md` e `docs/privacy/fornitori.md`. L'esito può cambiare questa informativa (per esempio sull'uso dell'intelligenza artificiale e sugli accessi dall'estero).

### 11. Obbligatorietà

Senza i dati richiesti non è possibile preparare il preventivo e organizzare l'asta. Senza il consenso della Parte II la richiesta non può essere inviata.

---

## Parte II — Consenso alla condivisione dei dati con le agenzie attive su AstAx

Testo proposto per la spunta:

> ☐ Ho letto le Condizioni d'uso e l'Informativa privacy di AstAx e **acconsento a che AstAx comunichi i dati e i documenti della mia richiesta di preventivo alle agenzie assicurative attive su AstAx e ai loro sub-agenti, che vedono le aste aperte**, per il solo calcolo dell'offerta. So che telefono ed email saranno comunicati solo all'agenzia della polizza acquistata, dopo il pagamento (e, se la acquista il mio intermediario, dopo la mia firma).

> **Nota per il legale (2026-10-30):** dall'ADR 0024 le aste sono aperte a tutte le agenzie attive, non più solo a quelle invitate (prima «fino a 8»). Il testo della spunta nel portale è già stato adeguato; va validato insieme a questa parte. Domanda in `docs/punti-aperti.md`. Posso revocare il consenso in ogni momento dal profilo: da quel momento non si aprono nuove aste per me; le aste già aperte proseguono.

- Il consenso è registrato con versione del testo, data, ora e indirizzo IP.
- Per il cliente di un intermediario il consenso si dà dal link ricevuto (valido per il periodo in vigore, oggi 7 giorni), con conferma tramite codice; oppure è coperto dalla dichiarazione unica firmata dall'intermediario (documento 09), oppure l'intermediario carica il consenso già firmato dal cliente, che il back office controlla.

> **Nota per il legale:** una spunta sola (`docs/punti-aperti.md`, «Consensi con una spunta sola», decisione 5B di Dan del 2026-10-21). Oggi la stessa spunta copre accettazione delle condizioni, presa visione dell'informativa e consenso alla condivisione; non esistono consensi facoltativi (nessun consenso marketing nel codice). Va deciso se l'accettazione delle condizioni e il consenso privacy possono stare nella stessa spunta e, se in futuro si aggiungono usi facoltativi (marketing), se vanno separati. Il codice può separarli con un parametro. Nota collegata: `docs/specifiche/03-utenza-privato.md` (riga 28) parla ancora di consensi «firmati con OTP».

> **Nota per il legale:** dichiarazione unica dell'intermediario al posto del consenso di ogni cliente (`docs/punti-aperti.md`): vedi documento 09.
