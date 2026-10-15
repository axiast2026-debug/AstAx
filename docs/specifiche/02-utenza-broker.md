# Broker richiedente

Il broker vede solo i propri clienti e le proprie richieste. Il titolare gestisce in più team, contabilità e impostazioni.

## Menu

1. Dashboard
2. Nuova richiesta
3. Richieste
4. Clienti
5. Polizze
6. Rinnovi
7. Contabilità
8. Team (solo titolare)
9. Impostazioni (solo titolare)

## Dashboard

- Contatori: richieste in verifica, aste aperte, offerte da valutare, garanzie in scadenza nei prossimi 7 giorni, polizze emesse nel mese, rinnovi nei prossimi 30 giorni.
- Lista «da fare»: integrazioni chieste dal back office, offerte in scadenza, firme e pagamenti in sospeso dei clienti.
- Risparmio medio rispetto al premio attuale, quando il broker lo ha indicato.

## Nuova richiesta

Procedura guidata in sei passaggi, salvabile come bozza in ogni momento.

1. **Cliente:** sceglie un cliente esistente o ne crea uno (nome, codice fiscale, contatti). I contatti non arrivano mai alle agenzie in asta.
2. **Veicolo:** targa con recupero automatico dei dati, foto del libretto, tipo e uso del veicolo.
3. **Conducenti:** contraente, proprietario, conducenti abituali, patenti, formula di guida (libera, esperta, esclusiva).
4. **Copertura:** pacchetto standard, decorrenza, frazionamento, premio attuale (facoltativo, serve a calcolare il risparmio).
5. **Asta:** durata (1, 2, 5 o 24 ore) e validità minima del prezzo (per esempio 7, 15 o 30 giorni).
6. **Consenso e invio:** link di firma inviato al cliente, oppure caricamento del consenso già raccolto dal broker; poi riepilogo e invio.

Caricamento in blocco: modello CSV più archivio dei documenti. Il sistema controlla ogni riga e crea una bozza per riga; le righe con errori restano da correggere.

## Richieste

Elenco con colonne: cliente, targa, pacchetto, stato, chiusura dell'asta o scadenza della garanzia, numero di offerte, miglior premio, operatore.

- Filtri per stato, operatore, periodo, cliente; ricerca per targa o nome.
- Azioni: apri, duplica per un altro veicolo, annulla prima dell'accettazione, esporta.

## Dettaglio richiesta

- Stato e cronologia degli eventi, con data e ora.
- Dati inviati, in sola lettura dopo la verifica: le correzioni passano dal back office.
- Esito della verifica e messaggi del back office.
- Durante l'asta: conto alla rovescia, numero di offerte, numero di agenzie invitate, senza nomi.
- Dopo la chiusura, tabella con la migliore offerta di ogni compagnia: premio lordo, compagnia, pacchetto, franchigie, garantito fino al, giorni rimasti, preventivo PDF. La più bassa ha un'etichetta, le scadute sono in grigio.
- Azioni: invia al cliente il confronto o l'offerta scelta, con il link per firmare e pagare; chiedi riconferma se tutte le garanzie sono scadute; annulla.
- Dopo l'accettazione: agenzia emittente e contatti, stato dell'emissione, documenti firmati, polizza e quietanza.
- Quota di provvigione del broker su quella polizza.

## Clienti

- Elenco: nome, codice fiscale, veicoli, polizze attive, prossima scadenza.
- Scheda cliente: anagrafica, contatti, consensi con data e versione, veicoli e conducenti, richieste, polizze, documenti.
- Azioni: nuova richiesta per il cliente, aggiorna documenti. Se il cliente revoca il consenso, non si aprono nuove aste per lui.

## Polizze

- Elenco: cliente, targa, compagnia, agenzia emittente, decorrenza, scadenza, premio, stato (attiva, in scadenza, scaduta, annullata).
- Dettaglio: documenti, ricevuta di pagamento, contatti dell'agenzia, ticket e reclami collegati.
- Esportazione.

## Rinnovi

- Scadenze dei prossimi 60 giorni, raggruppate per settimana.
- Rinnovo automatico in asta, attivabile per cliente: 30 giorni prima della scadenza il sistema riverifica l'attestato e apre l'asta con i dati salvati.
- Azione in blocco: avvia le aste per tutte le scadenze del mese.

## Contabilità

- Estratto conto: polizze emesse, premi, provvigioni maturate, compensi di intermediazione dovuti ad AstAx (30 € a polizza, esenti IVA), stato (maturata, liquidata), data di liquidazione.
- Fatture e note di credito scaricabili.
- Esportazione CSV per il gestionale.

## Team (solo titolare)

- Utenti: nome, ruolo, numero RUI sez. E, stato, ultimo accesso.
- Azioni: invita, sospendi, rimuovi; sceglie se ogni operatore vede tutti i clienti o solo i propri.
- Registro delle attività del team.

## Impostazioni (solo titolare)

- Dati della società, RUI, PEC, dati di fatturazione, IBAN per le provvigioni.
- Contratti accettati con la versione; RC professionale con la scadenza.
- Valori predefiniti: pacchetto, durata dell'asta, validità minima.
- Fase 2: accesso API per inviare richieste dal proprio gestionale.

## Permessi

| Funzione | Titolare | Operatore |
| --- | --- | --- |
| Creare e seguire richieste | Sì | Sì |
| Vedere tutti i clienti del broker | Sì | Se abilitato |
| Contabilità | Sì | No |
| Team e impostazioni | Sì | No |
