# Accordo di collaborazione con le agenzie

**Bozza n. 1 del 22/10/2026 — [DA VALIDARE — LEGALE]**

| | |
| --- | --- |
| Chiave del documento | `agency-agreement` |
| Chi lo firma | L'agenzia (intermediario iscritto al RUI sez. A), tramite il titolare o il legale rappresentante |
| Quando | All'ingresso, prima dell'approvazione da parte del back office (09 §7) |
| Fonti | `docs/specifiche/00` (Principi generali; Ruolo 3 «Contratto con AstAx»; Processo 4; Responsabilità di AstAx), `04`, `05`, `06`, `09` §1, §5, §7; `docs/regole-di-dominio.md` (OFF, GAR, PAG, EMI, CONT, CLA, FEE-04); `docs/decisioni-aggiunte.md` (17, 21, 23-25, 27-31); `docs/adr/0015`; `docs/piano-agenzie.md`; `docs/punti-aperti.md`; `seed/parametri.json` (`fees.agency.amountCents`, `fees.broker.amountCents`, `remittance.*`, `penalties.*`, `invoicing.*`, `brokerCommission.*`) |

> Convenzioni: [MAIUSCOLO] = dato da fornire. Tutti gli importi e i termini sono i valori in vigore oggi; si applicano quelli in vigore all'apertura di ogni asta.

---

**Tra** [RAGIONE SOCIALE], sede legale [SEDE LEGALE], P.IVA [P.IVA], iscritta al RUI sez. B n. [NUMERO RUI], PEC [PEC], in persona di [LEGALE RAPPRESENTANTE] («AstAx»)

**e** {{ragione sociale dell'agenzia}}, sede {{sede}}, P.IVA {{partita IVA}}, iscritta al RUI sez. A n. {{numero RUI}}, PEC {{PEC}}, in persona di {{titolare o legale rappresentante}} («Agenzia»)

## Premesse

a) AstAx gestisce la piattaforma AstAx («Piattaforma»), su cui privati e intermediari chiedono preventivi RC auto, che AstAx verifica e mette all'asta a busta chiusa tra agenzie invitate.
b) L'Agenzia distribuisce contratti RC auto in base ai mandati delle compagnie indicate nell'Allegato A, verificati sul RUI.
c) Le parti intendono collaborare nella distribuzione ai sensi dell'art. 22, comma 10, del d.l. 179/2012 convertito dalla l. 221/2012: AstAx come intermediario **proponente**, a contatto con il cliente; l'Agenzia come intermediario **emittente**.

## Art. 1 — Oggetto

1.1 Il presente accordo regola la collaborazione orizzontale tra AstAx e l'Agenzia per la distribuzione, tramite la Piattaforma, dei contratti RC auto (e delle garanzie accessorie richieste) delle compagnie mandanti dell'Agenzia.

1.2 Fanno parte dell'accordo: le Condizioni d'uso per i professionisti (documento 06), l'Accordo sul trattamento dei dati (documento 10) e gli allegati: A) compagnie mandanti e prodotti; B) compensi e penali in vigore; C) dichiarazione di responsabilità per i collaboratori.

> **Nota per il legale:** verificare gli adempimenti verso le compagnie mandanti per la collaborazione orizzontale (informativa o consenso della compagnia, eventuali limiti del mandato) e se l'accordo va comunicato o conservato in una forma particolare.

## Art. 2 — Ruoli

2.1 **AstAx** raccoglie la richiesta e l'incarico del cliente, verifica i dati, organizza l'asta, presenta le offerte al cliente, cura la firma della documentazione e l'incasso del premio, consegna al cliente i documenti di polizza, gestisce i reclami relativi alla propria attività.

2.2 **L'Agenzia** calcola e presenta le offerte sui sistemi delle compagnie mandanti, emette le polizze aggiudicate, fornisce al cliente l'assistenza post-vendita e sui sinistri, mette a disposizione della Piattaforma la documentazione di prodotto (DIP, DIP aggiuntivo, condizioni) per ogni compagnia e prodotto offerto, e la aggiorna.

2.3 Ciascuna parte resta responsabile verso il cliente per gli obblighi di comportamento e di informativa che la legge le attribuisce nella propria fase dell'attività.

## Art. 3 — Partecipazione alle aste

3.1 L'Agenzia partecipa alle aste a cui è invitata secondo i filtri, la capacità e gli orari che imposta, e secondo le regole delle Condizioni d'uso per i professionisti: busta chiusa, un'offerta per agenzia e per persona, offerta vincolante con data di prezzo garantito, coperture uguali o migliori di quelle richieste, preventivo PDF obbligatorio.

3.2 Il rischio di un cambio di tariffa della compagnia durante la garanzia è a carico dell'Agenzia, che emette comunque al prezzo offerto.

3.3 L'Agenzia riceve telefono ed email del cliente solo se vince e il pagamento è confermato.

## Art. 4 — Emissione

4.1 L'Agenzia emette entro il termine in vigore (oggi 4 ore lavorative dalla conferma del pagamento, dal lunedì al venerdì dalle 9 alle 19, esclusi i festivi) e comunque prima della decorrenza, e carica sulla Piattaforma polizza, quietanza e certificato.

4.2 In caso di mancata emissione per causa dell'Agenzia, AstAx propone al cliente la seconda offerta e si applicano le penali dell'art. 8.

## Art. 5 — Incasso del premio e rimesse

5.1 AstAx incassa dal cliente il premio, tramite [FORNITORE PAGAMENTI], sul proprio conto separato (art. 117 CAP).

5.2 **Rimessa settimanale.** Ogni [GIORNO RIMESSA — oggi lunedì] AstAx rimette all'Agenzia, per le polizze emesse fino alle 23:59 del [GIORNO CHIUSURA — oggi venerdì] precedente: premio lordo − compenso di AstAx (art. 6) − penali applicate − premi da recuperare per rimborsi ai clienti − quota di provvigione del broker richiedente, se prevista (oggi non prevista). La rimessa non è mai negativa: un residuo da trattenere passa alla rimessa successiva.

5.3 La rimessa è eseguita con bonifico SEPA sull'IBAN indicato dall'Agenzia, che riceve un avviso e trova il dettaglio nell'estratto conto.

5.4 L'Agenzia versa alla compagnia il premio secondo il proprio mandato. La cadenza delle rimesse deve consentire all'Agenzia di rispettare i termini verso la compagnia.

5.5 Se un premio è rimborsato al cliente dopo l'emissione, l'importo indicato dall'Agenzia secondo le condizioni della compagnia è recuperato come voce negativa della rimessa successiva.

> **Nota per il legale:** effetto liberatorio del pagamento ad AstAx (art. 118 CAP; `docs/punti-aperti.md`). L'accordo deve dire chiaramente se il pagamento del cliente ad AstAx libera il cliente verso la compagnia mandante dell'Agenzia e da quale momento, e chi sopporta il rischio tra l'incasso di AstAx e la rimessa.

> **Nota per il legale:** recesso e annullamenti dopo l'emissione si gestiscono fuori dalla Piattaforma (domanda 18, `withdrawal.onPlatform` spento), ma il recupero del premio rimborsato dalla rimessa (PAG-04, CONT-01) presuppone che AstAx ne sia informata: va previsto un obbligo dell'Agenzia di comunicarlo e un flusso per il rimborso al cliente.

## Art. 6 — Compensi

6.1 Per ogni polizza emessa tramite la Piattaforma l'Agenzia riconosce ad AstAx un compenso fisso di **15 €** (valore in vigore oggi), trattenuto dalla rimessa. Il compenso è un compenso di intermediazione esente IVA (art. 10, comma 1, n. 9, DPR 633/1972); AstAx emette una fattura per ogni rimessa.

6.2 Senza polizza emessa non è dovuto alcun compenso.

6.3 L'Agenzia percepisce le provvigioni previste dal proprio mandato. Nessuna quota delle provvigioni dell'Agenzia è dovuta ad AstAx.

> **Nota per il legale:** le specifiche 00 (Ruolo 3, riga 144) prevedono nell'accordo la «ripartizione di provvigioni e fee», ma oggi il compenso di AstAx è solo il fee fisso: nessuna ripartizione delle provvigioni è implementata. La frase 6.3 riflette il codice di oggi; va confermata, anche per l'informativa al cliente (MUP, Parte II, Sezione III).

> **Nota per il legale:** imposta di bollo sulle fatture esenti sopra la soglia (oggi 77,47 €, bollo 2 €, a carico del destinatario: `invoicing.stampDuty.*`): da confermare con il commercialista.

## Art. 7 — L'Agenzia come richiedente

7.1 L'Agenzia e i suoi collaboratori possono chiedere preventivi in asta per i propri clienti, con le stesse modalità previste per i broker (dichiarazione unica sul consenso dei clienti, documento 09; link al cliente per scegliere, firmare e pagare; lotti da file).

7.2 Alle aste chieste dall'Agenzia le altre agenzie sono invitate solo per le compagnie non in comune con l'Agenzia, che non è invitata alle proprie aste.

7.3 Per ogni polizza emessa su sua richiesta l'Agenzia paga ad AstAx un compenso fisso di **30 €** (valore in vigore oggi, uguale a quello dei broker), con fattura mensile e pagamento con bonifico entro il termine in vigore (oggi 30 giorni).

> **Nota per il legale:** quando un'agenzia chiede un preventivo per un proprio cliente e un'altra agenzia emette, la distribuzione coinvolge tre intermediari (agenzia richiedente, AstAx, agenzia emittente): vale la stessa questione della collaborazione a tre (documento 08).

## Art. 8 — Penali, sospensione ed esclusione

8.1 Si applicano le penali, la sospensione e l'esclusione previste dalle Condizioni d'uso per i professionisti, nella misura in vigore (oggi: ritardo di emissione 25 €; mancata emissione 100 €, con sospensione automatica dagli inviti dopo 3 casi in 6 mesi; aggiramento 1.000 € ed esclusione), con la procedura di contestazione ivi prevista (oggi entro 10 giorni, decisione finale dell'amministratore di AstAx).

8.2 Le penali applicate sono trattenute dalla rimessa (art. 5.2).

> **Nota per il legale:** trattamento fiscale delle penali trattenute e documento di addebito (`docs/punti-aperti.md`, «Commercialista e amministrazione»).

## Art. 9 — Collaboratori dell'Agenzia

9.1 L'Agenzia dichiara che i propri collaboratori che usano la Piattaforma sono iscritti nella sezione E del RUI come suoi collaboratori, o sono suoi dipendenti, e risponde del loro operato come del proprio (Allegato C). L'Agenzia stabilisce i loro permessi (offerta, emissione, visibilità delle offerte dei colleghi, contabilità) e regola con loro, internamente, la divisione delle provvigioni.

## Art. 10 — Riservatezza e dati personali

10.1 Le parti mantengono riservate le informazioni ricevute. I ruoli privacy e gli obblighi sui dati dei clienti sono regolati dall'Accordo sul trattamento dei dati (documento 10).

## Art. 11 — Responsabilità e RC professionale

11.1 Ciascuna parte mantiene per tutta la durata dell'accordo una polizza di RC professionale adeguata, ne trasmette copia e ne comunica il rinnovo. L'Agenzia carica sulla Piattaforma la polizza con la scadenza.

11.2 Ciascuna parte tiene indenne l'altra dai danni derivanti da proprie violazioni di legge o dell'accordo.

## Art. 12 — Durata e recesso

12.1 L'accordo ha durata [DURATA — proposta: a tempo indeterminato]. Ciascuna parte può recedere con preavviso scritto di [PREAVVISO] giorni via PEC. AstAx può risolvere l'accordo con effetto immediato in caso di esclusione dalla Piattaforma, perdita dell'iscrizione al RUI o dei mandati, violazione della busta chiusa o aggiramento accertato.

12.2 Alla cessazione restano fermi gli obblighi in corso: offerte vincolanti fino alla data di garanzia, emissioni dovute, rimesse e penali da regolare, riservatezza e non aggiramento.

## Art. 13 — Rapporti con società collegate

13.1 Le società collegate ad AstAx o ai suoi soci che usano la Piattaforma lo fanno alle stesse condizioni degli altri utenti; il legame è dichiarato nell'informativa al cliente.

## Art. 14 — Legge, foro, comunicazioni

14.1 Si applica la legge italiana. Foro esclusivo: [FORO COMPETENTE]. Le comunicazioni formali avvengono via PEC; quelle operative tramite la Piattaforma.

14.2 Le parti approvano specificamente, ai sensi degli artt. 1341 e 1342 c.c., gli artt. 3.2 (rischio tariffa), 5 (rimesse e trattenute), 8 (penali, sospensione ed esclusione), 12 (recesso e risoluzione), 14.1 (foro).

---

**Allegato A** — Compagnie mandanti e prodotti: {{elenco verificato sul RUI}}.
**Allegato B** — Compensi e penali in vigore alla firma: {{tabella dai parametri}}.
**Allegato C** — Dichiarazione di responsabilità per l'operato dei collaboratori sez. E.
