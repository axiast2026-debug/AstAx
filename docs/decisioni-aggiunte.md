# Decisioni aggiunte nel pacchetto

Le specifiche lasciavano aperti alcuni dettagli che il codice deve per forza decidere. Qui c'è la scelta fatta per ciascuno, perché Claude Code non la improvvisi e perché Dan possa cambiarla. Dove c'è un parametro, il valore si modifica dal pannello dell'amministratore senza toccare il codice.

## Chiarimenti sulle specifiche

| # | Tema | Decisione | Regola |
| --- | --- | --- | --- |
| 1 | Attestato di rischio | Nessun collegamento alla banca dati ANIA. Il cliente carica l'attestato, l'AI ne estrae classe CU, sinistri e scadenza, l'agenzia lo verifica sul portale della compagnia. Nelle specifiche «dati ANIA» significa «dati dell'attestato». | — |
| 2 | Nomi dei pacchetti | Base, Plus, Completo, come nella scheda 09. | — |
| 3 | Orari | Lunedì-venerdì 9-19, sabato 9-13, come nella scheda 09. | ASTA-02 |
| 4 | Utenza del sub-agente con più agenzie | Un solo accesso con più contesti (uno per agenzia) e il selettore in alto, come nella scheda del sub-agente. | VIS-06 |
| 5 | Pannello di back office | `apps/admin` in Next.js con gli stessi componenti di `packages/ui`, invece di React Admin o Refine: un solo modo di costruire le interfacce. | — |

## Tempi e garanzie

| # | Tema | Decisione | Regola | Parametro |
| --- | --- | --- | --- | --- |
| 6 | Garanzia minima | Data di chiusura prevista all'apertura + N giorni; un prolungamento non la sposta. Vale fino alle 23:59:59 di Roma. | GAR-01, GAR-02 | `guarantee.minValidityDaysOptions`, `guarantee.defaultMinValidityDays` |
| 7 | Ultimo momento per accettare | Il primo tra fine garanzia e decorrenza meno il termine di emissione. | GAR-04 | `issuance.deadlineWorkingHours` |
| 8 | Promemoria di chiusura alle agenzie | 60 minuti prima; a metà asta se l'asta dura 2 ore o meno. | ASTA-07 | `auction.closingReminderMinutes` |
| 9 | Promemoria di garanzia | Riferito all'offerta più conveniente ancora garantita. | GAR-05 | `guarantee.reminderDaysBefore` |
| 10 | Riconferme | Massimo 2 per richiesta; invitate le agenzie con un'offerta valida nell'ultimo giro; risposta anche al rialzo; nessuna risposta = «Deserta». Una richiesta scaduta senza azioni per 30 giorni si annulla da sola. | GAR-06, GAR-07 | `reconfirmation.maxPerRequest`, `reconfirmation.workingHours`, `requests.autoCancelExpiredDays` |

## Inviti e offerte

| # | Tema | Decisione | Regola | Parametro |
| --- | --- | --- | --- | --- |
| 11 | Selezione delle agenzie | Filtri, stato, capacità, orari di ricezione e validità massima garantibile; poi varietà di compagnie; poi rotazione. | ASTA-05 | `invitations.*` |
| 12 | Riapertura dell'asta deserta | Invita tutte le compatibili non ancora invitate, senza limite e senza rotazione; nessuna disponibile = «Deserta» subito. | ASTA-08 | `auction.desertedReopen.*` |
| 13 | Presa in carico | Scade alla chiusura; titolare e supervisore possono liberarla o riassegnarla. | OFF-03 | — |
| 14 | Una persona, più agenzie | Una sola offerta per persona fisica per giro d'asta, oltre a una per agenzia. | OFF-02 | — |
| 15 | Offerta vista dall'agenzia durante l'asta | Copia cifrata con chiave separata, decifrata solo per gli utenti autorizzati e registrata. | BC-04 | — |
| 16 | Controllo del PDF | Dopo la chiusura, mai prima. Non esclude da solo: segnala al back office, che decide finché il cliente non ha accettato. Le coperture dichiarate non conformi invece escludono subito. | OFF-06, OFF-09 | `documents.confidenceThreshold` |
| 17 | Libreria prodotti dell'agenzia | L'agenzia carica una volta, per ogni compagnia e prodotto, il set informativo (DIP, DIP aggiuntivo, condizioni). Nel modulo offerta sceglie il prodotto; al cliente arrivano quei documenti. | LEG-05 | — |
| 18 | Migliore offerta per compagnia | Calcolata tra le offerte ancora garantite dell'ultimo giro chiuso; se una compagnia non ne ha, si mostra la migliore scaduta in grigio. | PRES-02 | — |
| 18c | Ora di arrivo delle buste (Dan, 2026-10-22) | Durante l'asta il richiedente vede, oltre al conto alla rovescia e al numero di offerte, l'ora di arrivo di ogni busta nel diario dell'asta (proposta P2 del nuovo design). Solo l'ora: mai prezzo, compagnia o agenzia. Il conto alla rovescia segue le ore lavorative e l'ora del server. | VIS-03, ASTA-02 | — |
| 18b | Verifica automatica | L'obiettivo delle specifiche è l'80% di verifiche automatiche. Le richieste verdi si possono approvare da sole, ma il parametro resta spento durante il pilota: all'inizio il back office controlla tutto. | ASTA-01 | `verification.autoApproveGreen` |

## Pagamenti, fee e contabilità

| # | Tema | Decisione | Regola | Parametro |
| --- | --- | --- | --- | --- |
| 19 | Fee sui premi bassi | Solo per i privati. Il broker paga sempre 30 €. | FEE-02, FEE-03 | `fees.private.lowPremium.*`, `fees.broker.amountCents` |
| 20 | Supplemento AI | +5 € sul fee del privato, se ha usato il confronto su quella richiesta prima di acquistare, anche su un'offerta diversa da quella suggerita. | FEE-01 | `fees.private.aiSupplementCents` |
| 21 | Incasso | Un solo pagamento per il cliente, diviso dal fornitore: premio sul conto separato, fee sul conto operativo. Se il fornitore non divide, due addebiti nella stessa schermata. Da validare con legale e commercialista. | PAG-01 | — |
| 22 | Pagamento fallito | L'accettazione decade; il cliente può riprovare o scegliere un'altra offerta finché ci sono garanzie. La firma va rifatta se cambia l'offerta. | PAG-03 | — |
| 23 | Rimborsi | Prima dell'emissione: tutto, fee compreso. Dopo l'emissione: premio secondo le condizioni della compagnia; fee del cliente e dell'agenzia trattenuti; il premio rimborsato si recupera dalla rimessa successiva dell'agenzia. Da validare con il legale. | PAG-04 | `refunds.*` |
| 23b | Penali oltre la rimessa | Se la rimessa non basta a coprire penali o recuperi, il residuo passa alla successiva; una rimessa non è mai negativa. | EMI-05 | — |
| 24 | Fatture | Privato: una per polizza, all'emissione (così un rimborso prima dell'emissione non richiede note di credito). Agenzia: una per rimessa. Broker: una al mese, pagamento con bonifico a 30 giorni. | CONT-03 | `invoicing.*` |
| 25 | Quota di provvigione del broker | Prevista nel modello ma spenta (0%) finché il legale non valida lo schema a tre intermediari. Se attiva, si trattiene dalla rimessa dell'agenzia e si liquida al broker. | CONT-01, CONT-05 | `brokerCommission.*` |
| 26 | Cliente del broker | Non crea un account: riceve un link, conferma l'identità con un codice OTP e firma. Dal 2026-10-30 l'offerta la sceglie e la paga l'intermediario ([ADR 0027](adr/0027-acquisto-diretto-dell-intermediario.md)). Nessun confronto AI. | PRES-06 | — |

## Emissione e penali

| # | Tema | Decisione | Regola | Parametro |
| --- | --- | --- | --- | --- |
| 27 | Ritardo e mancata emissione | La penale di ritardo (25 €) si propone allo scadere del termine; se poi la polizza non viene emessa, la penale di mancata emissione (100 €) la sostituisce. | EMI-03, EMI-04 | `penalties.*` |
| 28 | Seconda offerta | La migliore offerta ancora garantita di un'altra agenzia; il cliente ha 24 ore per confermare. | EMI-04 | `secondOffer.customerConfirmHours` |
| 29 | Ciclo delle penali | Proposta, applicazione del supervisore, contestazione entro 10 giorni, decisione dell'amministratore, trattenuta in rimessa. | EMI-05 | `penalties.contestDays` |
| 30 | Sospensione automatica | Dopo 3 mancate emissioni in 6 mesi l'agenzia esce dagli inviti; l'amministratore conferma o revoca. | EMI-06 | `penalties.suspension.*` |
| 31 | Stato dell'offerta aggiuntivo | «Mancata emissione», per distinguere l'offerta vinta e non emessa. | EMI-04 | — |

## Classifica, codici e conservazione

| # | Tema | Decisione | Regola | Parametro |
| --- | --- | --- | --- | --- |
| 32 | Momento della classifica | Alla firma dell'accettazione, prima del pagamento; oppure all'annullamento senza accettazione, con la classifica dell'ultimo giro con offerte valide. Mai mentre è possibile una riconferma. | CLA-02 | — |
| 32b | Ordine a parità di invio | Per un'offerta modificata conta l'ora dell'ultima modifica, così nessuno «prenota» la precedenza con un prezzo provvisorio. | PRES-01 | — |
| 33 | «N su M» | M è il numero di offerte valide, non di agenzie invitate. | CLA-03 | — |
| 34 | Codici | Richiesta `AX-AAAA-NNNNNN`; fatture con serie per anno (P privati, A agenzie, B broker). | — | — |
| 35 | Conservazione | Richieste non concluse cancellate dopo 12 mesi; contratti e contabilità 10 anni, da validare con legale e DPO. | LEG-06 | `retention.*` |

## Scelte tecniche

| # | Tema | Decisione |
| --- | --- | --- |
| 36 | Autenticazione e permessi | Keycloak gestisce identità, password, secondo fattore e sessioni. I permessi (ruoli per organizzazione, contesti, abilitazioni) stanno nel database di AstAx e si controllano nell'API. |
| 37 | Accesso dei privati | Codice OTP via email o SMS con un autenticatore aggiuntivo di Keycloak. Se in fase 1 risulta troppo oneroso, Claude Code propone un'alternativa con un ADR prima di cambiarla. Dal 2026-10-23 l'email del codice ha anche un link che fa entrare con un tocco, con le stesse regole del codice (ADR 0019, domanda 28). |
| 38 | Cartelle in più | `packages/db` (schema Prisma e client, usato da API e worker) e `packages/config` (configurazioni condivise di TypeScript e lint). |
| 39 | Workflow | Un workflow Temporal per richiesta e uno per polizza (rinnovo, questionario). Nei payload solo identificativi. Temporal Cloud UE o installato in proprio: si decide in fase 8 con un ADR. |
| 40 | Tempo reale | WebSocket (Socket.IO con adattatore Redis) per contatori e cambi di stato. |
| 41 | Eventi di dominio | Ogni cambio di stato scrive un evento nella stessa transazione (tabella outbox); un dispatcher lo consegna a notifiche, cronologia e Temporal. |
