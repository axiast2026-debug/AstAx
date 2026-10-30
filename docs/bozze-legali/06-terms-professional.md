# Condizioni d'uso per i professionisti, con penali e non aggiramento

**Bozza n. 1 del 22/10/2026 — [DA VALIDARE — LEGALE]**

| | |
| --- | --- |
| Chiave del documento | `terms-professional` |
| Chi lo accetta | Ogni utente professionale: titolari, supervisori e operatori di broker (sez. B) e di agenzie (sez. A), sub-agenti e altri collaboratori (sez. E), intermediari di sez. E iscritti da soli |
| Quando | All'ingresso (primo accesso), prima di ogni altra funzione; di nuovo a ogni nuova versione (LEG-02) |
| Fonti | `CLAUDE.md` (regole non violabili); `docs/specifiche/00` (Ruoli 1, 3, 4; Processi 2-4), `01`, `02`, `04`, `05`, `06`, `09` §1, §5, §7; `docs/regole-di-dominio.md` (BC, VIS, OFF, ASTA, GAR, EMI, CONT, CLA, SIC); `docs/decisioni-aggiunte.md`; `docs/busta-chiusa.md`; `docs/permessi.md`; `docs/piano-broker.md`; `docs/piano-agenzie.md`; `docs/adr/0014`, `0015`; `docs/punti-aperti.md` («Penali e non aggiramento»); `seed/parametri.json` (`penalties.*`, `issuance.*`, `session.*`, `team.inviteValidityDays`, `notes.maxChars`) |

> Convenzioni: [MAIUSCOLO] = dato da fornire. Tutti i numeri sono i valori in vigore oggi; la Piattaforma applica a ogni asta i valori in vigore alla sua apertura (ASTA-09) e mostra sempre quelli correnti nell'area dell'utente.

---

## Art. 1 — Oggetto e rapporto con gli accordi di collaborazione

1.1 Queste condizioni regolano l'uso della piattaforma AstAx («Piattaforma»), gestita da [RAGIONE SOCIALE], broker iscritto al RUI sez. B n. [NUMERO RUI] («AstAx»), da parte degli intermediari e dei loro utenti («Utenti professionali»).

1.2 Per l'organizzazione (agenzia o broker) valgono anche l'Accordo di collaborazione con le agenzie o con i broker e l'Accordo sul trattamento dei dati. In caso di contrasto prevalgono gli accordi di collaborazione.

1.3 I collaboratori sez. E che operano come utenti di un'agenzia o di un broker non hanno un contratto diretto con AstAx: accettano queste condizioni, compreso l'impegno di riservatezza e di non aggiramento, e operano sempre a nome dell'organizzazione selezionata, che risponde del loro operato.

> **Nota per il legale:** intermediario di sez. E iscritto da solo come «agenzia a nome suo» (`docs/piano-agenzie.md`, righe 67, 81 e 108, risposte 1C e 6A-9A di Dan, già nel codice). Questo contrasta con OFF-10 (`docs/regole-di-dominio.md`, riga 46: «I collaboratori sez. E operano sempre a nome dell'agenzia selezionata»), con `CLAUDE.md` (riga 8) e con le specifiche 00 (riga 179, «Nessun contratto diretto»). Va valutato se un iscritto in sez. E può presentare offerte vincolanti ed emettere a nome proprio, se deve agire comunque per conto dell'agenzia per cui è iscritto (con il suo consenso) e quale contratto firma con AstAx.

## Art. 2 — Accesso e utenze

2.1 Ogni utente ha un'utenza personale, non cedibile, con email, password e secondo fattore di autenticazione obbligatorio. La sessione si chiude dopo il periodo di inattività in vigore (oggi 8 ore). Dopo troppi tentativi sbagliati l'utenza si blocca temporaneamente.

2.2 Lo stesso indirizzo email non può essere usato per un'utenza privata e per una professionale.

2.3 Il titolare dell'organizzazione invita gli utenti (l'invito vale oggi 30 giorni), ne stabilisce ruoli, filtri e permessi, e li sospende o rimuove. Il titolare risponde delle azioni compiute dagli utenti della propria organizzazione e comunica subito ad AstAx la cessazione di un collaboratore o la perdita dei suoi requisiti.

2.4 Un collaboratore che lavora per più organizzazioni ha un'unica utenza con un contesto per ciascuna; ogni azione vale per l'organizzazione selezionata.

## Art. 3 — Requisiti e verifiche

3.1 Le organizzazioni e gli utenti devono essere e restare iscritti al RUI nella sezione dichiarata. AstAx verifica all'ingresso l'iscrizione, i mandati delle compagnie (per le agenzie), la polizza di RC professionale e gli altri documenti richiesti, e può ripetere i controlli in ogni momento.

3.2 L'organizzazione mantiene aggiornati PEC, IBAN, mandati e RC professionale; la Piattaforma avvisa prima della scadenza della RC professionale (oggi 30 giorni). Un'agenzia può offrire solo con le compagnie di cui ha un mandato verificato.

## Art. 4 — Busta chiusa

4.1 Prima della chiusura di un'asta nessuno può conoscere il prezzo o il contenuto delle offerte altrui: né le altre agenzie, né il richiedente, né il personale o gli amministratori di AstAx. Le offerte sono cifrate all'arrivo e decifrate solo dal processo automatico di chiusura; ogni tentativo di lettura anticipata è negato e registrato.

4.2 Su richiesta di un'agenzia partecipante AstAx fornisce, per una specifica asta, l'elenco degli eventi di apertura, invio, chiusura e decifratura registrati.

4.3 È vietato ogni tentativo di conoscere o far conoscere le offerte altrui prima della chiusura, ogni accordo tra partecipanti sui prezzi o sulla partecipazione e ogni comunicazione con altri partecipanti sul contenuto delle offerte.

## Art. 5 — Inviti e richieste (agenzie)

5.1 AstAx invita le agenzie secondo criteri oggettivi: filtri impostati dall'agenzia (veicolo, province, classi, sinistri, età dei conducenti, garanzie, compagnie, decorrenza, validità massima garantibile, accettazione di richieste senza documenti), stato attivo, capacità giornaliera, orari di ricezione; poi varietà di compagnie e rotazione. Oggi al massimo 8 agenzie per asta, più fino a 4 se a metà asta ci sono meno di 3 offerte. Il back office può aggiungere inviti solo nella prima metà dell'asta.

5.2 L'agenzia può mettersi in pausa, limitare la capacità e scegliere gli orari di ricezione. Mantenere filtri realistici fa parte degli obblighi di correttezza.

5.3 Le agenzie attive su AstAx (ADR 0024: le aste sono aperte a tutte) vedono i dati utili al preventivo e i documenti della richiesta, **mai telefono ed email del cliente**. Ogni apertura del dettaglio o di un documento è registrata e la pagina lo dice; i documenti portano una filigrana con agenzia, utente, data e ora. Il titolare vede il registro degli accessi dei propri utenti.

5.4 La presa in carico di una richiesta la blocca per gli altri utenti della stessa agenzia fino al rilascio, all'intervento del titolare o del supervisore, o alla chiusura.

## Art. 6 — Le offerte

6.1 Ogni agenzia fa al massimo **un'offerta per giro d'asta**, chiunque dei suoi utenti la inserisca; ogni persona fisica fa al massimo un'offerta per giro, anche se collabora con più agenzie invitate.

6.2 L'offerta contiene: premio lordo annuo (imposte e contributo SSN inclusi), compagnia tra i mandati verificati, prodotto, dichiarazione delle coperture per ogni garanzia richiesta, data di prezzo garantito, preventivo PDF del portale della compagnia, eventuali note per il cliente (oggi al massimo 300 caratteri, senza numeri di telefono, email o link) e la conferma esplicita che l'offerta è **vincolante**.

6.3 Le coperture devono essere uguali o migliori di quelle richieste; un'offerta dichiarata non conforme è esclusa alla chiusura, con il motivo. Dopo la chiusura un controllo automatico confronta il PDF con l'offerta dichiarata e segnala le differenze al back office, che può escludere l'offerta, con motivo, finché il cliente non l'ha accettata. L'offerta vincolante è quella dichiarata.

6.4 L'offerta si modifica o si ritira fino alla chiusura; conta l'ora del server. Dopo la chiusura non si ritira ed è vincolante fino alla data di garanzia.

6.5 Alle aste chieste da un'agenzia o da un suo collaboratore, le altre agenzie non possono offrire con le compagnie in comune con l'agenzia richiedente; l'agenzia richiedente non è invitata alle proprie aste.

## Art. 7 — Prezzo garantito e riconferma

7.1 La data di garanzia non può essere anteriore alla garanzia minima della richiesta (chiusura prevista all'apertura più la validità minima richiesta; oggi, di regola, 15 giorni). L'offerta è garantita fino alle 23:59:59 (ora italiana) di quella data, a condizione che decorrenza e dati del preventivo non cambino.

7.2 **Durante la garanzia il rischio di un cambio di tariffa della compagnia è a carico dell'agenzia**, che emette comunque al prezzo offerto.

7.3 Quando tutte le garanzie sono scadute, il richiedente può chiedere una riconferma alle agenzie che avevano un'offerta valida (oggi al massimo 2 volte per richiesta). L'agenzia risponde entro il termine in vigore (oggi 24 ore lavorative) confermando, aggiornando (anche al rialzo) o rinunciando, con una nuova data di garanzia, sempre a busta chiusa.

7.4 In bacheca l'agenzia vede tutte le proprie offerte ancora vincolanti, con la scadenza.

## Art. 8 — Emissione

8.1 Con il pagamento confermato l'agenzia vincitrice riceve i contatti del cliente ed emette la polizza **entro il termine in vigore (oggi 4 ore lavorative dalla conferma del pagamento, contate dal lunedì al venerdì dalle 9 alle 19, esclusi i festivi) e comunque prima della decorrenza**; con la decorrenza «immediata», entro il termine. L'agenzia carica polizza, quietanza e certificato e segna la polizza come emessa.

8.2 Se l'emissione non è possibile, l'agenzia lo segnala subito dalla Piattaforma con il motivo. Se la causa sono dati errati del cliente, l'agenzia ricalcola il premio con il back office.

8.3 L'agenzia risponde dell'operato dei propri collaboratori, compresi i sub-agenti abilitati a emettere.

## Art. 9 — Classifica

9.1 Quando il cliente firma l'accettazione, ogni agenzia partecipante vede il premio della prima e della seconda offerta, senza agenzia né compagnia, la posizione della propria (per esempio «5ª su 8», dove 8 è il numero di offerte valide) e lo scarto in percentuale dalla prima. Se la richiesta si annulla senza accettazione, la classifica dell'ultimo giro con offerte valide si pubblica in quel momento. Durante una riconferma la classifica della richiesta resta nascosta. Prima della pubblicazione l'agenzia vede solo lo stato della propria offerta.

## Art. 10 — Richiedenti (broker e agenzie che chiedono preventivi per i propri clienti)

10.1 Il richiedente inserisce solo dati veri, di clienti che gli hanno dato incarico e per i quali dispone del consenso o della copertura della dichiarazione unica (documento 09). Comunica subito ad AstAx la revoca del consenso di un cliente: da allora non si aprono nuove aste per quel cliente.

10.2 Il richiedente invia al cliente, dalla Piattaforma, il link per scegliere, firmare e pagare. Il cliente del richiedente non paga compensi ad AstAx; il richiedente paga ad AstAx il compenso previsto dal proprio accordo (oggi 30 € a polizza emessa).

10.3 Nei lotti caricati da file la richiesta parte verso il back office alla data programmata (oggi 7 giorni prima della scadenza della polizza); il richiedente carica i documenti quando richiesto (oggi 3 giorni prima dell'asta). Una richiesta senza documenti va solo alle agenzie che le accettano.

## Art. 11 — Non aggiramento

11.1 È **aggiramento** il contatto, diretto o tramite terzi, di un cliente o di un richiedente conosciuto tramite la Piattaforma, per proporgli un contratto fuori dalla Piattaforma, quando l'agenzia non ha vinto l'asta e ottenuto i contatti secondo queste condizioni. È aggiramento anche l'uso dei dati di una richiesta (targa, codice fiscale, nome, documenti) per rintracciare il cliente.

11.2 È vietato: copiare, esportare o conservare fuori dalla Piattaforma i dati e i documenti delle richieste non vinte; inserire nelle note o nei PDF recapiti, link o inviti a contatti diretti; concludere con il cliente, fuori dalla Piattaforma, un contratto per il veicolo oggetto della richiesta.

11.3 Il divieto vale per l'organizzazione, per tutti i suoi utenti e per i soggetti a essi collegati, per tutta la durata del rapporto e per [DURATA POST-CONTRATTUALE] dopo la sua cessazione.

11.4 AstAx accerta l'aggiramento anche con il registro degli accessi (chi ha aperto la richiesta e quando), con le segnalazioni di clienti e agenzie e con il questionario inviato al cliente dopo l'emissione.

> **Nota per il legale:** clienti già dell'agenzia. Le fonti non dicono come trattare il caso in cui il cliente sia già cliente dell'agenzia invitata (per esempio l'agenzia che ha emesso la polizza in corso, invitata in automatico al rinnovo) o contatti di sua iniziativa un'agenzia. Il codice oggi non distingue questi casi. Serve un'eccezione chiara (con onere della prova) per non limitare la libertà di scelta del cliente.

## Art. 12 — Penali

12.1 Fermo il risarcimento del maggior danno, si applicano le seguenti penali, nella misura in vigore al momento del fatto:

| Violazione | Penale (valore in vigore oggi) | Altre conseguenze |
| --- | --- | --- |
| Ritardo di emissione (termine superato) | 25 € | — |
| Mancata emissione per causa dell'agenzia (nessuna emissione prima della decorrenza, o entro il termine con decorrenza «immediata», o impossibilità segnalata) | 100 €, che sostituisce la penale per ritardo | Il cliente passa alla seconda offerta o è rimborsato; dopo 3 mancate emissioni in 6 mesi sospensione automatica dagli inviti, confermata o revocata dall'amministratore |
| Aggiramento accertato | 1.000 € | Esclusione dalla Piattaforma |

12.2 **Procedura.** La penale è proposta dal sistema o dal back office; il supervisore del back office la applica e la comunica all'agenzia con la motivazione; l'agenzia può contestarla dalla Piattaforma entro il termine in vigore (oggi 10 giorni); decide in via definitiva l'amministratore di AstAx, con decisione motivata. L'aggiramento e l'esclusione sono decisi dall'amministratore su proposta del back office.

12.3 Le penali applicate sono trattenute dalla prima rimessa utile; se la rimessa non basta il residuo passa alla successiva. Una rimessa non è mai negativa.

12.4 La sospensione e l'esclusione non fanno venir meno gli obblighi in corso (offerte vincolanti, emissioni dovute).

> **Nota per il legale:** penali e non aggiramento (`docs/punti-aperti.md`). Da validare: (a) importi (`penalties.lateIssuanceCents` = 25 €, `penalties.missedIssuanceCents` = 100 €, `penalties.circumventionCents` = 1.000 €; le specifiche 00, riga 146, chiedono una penale «superiore alla provvigione di una polizza»); (b) la procedura e il termine di contestazione di 10 giorni (`penalties.contestDays`), con decisione finale interna ad AstAx; (c) la riducibilità (art. 1384 c.c.); (d) l'applicazione delle penali ai richiedenti (broker), oggi non prevista dal codice; (e) il trattamento fiscale delle penali trattenute (commercialista).

## Art. 13 — Riservatezza

13.1 Gli Utenti professionali trattano come riservati i dati delle richieste, delle offerte e dei clienti, li usano solo per partecipare all'asta o per servire il proprio cliente e non li comunicano a terzi, salvo quanto necessario per calcolare il preventivo e per emettere sui sistemi della compagnia. L'obbligo dura anche dopo la cessazione del rapporto.

13.2 I dati personali sono trattati secondo l'Accordo sul trattamento dei dati.

## Art. 14 — Sospensione ed esclusione

14.1 AstAx può sospendere un'organizzazione o un utente, con comunicazione motivata, in caso di perdita dei requisiti, mancate emissioni ripetute, sospetto di aggiramento o di frode, violazione della busta chiusa o di queste condizioni. L'esclusione è decisa dall'amministratore.

## Art. 15 — Responsabilità e disponibilità del servizio

15.1 AstAx mette a disposizione la Piattaforma con la diligenza professionale. In caso di guasti che interessano un'asta il back office può prolungarne la chiusura, con motivo registrato. AstAx non risponde dei tempi dei portali delle compagnie.

15.2 L'organizzazione risponde verso AstAx e verso i clienti delle proprie offerte, dell'emissione e dell'operato dei propri utenti.

## Art. 16 — Modifiche

16.1 AstAx può modificare queste condizioni e i valori della Piattaforma (durate, termini, inviti, penali) con comunicazione agli utenti interessati. Le nuove condizioni si accettano al primo accesso successivo; i nuovi valori si applicano alle aste aperte dopo la modifica. [PREAVVISO] per le modifiche peggiorative degli importi delle penali.

## Art. 17 — Legge e foro

17.1 Si applica la legge italiana. Foro esclusivo: [FORO COMPETENTE].

## Art. 18 — Approvazione specifica

18.1 Ai sensi degli artt. 1341 e 1342 c.c. l'utente approva specificamente: art. 4.3 (divieti sulla busta chiusa); art. 6 (offerta vincolante, non ritirabile dopo la chiusura); art. 7.2 (rischio di cambio tariffa); art. 8.1 (termini di emissione); art. 11 (non aggiramento); art. 12 (penali, trattenute e procedura di contestazione); art. 14 (sospensione ed esclusione); art. 15 (limitazioni di responsabilità); art. 16 (modifiche); art. 17 (foro).

> **Nota per il legale:** modalità dell'approvazione specifica online (seconda spunta separata, o firma con firma qualificata / FEA dell'organizzazione: le specifiche 00 parlano di «firma digitale del pacchetto contrattuale» all'ingresso dell'agenzia). Oggi il codice registra l'accettazione con versione, data, ora e IP (LEG-01), senza una seconda accettazione separata.
