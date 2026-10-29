# Agenzia (sez. A)

L'area dell'agenzia serve a trovare le richieste giuste, offrire in fretta ed emettere entro i termini. Il titolare vede tutto; supervisore e operatori vedono secondo i permessi.

## Menu

1. Dashboard
2. Richieste in arrivo
3. Le mie offerte
4. Da emettere
5. Polizze emesse
6. Risultati
7. Filtri e capacità
8. Contabilità
9. Team
10. Agenzia

## Dashboard

- Contatori: richieste nuove in target, aste che chiudono entro un'ora senza offerta, offerte in attesa del cliente, polizze da emettere con il termine, garanzie aperte, rimesse in arrivo.
- Indicatori degli ultimi 30 giorni: tasso di risposta, tasso di vittoria, scarto medio dal vincitore, tempo medio di emissione.
- Avvisi: termine di emissione vicino, RC professionale in scadenza, penali o sospensioni.

## Richieste in arrivo

«Partecipa all'asta»: tutte le aste aperte di AstAx, su cui ogni agenzia può offrire (Dan, 2026-10-29, [ADR 0024](../adr/0024-aste-aperte-a-tutte-le-agenzie.md)), ordinate per chiusura, con i filtri scelti a mano (anche classe CU, sinistri ed età del conducente) e il pulsante «Applica i miei filtri», che usa i filtri per le email salvati: tipo di veicolo, provincia, classe CU, sinistri, età del conducente, pacchetto, decorrenza, validità minima richiesta, conto alla rovescia, stato (nuova, presa in carico da…, offerta inviata, rinunciata).

### Dettaglio della richiesta

Dan, 2026-10-29 ([ADR 0024](../adr/0024-aste-aperte-a-tutte-le-agenzie.md)): solo tre parti.

- **Dati ANIA** confermati dal back office, con la scritta «Dati ANIA per facilitare il vostro preventivo, da confrontare con documenti e libretto forniti.»: tutti quelli disponibili tranne la scadenza della copertura e il nome dell'intestatario; in più il codice fiscale (o la partita IVA) e l'indirizzo scritti dal cliente e la tipologia del preventivo.
- **Richiesta:** guida (libera o esperta), garanzie (RCA e le altre del pacchetto), scatola nera (accetta o non accetta), pacchetto, decorrenza, validità minima dell'offerta, durata dell'asta.
- **Documenti:** tutti quelli caricati dal cliente, carta d'identità compresa.
- Niente sezioni veicolo, persone e storia assicurativa. Nome, telefono ed email del cliente mai prima dell'acquisto (il nome solo nei documenti). Ogni apertura viene registrata, e la pagina lo dice.
- Prima offerta dell'agenzia: chi la invia inserisce l'IBAN dell'agenzia e lo conferma con un codice via SMS sul proprio cellulare.
- Azioni: prendi in carico, rilascia, inserisci offerta, «non interessato» con motivo (fuori tariffa, compagnia non disponibile, profilo non assumibile, tempi).

### Modulo offerta

- Premio lordo annuo, imposte e contributo SSN inclusi.
- Compagnia, scelta tra i mandati dell'agenzia, e prodotto.
- Controllo del pacchetto: il sistema confronta le coperture richieste con quelle dichiarate e segnala le differenze.
- Massimali, franchigie, scoperti.
- Garantito fino al: non prima della validità minima richiesta.
- Preventivo PDF del portale della compagnia, obbligatorio.
- Note per il cliente, facoltative: il sistema blocca numeri di telefono, email e link.
- Conferma esplicita che l'offerta è vincolante; modifica o ritiro fino alla chiusura.

## Le mie offerte

Viste: in corso, in attesa del cliente, vinte, non scelte, escluse, scadute, ritirate.

- Per ogni riga: codice della richiesta, profilo sintetico, premio, compagnia, garantito fino al, stato, utente che ha offerto.
- Riconferme: le richieste di riconferma con la loro scadenza. Azioni: conferma il prezzo, aggiornalo, oppure rinuncia.

## Da emettere

- Elenco delle offerte vinte e pagate: cliente con contatti, targa, compagnia, premio, decorrenza, conto alla rovescia del termine di emissione.
- Dettaglio: tutti i dati, i contatti, i documenti firmati dal cliente, la ricevuta di pagamento.
- Azioni: carica polizza, quietanza e certificato; segna come emessa; segnala un problema (dati che non corrispondono, impossibilità di emettere). La segnalazione apre il caso al back office.
- Termine superato: avviso all'agenzia e al back office, con la penale prevista.

## Polizze emesse

- Elenco con filtri: cliente, targa, compagnia, decorrenza, scadenza, premio, utente.
- Contatti del cliente per l'assistenza post-vendita; reclami collegati.

## Risultati

- Per ogni asta conclusa con l'accettazione del cliente: le prime due offerte, anonime, la posizione della propria (per esempio quinta su otto) e lo scarto in percentuale dalla prima.
- Statistiche sui propri dati: risposte e vittorie per provincia, classe, tipo di veicolo e compagnia.
- Suggerimenti: profili simili a quelli vinti, da aggiungere ai filtri.

## Filtri e capacità

- Filtri dell'agenzia: tipi di veicolo, province, classi CU, sinistri massimi, età dei conducenti, pacchetti, compagnie, decorrenza massima, validità massima che l'agenzia può garantire.
- Capacità: massimo di richieste al giorno, orari di ricezione, pausa temporanea (per esempio le ferie).
- Distribuzione: richieste visibili a tutti gli utenti, oppure a ciascuno secondo i propri filtri.

## Contabilità

- Estratto conto per periodo: polizze emesse, premio lordo, fee trattenuto, importo rimesso, data e stato della rimessa.
- Fatture del fee emesse da AstAx, scaricabili.
- Penali applicate, con motivazione e possibilità di contestarle.
- Esportazione per il gestionale; IBAN e dati di fatturazione.

## Team

- Utenti: nome, ruolo (titolare, supervisore, operatore), numero RUI sez. E verificato, filtri personali, permessi, stato, ultimo accesso.
- Azioni: invita, sospendi, rimuovi, modifica permessi.
- Registro degli accessi dei propri utenti ai dati dei clienti.

## Agenzia

- Dati dell'agenzia, RUI sez. A, PEC, sede, IBAN.
- Compagnie mandanti, controllate sul RUI: sono le sole selezionabili nelle offerte.
- Documenti: RC professionale con la scadenza, visura camerale.
- Contratti accettati (collaborazione, condizioni d'uso, accordo privacy), con versione e data.
- Stato dell'account: attivo o sospeso, con il motivo.

## Permessi

| Funzione | Titolare | Supervisore | Operatore |
| --- | --- | --- | --- |
| Vedere e offrire sulle richieste | Sì | Sì | Sì, nei propri filtri |
| Vedere le offerte dei colleghi | Sì | Sì | Se abilitato |
| Emettere | Sì | Sì | Se abilitato |
| Risultati di tutta l'agenzia | Sì | Sì | No, solo i propri |
| Filtri dell'agenzia | Sì | Sì | No |
| Contabilità | Sì | Se abilitato | No |
| Team e dati dell'agenzia | Sì | No | No |
