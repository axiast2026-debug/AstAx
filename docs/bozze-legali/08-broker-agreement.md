# Accordo di collaborazione con i broker

**Bozza n. 1 del 22/10/2026 — [DA VALIDARE — LEGALE]**

| | |
| --- | --- |
| Chiave del documento | `broker-agreement` |
| Chi lo firma | Il broker (intermediario iscritto al RUI sez. B), tramite il titolare o il legale rappresentante; con gli adattamenti indicati, l'intermediario di sez. E che lavora per un broker e si iscrive da solo come richiedente |
| Quando | All'ingresso (09 §7) |
| Fonti | `docs/specifiche/00` (Ruolo 1 e «Attenzione» sulla collaborazione a tre), `02`, `09` §1, §7; `docs/regole-di-dominio.md` (VIS-03, VIS-13, FEE-03, FEE-05, CONT-03, CONT-05, LEG-04); `docs/decisioni-aggiunte.md` (19, 24-26); `docs/piano-broker.md`; `docs/adr/0014`; `docs/punti-aperti.md`; `seed/parametri.json` (`fees.broker.amountCents`, `invoicing.brokerPaymentTermDays`, `brokerCommission.*`, `batch.*`, `consent.linkValidityDays`, `renewal.*`) |

> Convenzioni: [MAIUSCOLO] = dato da fornire. Importi e termini sono i valori in vigore oggi.

> **Nota per il legale:** collaborazione a tre intermediari (`docs/punti-aperti.md`; specifiche 00, riga 71). Nel canale del broker collaborano il broker richiedente (a contatto con il cliente), AstAx (broker che organizza l'asta e incassa) e l'agenzia emittente. Va deciso se lo schema è ammesso e quale: (A) AstAx collabora con il broker e con l'agenzia in due collaborazioni distinte; (B) il broker collabora direttamente con l'agenzia emittente e AstAx è solo fornitore della piattaforma e del servizio di incasso; (C) altro. Lo schema cambia: chi firma l'incarico con il cliente, chi consegna la MUP, chi incassa, chi risponde dei reclami. La bozza segue l'ipotesi (A), coerente con il codice di oggi (il cliente paga AstAx; il broker paga ad AstAx un compenso fisso), e lascia tra parentesi quadre i punti che cambiano con le altre ipotesi. La quota di provvigione del broker è prevista dal modello ma **spenta** (`brokerCommission.enabled` = false, 0%) fino alla decisione.

---

**Tra** [RAGIONE SOCIALE], sede legale [SEDE LEGALE], P.IVA [P.IVA], iscritta al RUI sez. B n. [NUMERO RUI], PEC [PEC], in persona di [LEGALE RAPPRESENTANTE] («AstAx»)

**e** {{ragione sociale del broker}}, sede {{sede}}, P.IVA {{partita IVA}}, iscritto al RUI sez. {{B, oppure E per conto di …}} n. {{numero RUI}}, PEC {{PEC}}, in persona di {{titolare}} («Broker»)

## Art. 1 — Oggetto

1.1 L'accordo regola l'uso della Piattaforma da parte del Broker per chiedere preventivi RC auto in asta per i propri clienti e la collaborazione tra il Broker e AstAx nella distribuzione delle polizze che ne derivano.

1.2 Fanno parte dell'accordo le Condizioni d'uso per i professionisti (documento 06), la Dichiarazione dell'intermediario sul consenso dei propri clienti (documento 09) e l'Accordo sul trattamento dei dati (documento 10).

## Art. 2 — Il rapporto con il cliente

2.1 Il cliente resta cliente del Broker. Il Broker raccoglie l'incarico del cliente, gli fornisce la propria informativa precontrattuale e ne valuta richieste ed esigenze; inserisce la richiesta sulla Piattaforma e, dopo la chiusura, gli propone le offerte. [Con l'ipotesi B o C: adattare.]

2.2 Il Broker vede solo i propri clienti e le proprie richieste; il titolare stabilisce se ogni operatore vede tutti i clienti o solo i propri.

> **Nota per il legale:** le fonti non dicono se AstAx si impegna a non proporre direttamente ai clienti del Broker servizi o rinnovi fuori dal canale del Broker. Oggi gli avvisi di rinnovo vanno al richiedente (il Broker), non al cliente. Valutare se inserire una clausola di reciprocità del non aggiramento a tutela del Broker.

## Art. 3 — Come funzionano le richieste

3.1 **Richiesta singola.** Il Broker sceglie o crea il cliente e compila la richiesta con le stesse schermate del privato (veicolo, tipo di guida, garanzie «Consigliato» o «Su misura», decorrenza); il back office completa e verifica i dati. Durata dell'asta e validità minima del prezzo sono quelle predefinite in vigore. Il contraente è sempre il cliente del Broker.

3.2 **Lotti.** Il Broker può caricare un file nel formato fisso di AstAx (oggi fino a 200 righe), con persone fisiche e società. Ogni riga diventa una richiesta, che parte verso il back office alla data programmata (oggi 7 giorni prima della scadenza della polizza in corso); i documenti sono chiesti prima (oggi 3 giorni prima dell'asta). Una richiesta senza documenti va solo alle agenzie che le accettano. Il Broker può anticipare l'invio.

3.3 Durante l'asta il Broker vede conto alla rovescia, numero di offerte e numero di agenzie invitate, senza nomi e senza prezzi. Dopo la chiusura vede, per ogni compagnia, la migliore offerta ancora garantita.

3.4 **Acquisto e firma del cliente.** Il Broker sceglie l'offerta per il cliente e la acquista dalla Piattaforma, pagando il premio ad AstAx; poi indica email o telefono del cliente, che riceve il link per firmare la documentazione con un codice ([ADR 0027](../adr/0027-acquisto-diretto-dell-intermediario.md)). Il cliente non paga compensi ad AstAx. **[DA VALIDARE — LEGALE]**

3.5 **Rinnovi.** Il Broker vede le scadenze dei propri clienti (oggi i prossimi 60 giorni) e può attivare per ogni cliente il rinnovo in asta (oggi 30 giorni prima della scadenza).

## Art. 4 — Consenso dei clienti

4.1 Prima di inviare una richiesta il Broker deve disporre del consenso del cliente alla condivisione dei dati con le agenzie invitate. Il consenso è raccolto con il link di consenso (valido oggi 7 giorni), oppure caricato dal Broker già firmato, oppure coperto dalla Dichiarazione dell'intermediario (documento 09).

4.2 Se un cliente revoca il consenso, il Broker lo registra subito sulla Piattaforma: da quel momento non si aprono nuove aste per quel cliente.

## Art. 5 — Incasso e documenti

5.1 Il cliente paga il premio ad AstAx tramite il link; il premio è versato sul conto separato di AstAx e rimesso all'agenzia emittente. Il cliente del Broker non paga compensi ad AstAx.

5.2 Dopo l'emissione il Broker trova nella Piattaforma l'agenzia emittente e i suoi contatti, lo stato dell'emissione, i documenti firmati, la polizza e la quietanza.

## Art. 6 — Compenso dovuto dal Broker

6.1 Per ogni polizza emessa su richiesta del Broker, il Broker paga ad AstAx un compenso di intermediazione fisso di **30 €** (valore in vigore oggi), senza riduzione per i premi bassi, esente IVA (art. 10, comma 1, n. 9, DPR 633/1972).

6.2 AstAx emette una fattura al mese per le polizze emesse nel mese; il Broker paga con bonifico entro il termine in vigore (oggi 30 giorni dalla fattura). In caso di ritardo [INTERESSI DI MORA / CONSEGUENZE].

6.3 Senza polizza emessa non è dovuto alcun compenso.

6.4 [Quota di provvigione del Broker: non prevista finché non è validato lo schema dell'art. 1 e la Nota iniziale. Se prevista: {{percentuale}} del premio imponibile, trattenuta dalla rimessa all'agenzia emittente e liquidata al Broker; esposta nell'estratto conto.]

> **Nota per il legale:** nelle specifiche 00 (riga 67) l'accordo con il broker deve contenere «la divisione delle provvigioni tra broker richiedente, AstAx e agenzia emittente»; oggi la divisione è spenta. Va deciso se e come riconoscere una remunerazione al broker richiedente, e come indicarla nell'informativa al cliente.

## Art. 7 — Estratto conto

7.1 Il titolare vede nella Piattaforma l'estratto conto: polizze emesse, premi, compensi dovuti ad AstAx, quota di provvigione se attiva, fatture e note di credito, esportabili.

## Art. 8 — Obblighi del Broker

8.1 Il Broker: inserisce dati veri e completi, di clienti che gli hanno conferito incarico; mantiene l'iscrizione al RUI e la RC professionale, caricandone la polizza con la scadenza; risponde dell'operato dei propri operatori e collaboratori; rispetta la busta chiusa, la riservatezza e il non aggiramento previsti dalle Condizioni d'uso per i professionisti; non usa la Piattaforma per finalità diverse dalla richiesta di preventivi per i propri clienti.

## Art. 9 — Intermediari di sezione E

9.1 L'intermediario di sez. E che lavora per un broker può iscriversi da solo come richiedente, indicando il numero RUI del broker per cui lavora, verificato da AstAx sul RUI. Ha le stesse funzioni e lo stesso compenso del Broker.

> **Nota per il legale:** verificare se un iscritto in sez. E può firmare in nome proprio questo accordo e chiedere preventivi per «propri» clienti, o se deve agire per conto del broker per cui è iscritto (con il suo consenso, eventualmente come utente dell'organizzazione del broker). Collegato alla nota sull'art. 1.3 del documento 06.

## Art. 10 — Durata, recesso, legge e foro

10.1 Durata: [DURATA]. Recesso con preavviso di [PREAVVISO] giorni via PEC. AstAx può risolvere con effetto immediato in caso di perdita dell'iscrizione al RUI, aggiramento accertato o violazione grave.

10.2 Alla cessazione restano dovuti i compensi delle polizze emesse e gli obblighi di riservatezza e non aggiramento.

10.3 Si applica la legge italiana. Foro esclusivo: [FORO COMPETENTE]. Le parti approvano specificamente, ai sensi degli artt. 1341 e 1342 c.c., gli artt. 6 (compensi e pagamento), 8 (obblighi), 10.1 (recesso e risoluzione) e 10.3 (foro).
