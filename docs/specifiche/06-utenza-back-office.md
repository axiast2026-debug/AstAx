# Back office

L'area del back office è una sala di controllo: code di lavoro con le scadenze, schede complete e ogni azione registrata. Ogni operatore vede le sezioni del proprio ruolo.

## Menu

1. Dashboard operativa
2. Coda verifiche
3. Aste
4. Eccezioni
5. Pagamenti
6. Agenzie e broker
7. Clienti
8. Assistenza
9. Reclami
10. Segnalazioni
11. Fatturazione

## Dashboard operativa

- Code con contatore e attesa massima: verifiche, integrazioni in attesa del cliente, aste in chiusura, aste deserte, emissioni in ritardo, pagamenti da riconciliare, rimesse da eseguire, ticket aperti, reclami in scadenza.
- Indicatori: tempo medio di verifica, quota di verifiche automatiche, aste deserte del giorno.

## Coda verifiche

Elenco: codice della richiesta con targa e tipologia, richiedente (privato o broker), tempo in coda, esito del controllo automatico (verde, giallo, rosso), quante delle 5 verifiche sono fatte, «In carico a» con l'ora. Filtri «Tutte», «Da prendere», «Le mie»; «Prendo io in carico» dalla riga. L'elenco si aggiorna da solo (Dan, 2026-10-28).

### Presa in carico (Dan, 2026-10-28)

- Una pratica la prende un operatore con «Prendo io in carico» (o con la sua prima azione, se nessuno l'ha presa). In cima alla pratica tutti vedono «In carico a … dalle …».
- Solo chi l'ha presa fa le verifiche, corregge, legge ANIA, approva, chiede un'integrazione o esclude; gli altri vedono e ricevono «in carico a un collega».
- Il supervisore può prenderla al posto del collega; chi l'ha presa, o il supervisore, può rilasciarla. Tutto finisce nel registro attività.

### Scheda di verifica

- In alto i documenti grandi (libretto e carta d'identità, ogni file, PDF e foto, con zoom e tutto schermo); accanto le 5 verifiche.
- Le 5 verifiche, ognuna con chi e quando: libretto leggibile e corrispondente; documento d'identità leggibile e corrispondente; targa corretta (o corretta dal libretto); data di nascita del titolare del veicolo corretta (o corretta dai documenti); tipologia del preventivo (Rinnovo, Veicolo nuovo, Classe da un familiare, Classe da un mio veicolo venduto o rottamato) con «il preventivo è fattibile». Una correzione di targa o data diventa una nuova versione dei dati. «Approva e apri l'asta» si accende solo con le 5 verifiche fatte.
- Scheda per le agenzie: «Leggi da ANIA» con la sola targa (in sviluppo e nella demo un ANIA finto, regola 11); i dati letti (veicolo, intestatario, nascita dal codice fiscale, classe CU, compagnia, scadenze, sinistri degli ultimi 5 anni) accanto a quelli della richiesta, con le differenze evidenziate e gli avvisi; «Porta i dati di ANIA nella richiesta» crea una nuova versione.
- Niente «Completa i dati» (Dan, 2026-10-28, [ADR 0023](../adr/0023-dati-dal-bot.md)): i dati della richiesta vengono dai bot (documenti, targa, ANIA). Nella barra in basso la spunta «Confermo la correttezza dei dati estratti dal bot» e «Approva e apri l'asta»: un clic crea la versione dei dati e apre l'asta. Quello che i bot non trovano resta «non disponibile», anche per le agenzie, che vedono il riquadro «Dati ANIA confermati dal back office».
- Le altre informazioni in sezioni chiuse in fondo: dati e documenti a confronto, controllo automatico, agenzie da invitare, altre correzioni, versioni, cronologia. Le decisioni stanno nella barra in basso.
- I dati estratti dai documenti, affiancati a quelli dichiarati.
- Checklist: ogni voce mostra l'esito automatico, la correzione manuale e una nota. Le differenze sono evidenziate, per esempio sulla residenza.
- Regole dei casi esclusi che la richiesta fa scattare.
- Anteprima delle agenzie selezionate: quante sono, quali compagnie coprono. L'operatore può escluderne una, con motivo.
- Azioni: approva e apri l'asta; chiedi integrazione con messaggi pronti; escludi la richiesta, con avviso al cliente.

## Aste

- Elenco in tempo reale: richiesta, ora di chiusura, agenzie invitate, numero di offerte, prese in carico. Mai i prezzi prima della chiusura.
- Azioni, tutte con motivo e registrate: prolunga la chiusura (per esempio per un guasto tecnico), invita altre agenzie (solo nella prima metà dell'asta), annulla l'asta.

## Eccezioni

- **Aste deserte:** nuova asta con filtri più ampi, oppure avviso al cliente.
- **Mancate emissioni:** passaggio alla seconda offerta con avviso al cliente; proposta di penale.
- **Dati cambiati dopo l'accettazione:** ricalcolo con l'agenzia e nuova conferma del cliente, oppure rimborso.
- **Riconferme in corso,** con le loro scadenze.
- **Recessi e annullamenti:** avvio del rimborso.

## Pagamenti

- Incassi dal fornitore dei pagamenti, abbinati alla richiesta: autorizzato, incassato, fallito, rimborsato.
- Riconciliazione con l'estratto conto del conto separato.
- Rimesse per agenzia e periodo, con premio lordo, fee, netto e data; generazione del file dei bonifici e stato.
- Rimborsi: richiesta, approvazione del supervisore, esecuzione.
- Quadratura giornaliera.

## Agenzie e broker

- Coda di ingresso: dati, verifica RUI automatica, mandati, RC professionale, contratti firmati. Azioni: approva o respingi, con motivo.
- Elenco: stato, filtri, partecipazione, tempi di emissione, penali, segnalazioni, documenti in scadenza.
- Azioni: sospendi, riattiva, proponi l'esclusione all'amministratore, aggiungi note.

## Clienti

- Ricerca per nome, codice fiscale o targa.
- Scheda: richieste, polizze, consensi, ticket, reclami, registro degli accessi ai suoi dati.
- Richieste sui dati personali (copia, correzione, cancellazione), gestite nei termini di legge.

## Assistenza

- Ticket da chat in app ed email, collegati a richiesta o polizza.
- Assegnazione, risposte pronte, scadenze di risposta.

## Reclami

- Registro: data di ricezione, reclamante, oggetto, intermediario coinvolto, stato, scadenza della risposta (45 giorni), risposta ed esito.
- Esportazione per le comunicazioni a IVASS.

## Segnalazioni

- **Aggiramento:** segnalazioni di clienti e agenzie, con il registro degli accessi alla richiesta (chi l'ha aperta e quando).
- **Possibili frodi:** documenti alterati, residenze di comodo, dati incoerenti.
- Esito: archiviata, penale proposta, sospensione proposta.

## Fatturazione

- Fatture del fee a clienti e agenzie, con lo stato SDI.
- Note di credito per i rimborsi.

## Permessi

| Sezione | Operatore verifica | Assistenza | Contabilità | Supervisore |
| --- | --- | --- | --- | --- |
| Coda verifiche, aste | Sì | Lettura | No | Sì |
| Eccezioni | Sì | Lettura | Lettura | Sì |
| Pagamenti, fatturazione | No | Lettura | Sì | Sì |
| Agenzie e broker | Lettura | Lettura | Lettura | Sì |
| Clienti, assistenza | Lettura | Sì | Lettura | Sì |
| Reclami, segnalazioni | No | Apertura | No | Sì |
