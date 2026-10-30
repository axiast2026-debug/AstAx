# Utenze: elementi comuni

Queste regole valgono per tutte le utenze. Le schede dei singoli ruoli descrivono solo menu, schermate e funzioni propri di ciascuno.

## Accesso e sicurezza

- **Privato:** accesso con email o telefono e codice OTP, senza password. L'email del codice contiene anche un link che fa entrare con un tocco: vale una volta sola e scade con il codice ([ADR 0019](../adr/0019-link-magico.md)); il codice resta come alternativa.
- **Utenze professionali** (broker, agenzia, sub-agente, back office, amministratore): email, password e autenticazione a due fattori obbligatoria.
- Durata della sessione impostata dall'amministratore, più breve per back office e amministratore.
- Ogni utente vede accessi recenti e dispositivi collegati, e può disconnetterli.
- Al primo accesso, e a ogni nuova versione dei documenti legali, l'utente li accetta prima di continuare.

## Barra superiore

- Centro notifiche con il contatore delle non lette.
- Assistenza: chat o ticket con il back office.
- Menu del profilo.
- Solo sub-agente: selettore dell'agenzia, se collabora con più agenzie.
- Lingua dell'interfaccia: solo italiano, per tutti (ADR 0017, Dan, 2026-10-22).

## Profilo

- Dati personali e contatti; la modifica di email e telefono richiede un codice OTP.
- Password e autenticazione a due fattori, per le utenze professionali.
- Preferenze di notifica per evento e per canale: in app, email, push, WhatsApp.
- Documenti legali accettati, con versione e data, scaricabili.
- Diritti sui propri dati: copia, correzione, cancellazione, salvo gli obblighi di conservazione.

## Chi vede cosa

| Dato | Privato | Broker | Agenzia | Sub-agente | Back office | Amministratore |
| --- | --- | --- | --- | --- | --- | --- |
| Dati per il preventivo | I propri | Dei propri clienti | Se invitata | Se nei suoi filtri | Sì | Sì |
| Telefono ed email del cliente | I propri | Dei propri clienti | Solo se vince | Solo se vince la sua agenzia | Sì | Sì |
| Prezzi durante l'asta | No | No | Solo la propria offerta | Solo le proprie offerte | No | No |
| Offerte dopo la chiusura | La migliore per compagnia | La migliore per compagnia | Solo la propria | Solo le proprie | Sì | Sì |
| Nome dell'agenzia emittente | All'accettazione | All'accettazione | — | — | Sì | Sì |
| Classifica: prime due offerte anonime e propria posizione | No | No | Dall'accettazione | Dall'accettazione | Sì | Sì |
| Registro degli accessi ai dati | No | No | Della propria agenzia | No | Sì | Sì |

## Stati della richiesta

| Stato | Cosa significa | Prossima azione |
| --- | --- | --- |
| Bozza | Richiesta iniziata e non inviata | Richiedente: completa e invia |
| In verifica | Il back office controlla dati e documenti | Back office |
| Integrazione richiesta | Manca un documento o un dato non torna | Richiedente |
| Esclusa | Non va all'asta: il cliente viene avvisato | Back office |
| Asta aperta | Le agenzie invitate stanno offrendo | Agenzie |
| Offerte disponibili | Asta chiusa con almeno un'offerta garantita | Richiedente: sceglie |
| Deserta | Nessuna offerta valida | Back office |
| Scaduta | Tutte le garanzie sono scadute senza accettazione | Richiedente: riconferma o nuova richiesta |
| In riconferma | Chiesta conferma del prezzo alle stesse agenzie | Agenzie |
| Accettata | Offerta scelta: per il privato firma e pagamento in corso; per l'intermediario offerta pagata, in attesa della firma del cliente (ADR 0027) | Richiedente |
| In emissione | Pagamento confermato, l'agenzia emette | Agenzia vincitrice |
| Emessa | Polizza e documenti disponibili | Nessuna |
| Annullata | Ritirata dal richiedente o recesso | Back office, se c'è un rimborso |

## Stati dell'offerta

| Stato | Cosa significa |
| --- | --- |
| Inviata | Asta aperta: modificabile o ritirabile fino alla chiusura |
| Ritirata | Ritirata prima della chiusura |
| Esclusa | Non conforme al pacchetto o senza preventivo PDF |
| In attesa del cliente | Asta chiusa, offerta garantita fino alla sua data |
| Vincente | Accettata e pagata: da emettere entro il termine |
| Emessa | Polizza caricata |
| Non scelta | Il cliente ha accettato un'altra offerta |
| Scaduta | Garanzia finita senza accettazione |

## Notifiche

Ogni utente sceglie i canali nel profilo. Gli avvisi con una scadenza (asta in chiusura, termine di emissione) arrivano sempre anche via push.

| Evento | Chi riceve |
| --- | --- |
| Richiesta inviata | Back office |
| Integrazione richiesta | Richiedente |
| Asta aperta | Richiedente, con l'ora di chiusura; agenzie invitate |
| Un'ora alla chiusura | Agenzie invitate che non hanno ancora offerto |
| Asta chiusa | Richiedente; agenzie partecipanti, con lo stato della propria offerta |
| Asta deserta | Richiedente, back office |
| Garanzia in scadenza, 2 giorni prima | Richiedente |
| Richiesta di riconferma | Agenzie che avevano offerto |
| Offerta accettata e pagata | Agenzia vincitrice, con i contatti; back office |
| Termine di emissione vicino o superato | Agenzia vincitrice, back office |
| Polizza emessa | Richiedente, back office |
| Classifica disponibile | Agenzie partecipanti |
| Rinnovo tra 30 giorni | Richiedente |
| Rimessa eseguita | Agenzia |
| Nuovo reclamo o segnalazione | Back office (supervisore) |
