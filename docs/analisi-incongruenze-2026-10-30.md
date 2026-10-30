# Analisi delle incongruenze del portale (2026-10-30)

Richiesta di Dan: prima dei miglioramenti, trovare le incongruenze nelle funzioni e nelle differenze tra le utenze.

**Come è stata fatta.** Quattro controlli in parallelo sul codice e sui documenti:

1. permessi, menu e pagine;
2. le utenze che chiedono preventivi;
3. chi offre e il back office;
4. parametri, avvisi e testi.

In tutto 75 segnalazioni, che qui diventano 45 punti senza doppioni. I punti gravi li ho riletti io nel codice. Ogni punto ha la prova con file e riga nelle note dei controlli; qui c'è la sostanza.

Severità:
- **alta:** un utente non può fare quello che deve, può fare quello che non deve, oppure sono a rischio dati del cliente o denaro;
- **media:** comportamento confuso o diverso tra utenze senza un motivo;
- **bassa:** testi e documenti.

## 1. Errori corretti subito

Sono errori nel lavoro dei giorni scorsi (acquisto diretto, IBAN, dati ANIA per l'agenzia), già approvato. Li ho corretti con le prove automatiche.

| # | Problema | Correzione |
| --- | --- | --- |
| 1 | Link di firma del cliente: il cliente non riusciva ad aprire i documenti da firmare. Inoltre non avrebbe ricevuto l'email della polizza emessa, e la firma risultava fatta dall'intermediario. | L'acquisto viene collegato al link inviato. Nel database l'acquisto può ora avere i due autori, l'intermediario e il link del cliente (migrazione `20261102100000_intermediary_purchase_link`). |
| 2 | Firma rifiutata o scaduta: non si poteva più firmare, anche con un nuovo link. | Un nuovo link crea una nuova richiesta di firma con gli stessi documenti. |
| 3 | Alla scadenza della garanzia, il sistema annullava anche l'offerta già pagata dall'intermediario e segnava la richiesta come «Scaduta». | L'offerta pagata non scade più; la richiesta aspetta la firma del cliente. |
| 4 | Il database della demo teneva il vecchio testo dell'email del link (con «garanzia» e «paghi»): l'email al cliente non sarebbe partita. | A ogni aggiornamento i testi degli avvisi cambiati nel file vengono aggiornati. Quelli modificati dall'amministratore restano come sono. |
| 5 | **Qualunque utente di un'agenzia, anche un dipendente, poteva sostituire l'IBAN dell'agenzia in qualsiasi momento**, e quindi deviare le rimesse. | L'IBAN si inserisce solo la prima volta; dopo si rifiuta (`IBAN_ALREADY_SET`). |
| 6 | La pagina della richiesta per l'agenzia riceveva ancora, senza mostrarli, la data di lettura ANIA e gli avvisi sulla scadenza della copertura. | Non vengono più inviati. |

## 2. Decisioni per Dan

| # | Domanda | Proposta |
| --- | --- | --- |
| D1 | **Firma del cliente dopo la decorrenza.** Se il cliente firma tardi, il termine di emissione è già passato e l'agenzia risulta subito in ritardo (penale e «mancata emissione»). | Spostare la decorrenza al giorno della firma, come hai deciso per la decorrenza passata alle verifiche. |
| D2 | **Seconda offerta o nuovo prezzo (EMI-04) negli acquisti degli intermediari.** Oggi può confermare solo il privato: per gli intermediari la proposta scade sempre e si va al rimborso. | Conferma l'intermediario dalla sua richiesta: paga lui la differenza o riceve il rimborso. |
| D3 | **Filtri personali del dipendente dell'agenzia.** Oggi limitano anche l'elenco «Partecipa all'asta»: chi non ha filtri non vede niente. Con l'ADR 0024 i filtri decidono solo le email. | Elenco completo per tutti; i filtri decidono solo le email. |
| D4 | **Fee dell'agenzia che chiede preventivi.** Oggi paga 30 € come il broker (ADR 0015). I 15 € dell'agenzia sono il compenso dell'agenzia che vince. | Confermare 30 €. |
| D5 | **Consenso del cliente e testi legali.** Dicono «agenzie invitate» o «fino a 8», ma ora tutte le agenzie attive vedono codice fiscale, indirizzo e documenti. | Nuovo testo come bozza «[DA VALIDARE — LEGALE]» e domanda al legale. |
| D6 | **Rabbocco** (agenzie aggiunte a metà asta). Con le aste aperte a tutti non serve più, ma gira ancora. | Toglierlo, con i suoi parametri. |
| D7 | **«Flotte»** è solo nel menu del broker, e comunque è «In arrivo». | Darla anche alle agenzie quando verrà fatta. |
| D8 | **Cliente che non firma mai:** il rimborso all'intermediario. | Pulsante «Chiedi rimborso» per il back office (vedi A4), più la domanda al legale già in `punti-aperti.md`. |

## 3. Problemi gravi (alta)

| # | Problema | Utenze |
| --- | --- | --- |
| A1 | Un **dipendente del broker vede tutte le polizze del broker**, non solo quelle dei suoi clienti (VIS-13). Le richieste e i rinnovi sono invece già limitati. | Dipendenti dei broker |
| A2 | **Invito nel team a chi ha già un account:** il link dell'email porta a una pagina che non esiste, quindi l'invito non si può accettare. | Titolari e invitati |
| A3 | **Il titolare non può cambiare dati, IBAN o mandati** dell'agenzia: non c'è nessuna pagina per farlo. Il broker ha la voce «Impostazioni», ma dà errore. | Titolari, sez. E |
| A4 | **Rimborsi a mano:** il back office non ha un pulsante per chiederli. Serve quando il cliente non firma. | Back office |
| A5 | **L'amministratore non può esportare i reclami per IVASS:** la pagina «Report» lo manda a una pagina che non può usare. | Amministratore |
| A6 | La **pagina pubblica «Per le agenzie»** chiede ancora RC professionale e IBAN all'ingresso. | Pubblico |
| A7 | Nel back office, l'**anteprima delle agenzie** dice che senza agenzie compatibili la richiesta «diventerebbe subito deserta». In realtà l'asta si apre comunque. | Back office |
| A8 | **Schermate dell'intermediario:** durante l'asta e nella tabella «Da fare» dicono ancora «Manda al cliente» e «Il cliente firma e paga». L'acquisto pagato senza link di firma non compare tra le cose da fare. | Tutti gli intermediari |

## 4. Differenze tra utenze (media)

**Chi chiede preventivi**

- B1. Le agenzie (e i sub-agenti) che chiedono preventivi non hanno l'elenco delle polizze dei loro clienti; i broker sì. L'avviso «polizza emessa» le porta alla lista sbagliata.
- B2. Il dipendente dell'agenzia non ha «Rinnovi»; il dipendente del broker sì.
- B3. «Vede tutti i clienti» si può dare solo ai dipendenti del broker, non a quelli dell'agenzia.
- B4. Contabilità dell'agenzia che chiede preventivi: le fatture si vedono due volte. Il supervisore con «contabilità» non vede l'estratto da richiedente.
- B5. Gli avvisi di una richiesta arrivano solo a chi l'ha creata, non al titolare. Se quel dipendente è sospeso, non li riceve nessuno.

**Chi offre**

- C1. Il sub-agente (sez. E) non arriva al suo registro accessi: il collegamento è solo nella pagina «Team», che lui non ha.
- C2. Il supervisore gestisce i prodotti, ma non ha la voce «Agenzia» nel menu.
- C3. Il dipendente che può emettere non ha la voce «Polizze emesse». L'avviso «offerta vinta» manda a «Da emettere» anche chi non può aprirla.
- C4. Il dipendente può fare «Rinuncia» anche se un collega ha preso in carico l'asta, e la rinuncia vale per tutta l'agenzia.
- C5. Il dipendente che non vede le offerte dei colleghi produce falsi «accessi negati» nel registro e vede un modulo «Modifica offerta» che non funziona.
- C6. Nelle metriche, «Inviti ricevuti» conta anche le aste solo aperte.
- C7. La pagina «Team» chiede il «Numero RUI sez. E» per ogni dipendente, e per i testi legali tutti i dipendenti risultano «sub-agenti».

**Back office**

- E1. Alcuni pulsanti si vedono anche da ruoli che non possono usarli, e premendoli si ottiene un errore:
  - Aste: Prolunga, Invita, Annulla;
  - Pagamenti: Approva e Rifiuta rimborso;
  - Eccezioni: Applica e Annulla penale;
  - Verifiche: le decisioni, con l'amministratore trattato come supervisore.
- E2. «Portale ANIA» dà errore a chi non fa le verifiche.
- E3. Mancano: annullare una richiesta, proporre una penale, gestire i recessi per l'Assistenza (oggi i recessi sono spenti).
- E4. La specifica del back office e il codice danno accessi diversi ad alcuni ruoli. Le sospensioni automatiche le conferma anche il supervisore, non solo l'amministratore.

## 5. Acquisto diretto: cosa resta da completare

- F1. **Avvisi:**
  - l'intermediario non riceve niente quando il pagamento è confermato, e quando il cliente firma riceve «Pagamento ricevuto… compenso 0,00 €»;
  - il cliente riceve «abbiamo ricevuto il pagamento» anche se non ha pagato;
  - nessun avviso se il cliente rifiuta o se il link scade;
  - nessun promemoria al cliente.
- F2. Correzione dei contatti del cliente dopo l'invio.
- F3. Nella procedura della richiesta dell'intermediario c'è ancora «termine di emissione dal pagamento»: per gli intermediari ora conta la firma del cliente.

## 6. Parametri e avvisi

- G1. **Parametri che nessuno legge** (cambiarli non ha effetto):
  - rimborsi prima e dopo l'emissione;
  - anni di conservazione dei contratti;
  - fuso orario;
  - promemoria della RC professionale.
- G2. «Agenzie invitate al massimo per asta» ora vale solo per gli inviti a mano del back office.
- G3. **Avvisi mai inviati:** la nuova segnalazione al back office dal questionario; la scadenza della RC professionale.
- G4. **Testi di avvisi superati:** «sospesa dagli inviti», «RC professionale», «accettato e pagato», «invitato altre agenzie», «filtri più ampi».
- G5. **Etichette mancanti:** 24 dei 36 eventi della cronologia della richiesta nel back office non hanno un testo; manca anche un'azione del registro accessi dell'agenzia.

## 7. Testi e documenti (bassa)

- H1. **Pagine pubbliche:**
  - «solo richieste nei vostri filtri»;
  - «collaboratori di sezione E» invece di «sub-agenti»;
  - contatti «dopo il pagamento», mentre per gli intermediari valgono dopo la firma.
- H2. Molte chiavi di testo inutilizzate, soprattutto della vecchia procedura della richiesta.
- H3. **Documenti da allineare** agli ADR 0024, 0026 e 0027:
  - regole di dominio (VIS-02, VIS-06, PAG-01/02, EMI-01, EMI-04);
  - specifiche 00, 02, 04, 05, 06, 07 e 09;
  - `permessi.md`, glossario e `notifiche.md`;
  - scenari S02, S09 e S10;
  - bozze legali;
  - `CLAUDE.md`.

## 8. Piano di correzione proposto

1. **Sicurezza e dati:** A1 (polizze del broker), D5 (consenso), A2 (inviti), A3 (impostazioni del titolare, con l'IBAN cambiato solo dal titolare e con codice), A4 (rimborsi a mano).
2. **Funzioni e utenze:**
   - menu e pulsanti giusti per ogni ruolo (B2, C1-C5, E1-E2);
   - polizze dei clienti per le agenzie richiedenti (B1);
   - D1, D2 e D3 secondo le decisioni;
   - avvisi e «Da fare» dell'acquisto diretto (A8, F1-F3);
   - A5, A7 ed E3.
3. **Pulizia:**
   - parametri e avvisi inutili, e il rabbocco (D6);
   - etichette mancanti;
   - testi pubblici (A6, H1);
   - documenti (H3).

Ogni passo ha le sue prove, e va in demo appena è pronto.
