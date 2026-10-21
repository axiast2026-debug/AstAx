# Piano: area del broker e degli intermediari di sezione E

**Stato:** approvato da Dan il 2026-10-21 (risposte in fondo). Passi 1, 2 e 3 fatti il 2026-10-21; gli altri da fare, nell'ordine.

## Cosa ha chiesto Dan (2026-10-21)

1. Possono registrarsi come richiedenti non solo i **broker** (sezione B) ma anche gli **intermediari di sezione E**.
2. Per **un singolo veicolo** il broker ha le **stesse opzioni del privato**: le 5 schermate (foto e pochi dati, tipo di guida, «Consigliato» o «Su misura», le tre decorrenze), con i dati completati dal back office.
3. **Richiesta multipla**: il broker carica un file **Excel con un formato fisso** (le targhe e i dati principali di ogni cliente), per esempio tutti i rinnovi del mese.
   - Il back office controlla le righe **una per una** e le separa in richieste diverse.
   - L'asta di ognuna si apre **7 giorni prima della scadenza** della polizza.
   - Da studiare: **7 giorni prima dell'apertura** si chiede al broker di caricare libretto e documenti.
4. **Flotte aziendali**: «in arrivo» per ora.
5. Un'area di lavoro **pensata per il computer** e il più semplice possibile.

## Proposte

| # | Proposta |
| --- | --- |
| **A** | **Intermediari di sezione E:** nella domanda di ingresso si sceglie «Broker (sez. B)» oppure «Intermediario (sez. E)». Per la sezione E si indica anche l'intermediario per cui si lavora (numero RUI); il back office lo verifica sul RUI come oggi. Una volta dentro, hanno la stessa area e le stesse regole del broker (fee 30 €, cliente con il link). |
| **B** | **Singolo veicolo come il privato:** il broker usa le 5 schermate. In più ci sono il **cliente** (scelto dall'elenco o nuovo) e il **consenso del cliente**, che arriva via link come oggi (LEG-04). |
| **C** | **File Excel standard** (`.xlsx`): AstAx pubblica il modello da scaricare, con una riga per veicolo e queste colonne: targa, scadenza della polizza attuale, cliente (cognome e nome o ragione sociale), codice fiscale o partita IVA, data di nascita, email, cellulare, indirizzo, CAP, comune, tipo di guida, garanzie («Consigliato» o «Su misura» con l'elenco), decorrenza. Prima di salvare il file viene controllato tutto: se una riga è sbagliata, la pagina dice quale e perché. |
| **D** | **Richiesta multipla = un «lotto».** Il lotto è un contenitore: **ogni riga diventa da subito una richiesta a sé**, «programmata». Il back office vede il lotto, controlla le righe una per una e può togliere quelle sbagliate. L'asta di ogni richiesta parte da sola **7 giorni prima della scadenza** della sua polizza (parametro modificabile). |
| **E** | **Documenti a tempo:** **7 giorni prima dell'apertura** (parametro) il broker riceve l'avviso «carica libretto e documenti» per quelle richieste. Il bot li legge, il back office completa i dati come per il privato e l'asta parte all'ora prevista. |
| **F** | **Flotte aziendali:** voce di menu con «In arrivo». |
| **G** | **Area di lavoro per il computer:** una **tabella unica** di tutte le richieste del broker, con filtri (stato, scadenza, cliente, lotto) e una colonna «da fare» (cosa serve adesso e il pulsante per farlo). Menu corto: Richieste, Lotti, Clienti, Polizze, Contabilità, Team. |

## Domande per Dan

1. **Sezione E:**
   - A) si registra da solo, indicando l'intermediario (A o B) per cui lavora (consiglio questa);
   - B) entra solo su invito dentro l'organizzazione di un broker già su AstAx.
2. **Sezione E che lavora per un'agenzia (sez. A):** può chiedere preventivi in asta anche se la sua agenzia partecipa alle aste?
   - A) sì, ma la sua agenzia non viene invitata a quelle aste (consiglio questa, per evitare il conflitto);
   - B) sì, senza limiti;
   - C) no, solo gli E che lavorano per un broker.
3. **Consenso dei clienti del lotto:**
   - A) al caricamento del file parte da sola a ogni cliente l'email o l'SMS con il link del consenso;
   - B) il broker carica i consensi già firmati;
   - C) tutte e due le strade.
4. **Se il broker non carica i documenti in tempo:**
   - A) l'asta slitta fino al caricamento e il broker riceve un promemoria ogni giorno;
   - B) la richiesta si annulla da sola alla data prevista dell'apertura.
5. **Il modello Excel:** vanno bene le colonne della proposta C? Ne aggiungi o ne togli qualcuna?
6. **Giorni:** 7 prima della scadenza per l'apertura dell'asta e 7 prima dell'apertura per i documenti (cioè 14 prima della scadenza). Vanno bene come valori iniziali? Si cambiano dal pannello.

## Cosa cambia dietro le quinte

- **Domanda di ingresso:** il tipo «intermediario sez. E» con il riferimento al suo intermediario e la verifica sul RUI.
- **Richieste «programmate»:** una data di apertura dell'asta. Il worker la apre all'ora giusta solo se dati e documenti sono completi.
- **I lotti:** un contenitore con le sue righe e il loro stato (in controllo, programmata, documenti mancanti, in asta, chiusa).
- **Il file Excel:** serve una libreria per leggere i `.xlsx` (una dipendenza nuova, da spiegare nell'ADR). Oggi c'è solo il CSV.
- Le prove automatiche del broker vanno riscritte, come quelle del privato.

## Ordine di lavoro proposto

1. Singolo veicolo del broker con le 5 schermate (proposta B).
2. Area di lavoro per il computer (proposta G).
3. Sezione E nella domanda di ingresso (proposta A).
4. Lotti con file Excel, aste programmate e documenti a tempo (proposte C, D, E).
5. Flotte «in arrivo» (proposta F).

## Risposte di Dan (2026-10-21)

| # | Risposta |
| --- | --- |
| 1 | **A**: l'intermediario di sezione E si registra da solo, indicando l'intermediario (A o B) per cui lavora |
| 2 | **A**: un E che lavora per un'agenzia può chiedere preventivi, ma la sua agenzia non viene invitata a quelle aste |
| 3 | Il broker firma **all'inizio una dichiarazione unica**: ha il permesso dei suoi clienti per tutti i preventivi che carica, e non serve un consenso per ogni richiesta. Da far confermare al legale (LEG-04, `docs/punti-aperti.md`) |
| 4 | L'asta **può partire anche senza documenti**: in quel caso sono invitate solo le agenzie che nei loro filtri accettano richieste senza documenti (filtro nuovo) |
| 5 | Le colonne del modello Excel vanno bene |
| 6 | Asta **7 giorni prima della scadenza**; documenti chiesti **3 giorni prima dell'asta** (10 prima della scadenza). Il broker può **far partire l'asta in qualsiasi momento** |

## Avanzamento

| Passo | Stato |
| --- | --- |
| 1. Singolo veicolo con le 5 schermate | **Fatto (2026-10-21).** Il broker sceglie o crea il cliente, poi ha le stesse 5 schermate del privato, con «Consigliato» o «Su misura» e le tre decorrenze. Nell'ultima schermata non c'è la spunta del consenso: lo copre la dichiarazione dello studio. Il back office completa i dati come per il privato; il contraente è sempre il cliente del broker (nome e codice fiscale dalla sua scheda, LEG-04). Le vecchie schermate del broker (veicolo, conducenti, asta, consenso, riepilogo) sono state tolte |
| 2. Area di lavoro per il computer | **Fatto (2026-10-21).** «Richieste» è la tabella unica di lavoro: filtri per stato (con «Da fare»), cliente, targa e decorrenza entro 7, 15, 30 o 60 giorni; colonna «Da fare» con il pulsante (Completa e invia, Integra i dati, Manda al cliente, Chiedi la riconferma) o chi si sta aspettando; in alto quante richieste aspettano il broker. Menu corto: Richieste, Clienti, Polizze, Contabilità, Team; Dashboard, Rinnovi e Impostazioni in fondo a ogni pagina. Pagina più larga sul computer. Il filtro per lotto arriva con il passo 4 |
| 3. Sezione E nella domanda di ingresso | **Fatto (2026-10-21).** In «Lavora con AstAx» c'è la terza scelta «Sono un intermediario di sezione E»: numero RUI di sezione E e numero RUI (A o B) dell'intermediario per cui lavora. All'invio il controllo sul RUI dice anche se il registro collega l'E a quell'intermediario; il back office lo vede e approva. Una volta dentro ha l'area e le regole del broker. Se lavora per un'agenzia, quell'agenzia non viene mai invitata alle aste delle sue richieste (né all'apertura, né nelle riaperture e integrazioni di inviti, né nell'anteprima del back office) |
| 4. Lotti con file Excel | Da fare |
| 5. Flotte «in arrivo» | Da fare |

Da sapere sul passo 1:

- La dichiarazione è un testo legale nuovo (`broker-clients-declaration`): il titolare dello studio la accetta al primo accesso dopo l'aggiornamento (`pnpm db:seed`). Vale per i suoi collaboratori.
- Il broker non sceglie più la durata dell'asta e la validità minima: valgono i valori predefiniti dei parametri, come per il privato.
