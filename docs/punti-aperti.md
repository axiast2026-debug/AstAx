# Punti aperti fuori dal codice

Questi punti li decidono legale, DPO, commercialista o amministrazione. Il codice è già pronto a gestirli: per ciascuno c'è un valore provvisorio, un parametro o un testo segnaposto. Nessuno blocca lo sviluppo; tutti vanno chiusi prima del lancio.

## Legale

| Punto | Cosa va deciso | Nel codice intanto |
| --- | --- | --- |
| Iscrizione RUI di AstAx | Broker sez. B: sede in Italia, responsabile della distribuzione e rappresentante legale in sez. B, RC professionale (art. 112 CAP) | Nessun effetto sul codice; blocca il lancio |
| Effetto liberatorio del pagamento | Come si applica l'art. 118 CAP al pagamento ad AstAx nella collaborazione con l'agenzia emittente | Il cliente paga AstAx; testi della MUP segnaposto |
| Collaborazione a tre intermediari | Broker richiedente, AstAx e agenzia: ammessa o no, con quale schema | Canale broker attivo; quota di provvigione del broker spenta |
| Confronto AI e consulenza IDD | Se il suggerimento è consulenza, con quali obblighi | Ogni suggerimento è salvato con dati e criteri (PRES-08) |
| Vendita a distanza | Recesso, informative, tempi | Regole di rimborso nei parametri `refunds.*` |
| Regole di rimborso del fee | Recesso e annullamento | Prima dell'emissione tutto; dopo, fee trattenuto |
| Penali e non aggiramento | Importi, clausole, procedura di contestazione | Parametri `penalties.*`; contestazione entro 10 giorni |
| Testi legali | Tutti i documenti della scheda 09, §7 | Segnaposto «[DA VALIDARE — LEGALE]»; il rilascio in produzione si blocca (LEG-03) |
| Firma FEA | Obblighi di AstAx come soggetto che eroga la FEA (DPCM 22/02/2013) | Adattatore Namirial in fase 8 |
| Rapporti con GD Brokers | Uso della piattaforma a condizioni di mercato, legame dichiarato | Nessun trattamento speciale nel codice |

## DPO e privacy

| Punto | Cosa va deciso | Nel codice intanto |
| --- | --- | --- |
| Ruoli privacy | Titolare e responsabile per agenzie e broker, nelle diverse fasi | Registro accessi, filigrane, consensi per versione |
| Dati in Albania | Garanzie per il trasferimento fuori UE se il back office opera dall'Albania | Interfaccia in albanese; accessi registrati |
| Conservazione | Tempi per tipo di dato | 12 mesi per le richieste non concluse, 10 anni per contratti e contabilità |
| Valutazione d'impatto | Da fare prima del lancio | Mappa dei dati e registro dei fornitori in fase 8 |

## Commercialista e amministrazione

| Punto | Cosa va deciso | Nel codice intanto |
| --- | --- | --- |
| Esenzione IVA dei fee | Conferma per tutti i fee, compreso quello da 35 € con il confronto AI | Natura `N4`, dicitura art. 10, c. 1, n. 9, DPR 633/1972 (parametri) |
| Imposta di bollo | Fatture esenti sopra 77,47 €: 2 €, a carico di chi | Parametri `invoicing.stampDuty.*` |
| Frequenza delle fatture | Per polizza, per rimessa, mensile | Privato per polizza, agenzia per rimessa, broker mensile |
| Incasso di premio e fee | Un pagamento diviso tra conto separato e conto operativo | Divisione tramite il fornitore (decisione 21) |
| Conto separato o fideiussione | Art. 117 CAP | Nessun effetto sul codice |
| Penali | Trattamento fiscale delle penali trattenute | Trattenuta in rimessa, con documento di addebito da definire |
| Fornitore dei pagamenti | Chi accetta l'incasso di premi assicurativi | Fabrick proposto, Nexi alternativa |
