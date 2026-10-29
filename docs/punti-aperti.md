# Punti aperti fuori dal codice

Questi punti li decidono legale, DPO, commercialista o amministrazione. Il codice è già pronto a gestirli: per ciascuno c'è un valore provvisorio, un parametro o un testo segnaposto. Nessuno blocca lo sviluppo; tutti vanno chiusi prima del lancio.

## Legale

| Punto | Cosa va deciso | Nel codice intanto |
| --- | --- | --- |
| RC professionale delle agenzie e dei broker (Dan, 2026-10-29) | La polizza di RC professionale non si chiede più nella richiesta di ingresso: basta la verifica sul RUI (l'iscrizione la presuppone, art. 112 CAP)? | Nessuna polizza chiesta né controllata ([ADR 0024](adr/0024-aste-aperte-a-tutte-le-agenzie.md)); le richieste fatte prima la conservano |
| Iscrizione RUI di AstAx | Broker sez. B: sede in Italia, responsabile della distribuzione e rappresentante legale in sez. B, RC professionale (art. 112 CAP) | Nessun effetto sul codice; blocca il lancio |
| Effetto liberatorio del pagamento | Come si applica l'art. 118 CAP al pagamento ad AstAx nella collaborazione con l'agenzia emittente | Il cliente paga AstAx; testi della MUP segnaposto |
| Collaborazione a tre intermediari | Broker richiedente, AstAx e agenzia: ammessa o no, con quale schema | Canale broker attivo; quota di provvigione del broker spenta |
| Confronto AI e consulenza IDD | Se il suggerimento è consulenza, con quali obblighi | Ogni suggerimento è salvato con dati e criteri (PRES-08) |
| Vendita a distanza | Recesso, informative, tempi | Regole di rimborso nei parametri `refunds.*` |
| Regole di rimborso del fee | Recesso e annullamento | Prima dell'emissione tutto; dopo, fee trattenuto |
| Penali e non aggiramento | Importi, clausole, procedura di contestazione | Parametri `penalties.*`; contestazione entro 10 giorni |
| Testi legali | Tutti i documenti della scheda 09, §7 | Segnaposto «[DA VALIDARE — LEGALE]»; il rilascio in produzione si blocca (LEG-03) |
| Firma FEA | Obblighi di AstAx come soggetto che eroga la FEA (DPCM 22/02/2013) | Adattatore Namirial in fase 8 |
| Consensi con una spunta sola (Dan, 2026-10-21) | Se i consensi facoltativi (per esempio marketing) possono stare nella stessa spunta di quelli obbligatori, o vanno separati (GDPR, consenso specifico) | Una spunta sola nel nuovo flusso del privato (`docs/piano-flusso-semplificato.md`); si separa con un parametro se il legale lo chiede |
| Dichiarazione unica del broker (Dan, 2026-10-21) | Se basta una dichiarazione firmata una volta dal broker («ho il permesso dei miei clienti») al posto del consenso di ogni cliente per condividere i dati con le agenzie (LEG-04) | Fatto nel codice il 2026-10-21 (`docs/piano-broker.md`, passo 1): la firma il titolare dello studio al primo accesso e vale per tutto lo studio; ogni richiesta registra il consenso «coperto dalla dichiarazione» con il riferimento alla firma. Il testo è un segnaposto «[DA VALIDARE — LEGALE]»: la produzione non parte finché il legale non lo valida |
| Numeri e risparmio nella home pubblica (Dan, 2026-10-22) | Se «risparmio medio rispetto al premio attuale dichiarato dai clienti» e le offerte medie per asta sono affermazioni ammesse (Codice del Consumo, pratiche commerciali; IDD), con quale testo e quale base di calcolo | Calcolo e testo in ADR 0016; interruttore `home.publicData.enabled` spento nel seed: in produzione si accende solo dopo il parere |
| Testi delle pagine pubbliche (Dan, 2026-10-22) | Se le frasi di «Come funziona», «Per le agenzie» e «Domande frequenti» vanno bene come informazione al pubblico (Codice del Consumo, IDD, informativa precontrattuale): per esempio «nemmeno AstAx vede i prezzi», «non paghi nulla», «compenso di intermediazione esente IVA», «solo l'agenzia che scegli riceve il telefono» | Pubblicate subito, con i numeri dai parametri; testi in `apps/web/messages/it.json` (`publicPages`), da correggere senza toccare il codice |
| Rapporti con GD Brokers | Uso della piattaforma a condizioni di mercato, legame dichiarato | Nessun trattamento speciale nel codice |
| Codice automatico al cliente del broker (Dan, 2026-10-23, domanda 29) | Se il codice di accesso può partire da solo quando il cliente apre il link ricevuto, senza un suo tocco: è la continuazione di una richiesta del cliente o un messaggio non richiesto? | Da fare con il limite di invii già in vigore |

## DPO e privacy

| Punto | Cosa va deciso | Nel codice intanto |
| --- | --- | --- |
| Ruoli privacy | Titolare e responsabile per agenzie e broker, nelle diverse fasi | Registro accessi, filigrane, consensi per versione |
| Preventivo di un privato per un'altra persona | Dan ha deciso (domanda 12) che un privato può chiedere un preventivo con un'altra persona come contraente (per esempio il coniuge). Va deciso se basta il consenso di chi usa l'account o serve anche quello del contraente, e come si informa il contraente | Il consenso è quello del privato che usa l'account, confermato con il codice; il testo del consenso è un segnaposto |
| Dati in Albania | Garanzie per il trasferimento fuori UE se il back office opera dall'Albania | Interfaccia solo in italiano (ADR 0017); accessi registrati |
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
| Banca Dati ANIA dal portale agenzie Allianz (Dan, 2026-10-28, domanda 40) | AstAx (broker sez. B) può consultare in modo automatico la Banca Dati ANIA attraverso il portale agenzie Allianz per i propri clienti? Serve il via scritto di Allianz, e va chiarito chi è titolare delle credenziali e del trattamento | Via scritto di Allianz ricevuto (Dan, 2026-10-28): conservarne copia fuori dal repository. Restano da chiarire titolare delle credenziali e del trattamento, e l'informativa ai clienti per i dati letti da ANIA, ora usati anche nella demo ([ADR 0022](adr/0022-ania-vero-nella-demo.md)) |
