# Ruoli e permessi

I permessi si controllano nell'API, con negazione predefinita (SIC-01): un'azione non elencata qui è vietata. Questa tabella diventa una mappa di permessi nel codice e un test che prova, per ogni ruolo, le azioni consentite e quelle vietate.

## Ruoli

| Ruolo | Organizzazione | Note |
| --- | --- | --- |
| `PRIVATE` | nessuna | Privato; opera solo sulle proprie richieste |
| `BROKER_CLIENT_LINK` | nessuna | Cliente del broker che apre il link: vale per una sola richiesta, dopo un codice OTP, fino alla scadenza della garanzia |
| `OWNER` | `BROKER` o `AGENCY` | Titolare |
| `SUPERVISOR` | `AGENCY` | Facoltativo |
| `OPERATOR` | `BROKER` o `AGENCY` | Operatore o sub-agente |
| `BO_VERIFIER`, `BO_SUPPORT`, `BO_ACCOUNTING`, `BO_SUPERVISOR` | `ASTAX` | Back office |
| `ADMIN` | `ASTAX` | Amministratore |

Ogni utente professionale lavora in un contesto: l'appartenenza scelta nel selettore. Ogni chiamata porta l'intestazione `X-AstAx-Context` con l'identificativo dell'appartenenza; l'API verifica che appartenga all'utente e che sia attiva, e limita ogni lettura a quell'organizzazione (SIC-02).

Abilitazioni aggiuntive di un'appartenenza, decise dal titolare:

| Abilitazione | Vale per | Effetto |
| --- | --- | --- |
| `canIssue` | `OPERATOR` di agenzia | Vede «Da emettere» ed emette |
| `canSeeColleagueOffers` | `OPERATOR` di agenzia | Vede le offerte dei colleghi |
| `canSeeAccounting` | `SUPERVISOR` di agenzia | Vede la contabilità e contesta le penali |
| `seesAllClients` | `OPERATOR` di broker | Vede tutti i clienti del broker, non solo i propri |

## Richieste, clienti e documenti

| Azione | Chi | Condizioni |
| --- | --- | --- |
| Creare e inviare una richiesta | `PRIVATE`; `OWNER` e `OPERATOR` di broker; `OWNER`, `SUPERVISOR` e `OPERATOR` di agenzia per i propri clienti ([ADR 0015](adr/0015-agenzia-richiedente.md)) | Consenso presente (LEG-04) |
| Strumenti di sviluppo (far scattare un timer, offerte di prova, orologio in avanti) | `BO_VERIFIER`, `BO_SUPERVISOR`, `ADMIN` | Solo con `DEV_TOOLS=true`, mai in produzione (regola 13) |
| Revocare il consenso alla condivisione con le agenzie | `PRIVATE` (propri consensi); `OWNER` e `OPERATOR` di broker (consensi dei propri clienti) | LEG-04: da allora non si aprono nuove aste per il cliente |
| Vedere la propria richiesta, la cronologia, i propri documenti | `PRIVATE`; broker; agenzia richiedente | Broker e agenzia: clienti dell'organizzazione; `OPERATOR` solo i propri, salvo `seesAllClients`; il `SUPERVISOR` di agenzia li vede tutti |
| Annullare una richiesta | Richiedente; `BO_SUPERVISOR` | Solo prima dell'accettazione |
| Vedere i dati del preventivo e i documenti del cliente | Utenti di un'agenzia invitata; `BO_*`; `ADMIN` | `OPERATOR`: solo richieste nei propri filtri. Registrazione (VIS-09) e filigrana (VIS-10) per le agenzie |
| Vedere telefono ed email del cliente | Richiedente; agenzia vincitrice; `BO_*`; `ADMIN` | Agenzia: solo dopo la conferma del pagamento (VIS-02) |
| Gestire i clienti del broker | `OWNER` e `OPERATOR` di broker | Stesse condizioni di visibilità |
| Caricamento in blocco | `OWNER` e `OPERATOR` di broker | — |

## Verifica e asta

| Azione | Chi | Condizioni |
| --- | --- | --- |
| Vedere la coda e la scheda di verifica | `BO_VERIFIER`, `BO_SUPERVISOR`; in lettura `BO_SUPPORT`, `ADMIN` | — |
| Approvare, chiedere integrazione, escludere | `BO_VERIFIER`, `BO_SUPERVISOR` | Con motivo per integrazione ed esclusione |
| Escludere un'agenzia dall'anteprima | `BO_VERIFIER`, `BO_SUPERVISOR` | Con motivo |
| Vedere lo stato delle aste (senza prezzi) | `BO_*`, `ADMIN`; richiedente (contatori); agenzie invitate (il proprio invito) | Mai prezzi prima della chiusura (BC-01) |
| Prolungare, invitare altre agenzie, annullare un'asta | `BO_VERIFIER`, `BO_SUPERVISOR` | Inviti solo nella prima metà (ASTA-06); sempre con motivo |
| Leggere un'offerta prima della chiusura | Nessuno | Eccezione: l'agenzia che l'ha fatta (BC-04) |

## Offerte e riconferme

| Azione | Chi | Condizioni |
| --- | --- | --- |
| Prendere in carico, rilasciare, rinunciare | Utenti dell'agenzia invitata | `OPERATOR` nei propri filtri; OFF-02 e OFF-03 |
| Liberare o riassegnare una presa in carico | `OWNER`, `SUPERVISOR` di agenzia | — |
| Inviare, modificare, ritirare un'offerta | Chi ha la presa in carico; `OWNER`, `SUPERVISOR` | Fino alla chiusura (OFF-07) |
| Rileggere un'offerta durante l'asta | Chi l'ha fatta; `OWNER`, `SUPERVISOR`; `OPERATOR` con `canSeeColleagueOffers` | Copia per l'agenzia, registrata |
| Rispondere a una riconferma | Come per le offerte | Entro il termine (GAR-07) |
| Escludere un'offerta dopo il controllo del PDF | `BO_VERIFIER`, `BO_SUPERVISOR` | Finché il cliente non l'ha accettata (OFF-09) |
| Vedere tutte le offerte dopo la chiusura | `BO_*`, `ADMIN` | — |
| Vedere la classifica e i risultati | `OWNER`, `SUPERVISOR` (tutta l'agenzia); `OPERATOR` (solo le proprie offerte) | Dopo la pubblicazione (CLA-02) |
| Gestire filtri e capacità dell'agenzia | `OWNER`, `SUPERVISOR` | — |
| Gestire i propri filtri | Ogni utente di agenzia | Solo restringendo quelli dell'agenzia |
| Gestire la libreria prodotti | `OWNER`, `SUPERVISOR` | Solo compagnie con mandato verificato |

## Accettazione, pagamento, emissione

| Azione | Chi | Condizioni |
| --- | --- | --- |
| Vedere le offerte presentate | Richiedente; `BROKER_CLIENT_LINK` per le offerte inviate dal broker | Regole PRES |
| Usare «Confronta con AI» | Solo `PRIVATE` | PRES-06 |
| Inviare al cliente il link di accettazione | `OWNER` e `OPERATOR` di broker | — |
| Accettare, firmare, pagare | `PRIVATE` (propria richiesta); `BROKER_CLIENT_LINK` | GAR-04 |
| Chiedere la riconferma | Richiedente | GAR-06 |
| Vedere «Da emettere», caricare documenti, segnare emessa, segnalare un problema | `OWNER`, `SUPERVISOR` dell'agenzia vincitrice; `OPERATOR` con `canIssue` | — |
| Decidere una mancata emissione, passare alla seconda offerta | `BO_VERIFIER`, `BO_SUPERVISOR` | EMI-04 |
| Chiedere un rimborso | `BO_SUPPORT`, `BO_ACCOUNTING`, `BO_SUPERVISOR` | — |
| Approvare un rimborso | `BO_SUPERVISOR` | PAG-05 |
| Chiedere il recesso dalla propria polizza, entro `withdrawal.days` dall’emissione | Privato; utenti del broker per i propri clienti (VIS-13), solo con `withdrawal.onPlatform` acceso (spento: domanda 18, risposta A) | PAG-04 |
| Gestire una richiesta di recesso | `BO_SUPPORT`, `BO_SUPERVISOR`; l'agenzia indica il premio da rimborsare; solo con `withdrawal.onPlatform` acceso | PAG-04 |

## Contabilità e penali

| Azione | Chi | Condizioni |
| --- | --- | --- |
| Vedere incassi, riconciliazione, rimesse, fatture | `BO_ACCOUNTING`, `BO_SUPERVISOR`; in lettura `BO_SUPPORT`, `ADMIN` | — |
| Generare il file dei bonifici e segnare la rimessa eseguita | `BO_ACCOUNTING`, `BO_SUPERVISOR` | — |
| Vedere l'estratto conto dell'agenzia | `OWNER`; `SUPERVISOR` con `canSeeAccounting` | — |
| Vedere l'estratto conto del broker | `OWNER` di broker | — |
| Vedere le proprie fatture | Il destinatario (privato; titolare dell'organizzazione; supervisore di agenzia con `canSeeAccounting`) | — |
| Proporre una penale | Sistema; `BO_VERIFIER`, `BO_SUPERVISOR` | — |
| Applicare una penale | `BO_SUPERVISOR` | — |
| Contestare una penale | `OWNER`; `SUPERVISOR` con `canSeeAccounting` | Entro il termine (EMI-05) |
| Decidere una contestazione, escludere un'organizzazione | `ADMIN` | — |

## Organizzazioni, utenti, controllo

| Azione | Chi | Condizioni |
| --- | --- | --- |
| Invitare, sospendere, rimuovere utenti; dare abilitazioni | `OWNER` della propria organizzazione | — |
| Modificare dati, IBAN, mandati dell'organizzazione | `OWNER` | Cambi di IBAN con verifica OTP e registrazione |
| Approvare o respingere l'ingresso di agenzie e broker | `BO_SUPERVISOR` | Con motivo |
| Sospendere e riattivare | `BO_SUPERVISOR`; `ADMIN` | Con motivo |
| Registro degli accessi della propria agenzia | `OWNER` di agenzia | VIS-08 |
| Registro degli accessi ai dati di un cliente | `BO_SUPPORT`, `BO_SUPERVISOR`, `ADMIN` | — |
| Registro attività completo | `BO_SUPERVISOR`, `ADMIN` | — |
| Riconciliazione: import dell'estratto conto, abbinamenti, coda delle righe senza abbinamento | `BO_ACCOUNTING`, `BO_SUPERVISOR` | Ogni abbinamento a mano con nota, registrato |
| Dashboard operativa del back office | Tutti i ruoli del back office; `ADMIN` | Solo le code del proprio ruolo: contatori e attese, nessun dato dei clienti |
| Ticket di assistenza | `BO_SUPPORT`, `BO_SUPERVISOR` | — |
| Aprire un reclamo o una segnalazione | `BO_SUPPORT`, `BO_SUPERVISOR` (reclami arrivati per email, PEC, posta o telefono: `complaint.register`); il cliente apre il reclamo dalla sua area (`complaint.open`) | — |
| Gestire reclami e segnalazioni | `BO_SUPERVISOR` | — |
| Richieste sui dati personali (copia, correzione, cancellazione) | `BO_SUPPORT`, `BO_SUPERVISOR` | Nei termini di legge |

## Amministrazione

| Azione | Chi |
| --- | --- |
| Parametri d'asta, economia, penali, pesi del confronto AI, indice reclami delle compagnie | `ADMIN` |
| Pacchetti, casi esclusi, elenchi di valori, festività | `ADMIN` |
| Documenti legali e versioni | `ADMIN` |
| Modelli delle notifiche e messaggi a gruppi | `ADMIN` |
| Utenti: bloccare, sbloccare, reimpostare il secondo fattore; ruoli del back office | `ADMIN` |
| Stato delle integrazioni, report ed esportazioni | `ADMIN` |

Nessun ruolo, `ADMIN` compreso, può leggere un'offerta altrui prima della chiusura. Ogni modifica dell'amministratore registra valore prima e dopo, autore e motivo.
