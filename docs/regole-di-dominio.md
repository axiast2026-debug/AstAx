# Regole di dominio

Ogni regola ha un codice. I test che la verificano riportano il codice nel nome, per esempio `it("FEE-02 premio sotto soglia: fee ridotto")`. Un comportamento non coperto da una regola segue le specifiche in `docs/specifiche/`; un dubbio va in `docs/domande-aperte.md`.

Tutti i numeri citati sono valori predefiniti: nel codice si leggono dai parametri (`seed/parametri.json`, poi modificabili dall'amministratore), mai scritti a mano.

## BC — Busta chiusa

- **BC-01** Prima della chiusura nessun utente, di nessun ruolo (amministratore e back office compresi), e nessuna risposta API, esportazione, notifica o log può mostrare il prezzo o il contenuto di un'offerta di un'altra agenzia. Ogni tentativo restituisce 403 e scrive nel registro l'evento `SEALED_BID_ACCESS_DENIED`.
- **BC-02** Il contenuto dell'offerta (premio, compagnia, prodotto, coperture, data di garanzia, note) e il PDF del preventivo vengono cifrati all'arrivo con la chiave pubblica dell'asta. Database e object storage non li contengono mai in chiaro prima della chiusura.
- **BC-03** Solo il worker, nell'attività di chiusura, può decifrare la chiave privata dell'asta tramite KMS. Ogni uso è registrato. Un uso prima dell'ora di chiusura è un incidente e genera un allarme.
- **BC-04** Durante l'asta l'agenzia vede la propria offerta tramite una copia cifrata con una chiave separata. La decifrano solo gli utenti di quell'agenzia autorizzati a vederla, e ogni decifratura è registrata.
- **BC-05** L'ora che conta è quella del server. Un invio, una modifica o un ritiro che arriva dopo la chiusura è rifiutato nella stessa transazione. Chiusura e invio non si sovrappongono (blocco sulla riga dell'asta).
- **BC-06** Ogni giro di riconferma usa una nuova coppia di chiavi, con le stesse regole.
- **BC-07** Nessun dato di un'offerta in chiaro nei log, nei payload di Temporal, negli strumenti di analisi o di tracciamento degli errori.

Dettagli tecnici: [`busta-chiusa.md`](busta-chiusa.md).

## VIS — Chi vede cosa

- **VIS-01** Le agenzie invitate vedono tutti i dati utili al preventivo e i documenti della richiesta. Telefono ed email del cliente non escono mai verso un'agenzia prima che vinca: né nelle schermate, né nelle risposte API, né nelle esportazioni, nelle notifiche o nei metadati dei documenti.
- **VIS-02** L'agenzia vincitrice riceve telefono ed email del cliente alla conferma del pagamento.
- **VIS-03** Durante l'asta il richiedente vede il conto alla rovescia e il numero di offerte; il broker vede anche il numero di agenzie invitate, senza nomi. Nessun prezzo.
- **VIS-04** Dopo la chiusura il richiedente vede le offerte secondo le regole PRES. Il nome dell'agenzia compare solo dopo l'accettazione.
- **VIS-05** Dopo la chiusura ogni agenzia vede solo le proprie offerte e il loro stato. La classifica segue le regole CLA.
- **VIS-06** Il sub-agente vede le richieste nei propri filtri, che stanno sempre dentro quelli dell'agenzia, e le proprie offerte. Le offerte dei colleghi solo se il titolare lo abilita.
- **VIS-07** Back office e amministratore vedono tutto, tranne le offerte prima della chiusura. Ogni loro accesso ai dati di un cliente è registrato.
- **VIS-08** Il titolare dell'agenzia vede il registro degli accessi dei propri utenti ai dati dei clienti.
- **VIS-09** Ogni apertura del dettaglio di una richiesta o di un documento da parte di un utente di agenzia è registrata, e la pagina lo dice.
- **VIS-10** Ogni documento del cliente scaricato o visualizzato da un utente di agenzia porta una filigrana con nome dell'agenzia, utente, data e ora.
- **VIS-11** Le note per il cliente hanno al massimo 300 caratteri. Il sistema rifiuta numeri di telefono, indirizzi email e link, anche scritti con spazi o parole al posto dei simboli.
- **VIS-12** La nazionalità non si raccoglie.
- **VIS-13** Il broker vede solo i propri clienti. Un operatore vede tutti i clienti del broker oppure solo i propri, secondo l'impostazione del titolare.

## OFF — Offerte

- **OFF-01** Al massimo un'offerta per agenzia per ogni giro d'asta, chiunque dei suoi utenti la inserisca.
- **OFF-02** Al massimo un'offerta per persona fisica per ogni giro d'asta, anche se la persona lavora per più agenzie invitate.
- **OFF-03** La presa in carico blocca la richiesta per gli altri utenti della stessa agenzia. Si libera con «rilascia», con l'intervento di titolare o supervisore, o alla chiusura. Una persona può avere in carico la stessa richiesta per una sola agenzia.
- **OFF-04** Un'offerta richiede: premio lordo annuo (imposte e contributo SSN inclusi), compagnia tra i mandati verificati dell'agenzia, prodotto, dichiarazione delle coperture per ogni voce del pacchetto, data di garanzia, preventivo PDF e conferma esplicita che l'offerta è vincolante.
- **OFF-05** La data di garanzia deve essere uguale o successiva alla garanzia minima della richiesta (GAR-01). La validità massima dichiarata dall'agenzia nei filtri serve solo a decidere gli inviti (ASTA-05).
- **OFF-06** Le coperture dichiarate devono essere uguali o migliori di quelle del pacchetto. Un'offerta dichiarata non conforme viene esclusa alla chiusura, con il motivo.
- **OFF-07** Modifica e ritiro sono possibili fino alla chiusura. Dopo la chiusura l'offerta è vincolante fino alla data di garanzia e non si ritira.
- **OFF-08** La rinuncia («non interessato») ha un motivo facoltativo, scelto dall'elenco.
- **OFF-09** Alla chiusura l'AI confronta il PDF con l'offerta dichiarata. Le differenze diventano una segnalazione al back office, che può escludere l'offerta, con motivo, finché il cliente non l'ha accettata. L'offerta vincolante è quella dichiarata. Se esclude l'ultima offerta valida, la richiesta diventa subito «Deserta», con avviso al cliente e al back office (domanda 16).
- **OFF-10** Offrono solo intermediari iscritti in sez. A o B. I collaboratori sez. E operano sempre a nome dell'agenzia selezionata.

## ASTA — Apertura, inviti e tempi

- **ASTA-01** L'asta si apre solo dopo l'approvazione del back office. La durata decorre dall'apertura e si conta in ore lavorative.
- **ASTA-02** Calendario lavorativo: lunedì-venerdì 9-19, sabato 9-13, ora di Roma, esclusi festivi nazionali. Il tempo fuori orario non conta: un'asta approvata alle 18:30 di lunedì con durata 2 ore chiude martedì alle 10:30.
- **ASTA-03** Durate selezionabili: 1, 2, 5 o 24 ore lavorative; predefinita 2.
- **ASTA-04** Al massimo 8 agenzie invitate. A metà asta, se ci sono meno di 3 offerte, il sistema invita fino a 4 agenzie in più.
- **ASTA-05** Selezione: filtri dell'agenzia compatibili e, se l'agenzia distribuisce le richieste secondo i filtri personali, almeno un utente con filtri compatibili; agenzia attiva, non in pausa e non sospesa; capacità giornaliera non esaurita; orari di ricezione che coprono almeno un'ora lavorativa dell'asta; validità massima garantibile non inferiore alla validità minima richiesta. Tra le compatibili: prima quelle che aggiungono compagnie non ancora coperte, poi quelle invitate meno di recente.
- **ASTA-06** Il back office può aggiungere inviti solo nella prima metà dell'asta. Può escludere un'agenzia dall'anteprima, prolungare la chiusura o annullare l'asta, sempre con motivo e con registrazione.
- **ASTA-07** Agli invitati che non hanno ancora offerto arriva un promemoria a 60 minuti dalla chiusura; se l'asta dura 2 ore o meno, a metà asta.
- **ASTA-08** Asta deserta (nessuna offerta valida): una riapertura automatica di 2 ore lavorative che invita tutte le agenzie compatibili non ancora invitate, senza limite di numero e senza rotazione. Se non ce ne sono, o se resta deserta, la richiesta passa a «Deserta» e ricevono l'avviso richiedente e back office.
- **ASTA-09** All'apertura l'asta salva una copia dei parametri in vigore. Una modifica dei parametri vale solo per le aste aperte dopo.
- **ASTA-10** I casi esclusi dichiarati nella procedura guidata (tipo di veicolo, uso, targa) bloccano l'invio con un messaggio chiaro. Gli altri casi esclusi li segnala il controllo automatico e li decide il back office.

## GAR — Prezzo garantito e riconferma

- **GAR-01** Garanzia minima = data di chiusura prevista all'apertura (ora di Roma) + validità minima richiesta (7, 15 o 30 giorni di calendario; predefinita 15). Un prolungamento della chiusura non la cambia.
- **GAR-02** Un'offerta è garantita fino alle 23:59:59, ora di Roma, della sua data di garanzia, a condizione che decorrenza e dati del preventivo non cambino.
- **GAR-03** Durante la garanzia il rischio di un cambio di tariffa della compagnia è dell'agenzia: emette comunque al prezzo offerto.
- **GAR-04** L'accettazione è possibile solo se l'offerta è ancora garantita e se manca abbastanza tempo per emettere prima della decorrenza: ultimo momento utile = decorrenza meno il termine di emissione (EMI-01). Con la decorrenza «immediata» o «dalle 24:00» (domanda 1, `docs/piano-decorrenza.md`) basta che l'offerta sia garantita.
- **GAR-05** Promemoria al richiedente 2 giorni prima che scada la garanzia dell'offerta più conveniente ancora garantita. Se dopo la scadenza un'altra offerta diventa la più conveniente, il promemoria vale per quella.
- **GAR-06** Quando tutte le garanzie sono scadute, la richiesta passa a «Scaduta». Il richiedente può chiedere la riconferma, al massimo 2 volte per richiesta. Una richiesta «Scaduta» senza azioni per 30 giorni si annulla da sola.
- **GAR-07** Riconferma: sono invitate le agenzie che avevano un'offerta valida nell'ultimo giro; stessi dati; busta chiusa (BC-06); 24 ore lavorative per rispondere. Ogni agenzia conferma il prezzo, lo aggiorna (anche al rialzo) o rinuncia, con una nuova data di garanzia (GAR-01 calcolata sulla chiusura del giro). Nessuna risposta valida: la richiesta passa a «Deserta».
- **GAR-08** In bacheca l'agenzia vede la sezione «offerte aperte»: tutte le sue offerte ancora vincolanti, con la scadenza.

## PRES — Presentazione e scelta

- **PRES-01** Ordine tra offerte: premio più basso; a parità, garanzia più lunga; a parità, invio più vecchio secondo l'ora del server. Per un'offerta modificata conta l'ora dell'ultima modifica.
- **PRES-02** Il richiedente vede le offerte dell'ultimo giro chiuso (asta, riapertura o riconferma): per ogni compagnia, la migliore tra quelle ancora garantite. Se per una compagnia nessuna offerta è garantita, compare la migliore scaduta, in grigio e non accettabile.
- **PRES-03** Le righe sono ordinate per premio. La più conveniente ha l'etichetta «Più conveniente». Se il richiedente ha indicato il premio attuale, compare il risparmio.
- **PRES-04** Ogni riga mostra compagnia, prodotto, pacchetto, coperture e franchigie, premio, «garantito fino al», giorni rimasti e preventivo PDF. Il nome dell'agenzia no.
- **PRES-05** La scelta è libera tra le offerte garantite.
- **PRES-06** «Confronta con AI» c'è solo per i privati. Prima di usarlo il cliente vede che il fee aumenta (FEE-01, FEE-02) e conferma.
- **PRES-07** Il suggerimento AI considera solo le offerte mostrate e garantite. Il punteggio si calcola con criteri fissi e pesi configurabili: prezzo, coperture oltre il pacchetto (franchigie, scoperti, rivalsa), indice reclami della compagnia, tempi di emissione dell'agenzia sulla piattaforma. Il modello AI scrive solo la spiegazione, partendo da quei dati.
- **PRES-08** Ogni suggerimento è salvato con pesi, dati usati, punteggi, modello, versione del prompt e testo mostrato. Il cliente vede l'etichetta «Suggerimento generato con AI».

## FEE — Fee e importi

- **FEE-01** Privato: 30 € a polizza; 35 € se ha usato il confronto AI su quella richiesta, in qualunque momento prima dell'acquisto.
- **FEE-02** Privato, premio lordo dell'offerta acquistata fino a 200 € compresi (domanda 3, Dan 2026-10-18): 15 €, oppure 20 € con il confronto AI.
- **FEE-03** Broker: 30 € a polizza emessa, a carico del broker, senza riduzione per i premi bassi. Il cliente del broker non paga fee.
- **FEE-04** Agenzia: 15 € a polizza emessa, trattenuti dalla rimessa.
- **FEE-05** Tutti i fee sono compensi di intermediazione esenti IVA. Il riferimento normativo e la natura IVA sulle fatture vengono dai parametri.
- **FEE-06** Senza acquisto non si paga nessun fee.
- **FEE-07** Gli importi sono interi in centesimi (`...Cents`). Massimali e capitali assicurati sono interi in euro (`...Eur`). Mai numeri decimali per il denaro.

## PAG — Pagamenti e rimborsi

- **PAG-01** Il cliente paga premio e, se privato, fee ad AstAx tramite il fornitore dei pagamenti, con carta o bonifico istantaneo. Il premio va sul conto separato.
- **PAG-02** Pagamento confermato: richiesta «In emissione», offerta «Vincente», le altre offerte «Non scelta», contatti all'agenzia vincitrice, parte il termine di emissione.
- **PAG-03** Pagamento fallito o abbandonato: l'accettazione decade e la richiesta torna a «Offerte disponibili», finché ci sono garanzie valide.
- **PAG-04** Rimborso prima dell'emissione: totale, fee compreso. Dopo l'emissione (recesso): il premio indicato dall'agenzia secondo le condizioni della compagnia; il fee del cliente e quello dell'agenzia restano dovuti. Il premio rimborsato si recupera dall'agenzia come voce negativa della rimessa successiva. Regola da validare con il legale. Domanda 18: dopo l'emissione il cliente recede o annulla fuori dal portale (parametro `withdrawal.onPlatform` spento): né il cliente né il back office registrano un recesso in AstAx.
- **PAG-05** Ogni rimborso richiede l'approvazione del supervisore del back office ed è registrato.
- **PAG-06** Ogni giorno ogni incasso è abbinato a una richiesta; le differenze vanno in coda al back office.

## EMI — Emissione e penali

- **EMI-01** Termine di emissione: 4 ore lavorative dalla conferma del pagamento, contate sull'orario delle emissioni (`issuance.workingHours`: lunedì-venerdì 9-19, festività escluse), e per una data scelta comunque prima della decorrenza. Decorrenza «immediata»: dal momento dell'emissione, mai prima. Decorrenza «dalle 24:00»: dalle 24:00 del giorno in cui cade il termine di emissione (domanda 1).
- **EMI-02** L'agenzia carica polizza, quietanza e certificato e segna la polizza come emessa. Il cliente riceve la notifica e trova i documenti nella sua area.
- **EMI-03** Termine superato: avviso ad agenzia e back office e proposta di penale per ritardo (25 €).
- **EMI-04** Mancata emissione (nessuna emissione prima della decorrenza, o entro il termine per la decorrenza «immediata», oppure impossibilità segnalata). Se è colpa dell'agenzia: proposta di penale di 100 €, che sostituisce quella per ritardo, e passaggio alla seconda offerta, cioè la migliore offerta ancora garantita di un'altra agenzia. Il cliente conferma entro 24 ore (paga la differenza o riceve il rimborso della differenza) oppure viene rimborsato del tutto. Se la colpa è di dati errati del cliente: nuovo calcolo con l'agenzia; il cliente accetta il nuovo prezzo o viene rimborsato.
- **EMI-05** Penali: proposta (sistema o back office) → applicata dal supervisore del back office → contestabile dall'agenzia entro 10 giorni → decisione finale dell'amministratore. Le penali applicate si trattengono dalla prima rimessa utile; se la rimessa non basta, il residuo passa alla successiva. Una rimessa non è mai negativa.
- **EMI-06** Tre mancate emissioni per colpa dell'agenzia in 6 mesi: sospensione automatica dagli inviti e avviso all'amministratore, che conferma o revoca. Gli obblighi in corso restano.
- **EMI-07** Aggiramento accertato: penale di 1.000 € ed esclusione dalla piattaforma, decise dall'amministratore su proposta del back office.

## CONT — Rimesse e fatture

- **CONT-01** Rimessa settimanale, ogni lunedì, per le polizze emesse fino alle 23:59 del venerdì precedente: premio lordo − fee agenzia − penali applicate − premi da recuperare per rimborsi (PAG-04) − quota del broker, se attiva.
- **CONT-02** Il sistema genera il file dei bonifici SEPA; il back office lo carica in banca e segna la rimessa come eseguita; l'agenzia riceve l'avviso.
- **CONT-03** Fatture via SDI: al privato una per polizza, all'emissione; all'agenzia una per rimessa; al broker una al mese per le polizze emesse nel mese. Note di credito per i rimborsi del fee.
- **CONT-04** Imposta di bollo sulle fatture esenti sopra la soglia di legge, con importo e soglia dai parametri. Da confermare con il commercialista.
- **CONT-05** L'estratto conto del broker mostra polizze, premi, quota di provvigione (se attiva) e fee dovuti ad AstAx.

## CLA — Classifica

- **CLA-01** La classifica comprende tutte le offerte valide dell'ultimo giro, ordinate con PRES-01.
- **CLA-02** Si pubblica alle agenzie partecipanti quando il cliente accetta (firma completata). Se la richiesta viene annullata senza accettazione, si pubblica in quel momento la classifica dell'ultimo giro con offerte valide. Mai prima: una classifica visibile durante una possibile riconferma falserebbe la busta chiusa.
- **CLA-03** Ogni agenzia vede il premio della prima e della seconda offerta, senza agenzia né compagnia; la posizione della propria («5ª su 8», dove 8 è il numero di offerte valide); lo scarto in percentuale dalla prima. Un'offerta esclusa vede «esclusa» con il motivo.
- **CLA-04** Prima della pubblicazione l'agenzia vede solo lo stato della propria offerta: valida, esclusa o in attesa del cliente.

## SIC — Sicurezza e registro

- **SIC-01** Ogni endpoint verifica i permessi nel backend, con negazione predefinita. L'interfaccia nasconde, ma non protegge.
- **SIC-02** Ogni lettura e scrittura è limitata all'organizzazione e al contesto attivo. La sicurezza a livello di riga di PostgreSQL è la seconda linea di difesa.
- **SIC-03** Codice fiscale, partita IVA, telefono, email e IBAN sono cifrati per campo. La ricerca esatta usa un indice cieco (HMAC).
- **SIC-04** Il registro attività è solo in aggiunta: il database rifiuta modifiche e cancellazioni, ogni voce contiene l'hash della precedente, le copie finiscono in un archivio non modificabile.
- **SIC-05** Utenze professionali: password e secondo fattore obbligatorio. Privati: accesso con codice OTP. Durata della sessione per ruolo dai parametri.
- **SIC-06** Log, errori, analisi e payload di Temporal contengono solo identificativi: mai dati personali, prezzi o documenti.
- **SIC-07** I segreti stanno solo nel gestore dei segreti, mai nel repository.
- **SIC-08** Sviluppo e collaudo usano solo dati sintetici.

## LEG — Documenti legali e consensi

- **LEG-01** I testi legali stanno in un archivio con versioni. Ogni accettazione registra versione, data, ora e indirizzo IP.
- **LEG-02** Una nuova versione obbliga gli utenti interessati ad accettarla al prossimo accesso.
- **LEG-03** Un testo non validato mostra «[DA VALIDARE — LEGALE]». Il rilascio in produzione è bloccato se un testo in uso non è validato.
- **LEG-04** Prima dell'invio di una richiesta serve il consenso alla condivisione dei dati con le agenzie invitate. Se il cliente lo revoca, non si aprono nuove aste per lui.
- **LEG-05** All'accettazione il privato firma con FEA la lettera di incarico e prende visione dell'informativa precontrattuale (MUP), che indica AstAx proponente, agenzia emittente, compagnia, compensi e modalità di pagamento. Il set di documenti dipende dal canale ed è configurabile.
- **LEG-06** Le richieste non concluse si cancellano dopo 12 mesi; contratti e documenti contabili si conservano per i termini di legge (predefinito 10 anni, da validare).
