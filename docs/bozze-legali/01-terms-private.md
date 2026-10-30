# Condizioni d'uso per i privati

**Bozza n. 1 del 22/10/2026 — [DA VALIDARE — LEGALE]**

| | |
| --- | --- |
| Chiave del documento | `terms-private` |
| Chi lo accetta | Il privato (consumatore) |
| Quando | Alla registrazione; di nuovo a ogni nuova versione, al primo accesso successivo (LEG-02) |
| Fonti | `CLAUDE.md`; `docs/specifiche/00`, `01`, `03`, `09` (§1, §5, §7); `docs/regole-di-dominio.md` (ASTA, BC, VIS, OFF, GAR, PRES, FEE, PAG, EMI, LEG); `docs/decisioni-aggiunte.md`; `docs/piano-flusso-semplificato.md`; `docs/piano-decorrenza.md` (tramite domanda 1); `docs/domande-aperte.md` (1, 2, 12, 18); `docs/punti-aperti.md`; `seed/parametri.json` |

> Convenzioni della bozza. [MAIUSCOLO] = dato che AstAx deve ancora fornire. Ogni numero (durate, compensi, termini) viene dai parametri in vigore della piattaforma: il testo indica il valore di oggi e la piattaforma mostra sempre quello applicato alla singola richiesta. «Nota per il legale» = punto da decidere, non testo destinato al cliente.

---

## Art. 1 — Chi siamo

1.1 La piattaforma AstAx (di seguito «Piattaforma») è gestita da [RAGIONE SOCIALE], con sede legale in [SEDE LEGALE], partita IVA [P.IVA], iscritta al Registro Unico degli Intermediari assicurativi e riassicurativi (RUI) tenuto dall'IVASS, sezione B (broker), con il numero [NUMERO RUI] del [DATA ISCRIZIONE RUI] (di seguito «AstAx»). PEC: [PEC]. Assistenza: [EMAIL ASSISTENZA].

1.2 AstAx è un intermediario assicurativo, non un'impresa di assicurazione: non assume rischi e non emette polizze. La polizza è emessa da un'agenzia assicurativa iscritta nella sezione A del RUI, con una delle compagnie che le hanno conferito mandato, in collaborazione con AstAx.

1.3 Le presenti condizioni regolano l'uso della Piattaforma da parte del privato (di seguito «Cliente»). Sono integrate, al momento della scelta di un'offerta, dalla Lettera di incarico ad AstAx, dall'Informativa precontrattuale (MUP), dalle Condizioni del servizio di firma FEA e dalla documentazione del prodotto assicurativo (DIP, DIP aggiuntivo, condizioni di assicurazione).

## Art. 2 — Il servizio in breve

2.1 Il Cliente chiede un preventivo di assicurazione RC auto. AstAx verifica la richiesta e la mette all'asta tra agenzie assicurative selezionate, con il sistema della **busta chiusa**: ogni agenzia fa una sola offerta, che nessuno può leggere prima della chiusura dell'asta. Alla chiusura il Cliente vede le offerte, sceglie liberamente quella che preferisce, firma con firma elettronica avanzata (FEA), paga AstAx e riceve la polizza dall'agenzia che ha fatto l'offerta scelta.

2.2 La richiesta di preventivo e la partecipazione all'asta sono gratuite. Il Cliente paga ad AstAx un compenso solo se acquista una polizza (art. 8).

2.3 L'interfaccia, i documenti e l'assistenza sono solo in lingua italiana.

## Art. 3 — Registrazione e accesso

3.1 Per usare la Piattaforma il Cliente si registra con nome, cognome, numero di telefono e indirizzo email. Il Cliente dichiara di essere maggiorenne e di agire per scopi estranei all'attività imprenditoriale o professionale eventualmente svolta.

3.2 L'accesso avviene senza password, con un codice monouso (OTP) inviato via email o SMS, oppure con il collegamento ricevuto via email. Il codice vale per il tempo indicato dalla Piattaforma (oggi 10 minuti) e il numero di tentativi è limitato.

3.3 Il Cliente resta collegato sul proprio dispositivo finché usa la Piattaforma; dopo un periodo senza utilizzo (oggi 30 giorni) e comunque dopo il periodo massimo stabilito (oggi 365 giorni) deve accedere di nuovo con un nuovo codice. Dal profilo il Cliente vede i dispositivi collegati e può disconnetterli.

3.4 Il Cliente custodisce il proprio telefono e la propria casella email e avvisa subito AstAx se sospetta un uso non autorizzato. La modifica di email e telefono richiede un codice di conferma.

## Art. 4 — La richiesta di preventivo

4.1 Il Cliente indica: se il veicolo è già assicurato o nuovo da assicurare; la targa; la data di nascita del proprietario; la residenza; per un veicolo nuovo, da dove si ricava la classe di merito (veicolo proprio venduto, demolito o rottamato; veicolo di un familiare convivente; prima polizza); il tipo di guida (libera, esperta, esclusiva); le garanzie; la decorrenza. Carica inoltre le foto dei documenti richiesti (per esempio libretto di circolazione, documento d'identità, attestato di rischio).

4.2 Garanzie. Il Cliente sceglie tra:
- **«Consigliato»**: responsabilità civile auto con i massimali minimi di legge, assistenza stradale, infortuni del conducente e tutela legale;
- **«Su misura»**: le garanzie scelte una per una.

Capitali assicurati, valore del veicolo, scoperti e franchigie li propone l'agenzia nell'offerta. Le offerte devono comprendere almeno le garanzie richieste, con coperture uguali o migliori; un'offerta che dichiara coperture inferiori è esclusa.

4.3 Decorrenza. Il Cliente sceglie una data futura, oppure la decorrenza «immediata dal pagamento», oppure «dalle 24:00 del giorno del pagamento». Non è possibile una decorrenza retroattiva. Con le decorrenze «immediata» e «dalle 24:00» la copertura inizia comunque solo con l'emissione della polizza nei tempi dell'art. 9.

4.4 Lettura automatica e verifica. Un sistema di lettura automatica dei documenti, basato su intelligenza artificiale, controlla subito se le foto sono leggibili ed estrae i dati. Il personale di AstAx (di seguito «back office») controlla e completa i dati prima dell'asta e può chiedere al Cliente un'integrazione dalla Piattaforma o contattarlo per telefono. Il Cliente risponde della veridicità dei dati e dei documenti forniti e delle proprie dichiarazioni (per esempio l'età dei conducenti per la guida esperta).

4.5 Casi esclusi. Non possono andare all'asta, tra gli altri: veicoli d'epoca o storici; veicoli con targa estera o temporanea; veicoli a noleggio, taxi, NCC, scuola guida o trasporto merci per conto terzi; flotte. L'elenco aggiornato è nella Piattaforma. Se la richiesta rientra in un caso escluso, AstAx lo comunica al Cliente e la richiesta non prosegue.

4.6 Contraente diverso dal Cliente. Il Cliente può chiedere un preventivo indicando come contraente un'altra persona (per esempio il coniuge), dichiarando di averne il consenso e di averle fornito l'informativa privacy di AstAx.

> **Nota per il legale:** il Cliente che chiede un preventivo per un'altra persona (domanda 12, `docs/punti-aperti.md`, «DPO e privacy»). Oggi il codice registra solo il consenso del privato che usa l'account, confermato con il codice; il contraente non riceve nulla. Va deciso se basta questa dichiarazione o se servono informativa e consenso del contraente, e chi firma incarico e documenti precontrattuali quando il contraente non è chi usa l'account.

## Art. 5 — L'asta

5.1 L'asta si apre solo dopo l'approvazione del back office. La sua durata si conta in **ore lavorative**: lunedì-venerdì dalle 9 alle 19 e sabato dalle 9 alle 13, ora italiana, esclusi i festivi nazionali. Il tempo fuori orario non conta. Le durate possibili sono quelle in vigore (oggi 1, 2, 5 o 24 ore lavorative; durata predefinita 2 ore). La Piattaforma comunica al Cliente l'ora prevista di chiusura.

> **Nota per il legale:** `CLAUDE.md` (riga 9) dice che la durata dell'asta la sceglie il richiedente, ma con il flusso semplificato (`docs/piano-flusso-semplificato.md`, schermate 1-5) e per il broker (`docs/piano-broker.md`, riga 87) durata e validità minima del prezzo sono quelle predefinite dei parametri. Il testo è scritto in modo neutro («le durate in vigore»): va confermato con Dan se il Cliente sceglie ancora la durata e la validità minima.

5.2 L'asta è aperta a tutte le agenzie attive su AstAx con un mandato utile per la richiesta: ognuna vede la richiesta e può fare un'offerta; AstAx avvisa per email le agenzie i cui filtri corrispondono alla richiesta. Il Cliente non sceglie le agenzie.

5.3 **Busta chiusa.** Prima della chiusura nessuno può leggere il contenuto delle offerte: né le altre agenzie, né il Cliente, né il personale o gli amministratori di AstAx. Le offerte sono cifrate all'arrivo e si aprono solo alla chiusura, in modo automatico.

5.4 Durante l'asta il Cliente vede il conto alla rovescia, il numero di offerte arrivate e l'ora di arrivo di ciascuna, mai prezzi, compagnie o agenzie.

5.5 Se l'asta si chiude senza offerte valide, la Piattaforma la riapre automaticamente una volta (oggi per 2 ore lavorative), invitando altre agenzie compatibili. Se resta senza offerte, la richiesta si chiude come «deserta» e il Cliente riceve un avviso.

5.6 Per motivi tecnici o di sicurezza il back office può prolungare la chiusura o annullare l'asta, sempre con un motivo registrato; il Cliente viene avvisato.

## Art. 6 — Le offerte

6.1 Ogni offerta è **vincolante** per l'agenzia che la fa e indica una data di **prezzo garantito**: fino alle 23:59:59 (ora italiana) di quella data il Cliente può accettarla al prezzo indicato, anche se nel frattempo la compagnia ha cambiato le tariffe. La garanzia vale a condizione che la decorrenza e i dati usati per il preventivo (conducenti, residenza, veicolo, sinistri) non cambino.

6.2 La data di prezzo garantito non può essere anteriore alla validità minima stabilita per la richiesta (oggi, di regola, 15 giorni di calendario dalla chiusura prevista dell'asta).

6.3 Alla chiusura il Cliente vede, per ogni compagnia, la migliore offerta ancora garantita, in ordine di premio. Per ogni offerta vede compagnia, prodotto, garanzie, franchigie e scoperti, premio lordo annuo (imposte e contributo al Servizio Sanitario Nazionale inclusi), data di prezzo garantito, giorni rimasti e preventivo in PDF. Il nome dell'agenzia compare solo dopo l'accettazione. L'offerta più conveniente porta l'etichetta «Più conveniente»; se il Cliente ha indicato il premio attuale, la Piattaforma mostra la differenza. A parità di premio precede l'offerta con la garanzia più lunga e poi quella arrivata prima.

6.4 Due giorni prima che scada la garanzia dell'offerta più conveniente il Cliente riceve un promemoria.

6.5 **Confronto con AI (facoltativo).** Il Cliente può chiedere, con il pulsante «Confronta con AI», un confronto qualità/prezzo tra le offerte mostrate e ancora garantite. Il punteggio è calcolato con criteri fissi e pesi stabiliti da AstAx (prezzo, coperture oltre quelle richieste, indice dei reclami della compagnia, tempi di emissione dell'agenzia sulla Piattaforma); un modello di intelligenza artificiale scrive la spiegazione partendo da quei dati. Il suggerimento è identificato come «Suggerimento generato con AI». Il confronto non è mai attivato in automatico: prima di usarlo il Cliente vede l'aumento del compenso (art. 8) e lo conferma. La scelta dell'offerta resta libera.

> **Nota per il legale:** confronto AI e consulenza IDD (`docs/punti-aperti.md`). Va deciso se il suggerimento è «consulenza» ai sensi del CAP (Titolo IX) e del Reg. IVASS 40/2018, con i relativi obblighi (raccomandazione personalizzata, motivazione, responsabilità di AstAx). Oggi il codice salva ogni suggerimento con pesi, dati usati, punteggi, modello, versione del prompt e testo mostrato (PRES-08). Il testo dell'art. 6.5 lo descrive come confronto su criteri oggettivi, senza qualificarlo.

6.6 Se tutte le garanzie scadono senza accettazione, la richiesta diventa «scaduta». Il Cliente può chiedere alle stesse agenzie di riconfermare o aggiornare il prezzo, al massimo per il numero di volte stabilito (oggi 2); le agenzie rispondono entro il tempo previsto (oggi 24 ore lavorative), anche con un prezzo più alto, sempre a busta chiusa. Una richiesta scaduta senza azioni si annulla da sola dopo il periodo stabilito (oggi 30 giorni).

## Art. 7 — Accettazione, firma e pagamento

7.1 Il Cliente può accettare un'offerta finché è garantita e, se ha scelto una data di decorrenza, finché resta il tempo per emetterla prima della decorrenza (art. 9).

7.2 L'accettazione comprende: il riepilogo dell'offerta con premio e compenso di AstAx; la presa visione dell'Informativa precontrattuale (MUP) e della documentazione del prodotto; la firma con FEA della Lettera di incarico ad AstAx; il pagamento.

7.3 Il Cliente paga ad AstAx, tramite [FORNITORE PAGAMENTI], con carta o bonifico istantaneo (e con gli altri strumenti che la Piattaforma rende disponibili), il premio della polizza e il compenso di AstAx. Il premio è versato sul conto separato di AstAx previsto dall'art. 117 del d.lgs. 209/2005 (Codice delle Assicurazioni Private, «CAP»). AstAx non conserva i dati della carta.

> **Nota per il legale:** effetto liberatorio del pagamento ad AstAx (art. 118 CAP; `docs/punti-aperti.md`). Il testo non dice ancora se il pagamento ad AstAx libera il Cliente verso la compagnia. Oggi il Cliente paga AstAx e il premio va sul conto separato; la frase va completata quando lo schema con l'agenzia emittente e le compagnie sarà definito.

7.4 Se il pagamento non riesce o viene abbandonato, l'accettazione decade: il Cliente può riprovare o scegliere un'altra offerta ancora garantita. Se cambia offerta, deve firmare di nuovo.

7.5 Con il pagamento confermato l'agenzia scelta riceve, oltre ai dati del preventivo, il telefono e l'email del Cliente, che prima non le sono mai comunicati.

## Art. 8 — Il compenso di AstAx

8.1 Il Cliente paga ad AstAx un compenso fisso **solo se acquista** una polizza. Il compenso è quello in vigore all'apertura dell'asta ed è sempre indicato prima della firma. Oggi è:

| Premio lordo dell'offerta acquistata | Senza confronto AI | Con confronto AI |
| --- | --- | --- |
| Oltre 200,00 € | 30 € | 35 € |
| Fino a 200,00 € compresi | 15 € | 20 € |

8.2 Il supplemento per il confronto AI è dovuto se il Cliente ha usato il confronto su quella richiesta in qualunque momento prima dell'acquisto, anche se poi sceglie un'offerta diversa da quella suggerita.

8.3 Il compenso è un compenso di intermediazione assicurativa esente da IVA (art. 10, comma 1, n. 9, DPR 633/1972) ed è fatturato a parte, con una fattura per polizza all'emissione. Le eventuali imposte di bollo sono indicate in fattura.

> **Nota per il legale:** esenzione IVA di tutti i compensi, compreso quello con il supplemento per il confronto AI (`docs/punti-aperti.md`, «Commercialista e amministrazione»; specifiche 00, «Modello economico»: il compenso con il confronto AI va descritto come parte del servizio di intermediazione). Da confermare con il commercialista, insieme all'imposta di bollo (oggi 2 € sopra 77,47 €, a carico del destinatario: `invoicing.stampDuty.*`).

## Art. 9 — Emissione della polizza

9.1 L'agenzia emette la polizza entro il termine in vigore (oggi 4 ore lavorative dalla conferma del pagamento, contate dal lunedì al venerdì dalle 9 alle 19, esclusi i festivi) e comunque prima della data di decorrenza scelta. Con la decorrenza «immediata» la copertura inizia dal momento dell'emissione; con «dalle 24:00» dalle 24:00 del giorno in cui cade il termine di emissione.

9.2 Polizza, quietanza e certificato sono messi a disposizione nell'area del Cliente, che riceve un avviso. Per sinistri e assistenza sulla polizza il Cliente si rivolge all'agenzia emittente, i cui contatti sono nella Piattaforma.

9.3 Se l'agenzia non emette per causa propria, AstAx propone al Cliente la migliore offerta ancora garantita di un'altra agenzia: il Cliente la conferma entro il tempo indicato (oggi 24 ore), pagando o ricevendo la differenza, oppure riceve il rimborso integrale.

9.4 Se l'emissione non è possibile perché i dati forniti dal Cliente non sono corretti, l'agenzia ricalcola il premio: il Cliente accetta il nuovo prezzo oppure riceve il rimborso.

## Art. 10 — Annullamento, recesso e rimborsi

10.1 Il Cliente può annullare la richiesta in qualunque momento prima dell'accettazione, senza costi.

10.2 Prima dell'emissione della polizza ogni rimborso è integrale, compenso di AstAx compreso.

10.3 Dopo l'emissione, recesso, annullamento e altre operazioni sulla polizza si chiedono all'agenzia emittente o alla compagnia, secondo le condizioni di assicurazione, e non tramite la Piattaforma. Il compenso di AstAx resta dovuto, perché il servizio di intermediazione è stato interamente eseguito.

> **Nota per il legale:** vendita a distanza e recesso (`docs/punti-aperti.md`, «Vendita a distanza» e «Regole di rimborso del fee»). Da decidere: (a) i termini e le modalità del recesso del consumatore dal contratto di assicurazione concluso a distanza e dal servizio di AstAx (artt. 67-bis e seguenti del d.lgs. 206/2005, «Codice del Consumo»; il parametro `withdrawal.days` vale oggi 14 giorni «dall'emissione», da validare); (b) se è legittimo trattenere il compenso dopo l'emissione (`refunds.afterIssuance` = premio secondo le condizioni della compagnia, compenso trattenuto; PAG-04); (c) se è ammesso che il recesso non passi dalla Piattaforma (domanda 18: `withdrawal.onPlatform` spento) e come si coordina con l'eventuale obbligo di una funzione di recesso online introdotto dalla direttiva (UE) 2023/2673, da verificare nel recepimento italiano. Nota collegata: `docs/specifiche/03-utenza-privato.md` (riga 51) prevede ancora il pulsante «Richiesta di recesso» nell'area del Cliente.

10.4 I rimborsi sono eseguiti da AstAx con lo stesso strumento di pagamento, dopo l'approvazione interna prevista.

## Art. 11 — Obblighi del Cliente

11.1 Il Cliente si impegna a: fornire dati e documenti veri, completi e aggiornati; comunicare subito ogni variazione prima dell'emissione; non usare la Piattaforma per conto di terzi senza titolo o per scopi diversi dalla richiesta di un preventivo per sé o per il contraente indicato; non tentare di accedere a dati di altri utenti o alle offerte prima della chiusura.

11.2 AstAx può sospendere o chiudere l'account in caso di violazione grave, di sospetta frode (per esempio documenti alterati o residenze di comodo) o di uso abusivo, dandone comunicazione motivata al Cliente.

## Art. 12 — Rinnovo

12.1 Prima della scadenza della polizza (oggi 30 giorni prima) la Piattaforma propone al Cliente una nuova asta con i dati già salvati, alla quale è invitata anche l'agenzia che ha emesso la polizza in corso. La nuova asta parte solo se il Cliente lo chiede.

## Art. 13 — Assistenza e reclami

13.1 Il Cliente può chiedere assistenza dalla Piattaforma (chat o ticket) o a [EMAIL ASSISTENZA]; AstAx dà una prima risposta entro il termine indicato (oggi 24 ore).

13.2 Il Cliente può presentare un reclamo dalla Piattaforma, con il modulo dedicato, oppure per iscritto a [INDIRIZZO RECLAMI] / [PEC]. Il reclamo riceve un numero di protocollo e una risposta entro 45 giorni. Se non è soddisfatto della risposta, o non la riceve, il Cliente può rivolgersi all'IVASS, Servizio Tutela degli Utenti, [INDIRIZZO IVASS], secondo le modalità indicate nell'Informativa precontrattuale, e ai sistemi alternativi di risoluzione delle controversie previsti dalla legge.

> **Nota per il legale:** indicare quali sistemi di risoluzione alternativa delle controversie si applicano (per esempio l'Arbitro Assicurativo, se operativo, e la mediazione) e con quali riferimenti. Le fonti di AstAx non ne parlano; il codice gestisce solo il registro reclami con risposta a 45 giorni (`complaints.responseDays`).

## Art. 14 — Dati personali

14.1 I dati sono trattati secondo l'Informativa privacy, che il Cliente legge prima di inviare la richiesta. Le agenzie invitate ricevono i dati utili al preventivo, mai telefono ed email; ogni loro accesso ai dati e ai documenti è registrato e i documenti che vedono portano una filigrana con il loro nome.

## Art. 15 — Responsabilità di AstAx

15.1 AstAx risponde dell'esecuzione del servizio di intermediazione secondo la legge. AstAx non risponde delle decisioni della compagnia sull'assunzione del rischio dopo l'emissione, né della gestione dei sinistri, che spetta alla compagnia.

15.2 AstAx dispone di una polizza di responsabilità civile professionale come richiesto dal CAP per l'iscrizione in sezione B: [COMPAGNIA RC PROFESSIONALE], massimali [MASSIMALE RC PROFESSIONALE].

15.3 AstAx fa il possibile per garantire la continuità del servizio. In caso di guasti che interessano un'asta, il back office può prolungarne la chiusura (art. 5.6). Nulla in queste condizioni limita i diritti che la legge riconosce al consumatore.

## Art. 16 — Modifiche delle condizioni

16.1 AstAx può modificare queste condizioni per motivi legali, tecnici o organizzativi. La nuova versione è comunicata al Cliente, che la accetta al primo accesso successivo per continuare a usare la Piattaforma. Le modifiche dei valori (durate, compensi, termini) valgono solo per le aste aperte dopo la modifica.

16.2 Ogni accettazione è registrata con versione, data, ora e indirizzo IP. Il Cliente trova nel profilo le versioni accettate e può scaricarle.

## Art. 17 — Legge applicabile e foro

17.1 Si applica la legge italiana. Per ogni controversia è competente il foro del luogo di residenza o di domicilio del Cliente consumatore.

> **Nota per il legale:** coerenza con le pagine pubbliche (`docs/punti-aperti.md`, «Testi delle pagine pubbliche» e «Numeri e risparmio nella home pubblica»). Frasi come «nemmeno AstAx vede i prezzi», «non paghi nulla», «compenso di intermediazione esente IVA», «solo l'agenzia che scegli riceve il telefono» e il «risparmio medio» devono essere coerenti con queste condizioni. Oggi i testi pubblici sono in `apps/web/messages/it.json` e i dati della home sono spenti (`home.publicData.enabled` = false) fino al parere.
