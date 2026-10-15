# Fase 5 — Accettazione

**Obiettivo.** Il richiedente confronta le offerte, il privato può usare il confronto AI, sceglie, legge i documenti, firma e paga. Al pagamento l'agenzia vincitrice riceve i contatti e parte il termine di emissione.

**Si chiude quando:** lo scenario del privato è completo fino al pagamento.

## Prima di iniziare

- Fase 4 chiusa in `docs/stato.md`.
- Da leggere: `docs/specifiche/03-utenza-privato.md` (dettaglio di un preventivo, accettazione), `02-utenza-broker.md` (dettaglio richiesta), `00-panoramica-e-processi.md` (processi 3 e 4), `08-architettura-tecnica.md` (confronto AI), regole PRES, FEE, PAG-01…03, GAR-04, CLA-02, LEG-05, VIS-02, `docs/adattatori.md` (spiegazione AI, firma, pagamenti), `docs/decisioni-aggiunte.md` (19-22, 26, 32).
- Serve da Dan: nulla di bloccante. I testi legali restano segnaposto. I valori dell'indice reclami delle compagnie si inseriscono dal back office quando servono dati reali; nei test si usano valori inventati.

## Cosa comprende

- **Presentazione** (privato su mobile, broker su desktop): migliore offerta per compagnia dell'ultimo giro (PRES-02), ordinata per premio, «Più conveniente», risparmio sul premio attuale, «garantito fino al» con giorni rimasti, scadute in grigio, PDF; nessun nome di agenzia.
- **Fee:** funzione di dominio unica (FEE-01…03, FEE-06) usata da API e interfacce, con il dettaglio della regola applicata salvato nell'accettazione.
- **Confronto AI (solo privati):** finestra di conferma con il fee che cambia; punteggio di dominio con i pesi dai parametri (prezzo: rapporto con il premio più basso; coperture: miglioramenti dichiarati rispetto al pacchetto; reclami: indice della compagnia, neutro se manca; velocità di emissione: storico dell'agenzia, neutro se nuova); spiegazione dall'adattatore finto con controllo del testo e testo di riserva; `AiSuggestion` salvato; etichetta «Suggerimento generato con AI»; `aiComparisonUsed` sulla richiesta. Indice reclami: tabella `CompanyComplaintsIndex` con inserimento da back office.
- **Accettazione del privato in quattro passaggi:** riepilogo con premio e fee; documenti precontrattuali (MUP generata da modello con AstAx proponente, agenzia emittente, compagnia, compensi, modalità di pagamento; lettera di incarico; set informativo del prodotto dalla libreria); firma con l'adattatore finto; pagamento con l'adattatore finto (carta riuscita o rifiutata, bonifico istantaneo), premio e fee separati.
- **Canale broker:** «Invia al cliente» di una o più offerte; link con codice OTP (`CustomerLink`), valido fino alla scadenza della garanzia; il cliente legge, firma e paga il solo premio; niente confronto AI.
- **Classifica:** calcolata e pubblicata alla firma (CLA-02), con le notifiche `ranking.available` e `ranking.available.excluded`; la pagina «Risultati» delle agenzie arriva in fase 6.
- **Pagamento confermato (PAG-02):** stati, offerte «Non scelta», contatti all'agenzia vincitrice, termine di emissione nel workflow (EMI-01), elenco minimo «Da emettere» per l'agenzia; notifiche `payment.confirmed`, `offer.won`, `offer.won.bo`.
- **Pagamento fallito (PAG-03):** l'accettazione decade e si torna a «Offerte disponibili»; notifica `payment.failed`; la firma si rifà se il cliente cambia offerta.
- **Ultimo momento utile (GAR-04):** il pulsante di accettazione si disattiva con la spiegazione.
- **Webhook** di firma e pagamento idempotenti, con verifica della firma del fornitore (anche nel finto).

## Criteri di accettazione

- [ ] Lo scenario S01 passa fino al pagamento confermato: presentazione, confronto AI, scelta libera, firma, classifica pubblicata, pagamento di 555,00 €, contatti ad Agenzia Uno, termine alle 16:30.
- [ ] I test del fee coprono S09 e il caso limite di 200,00 € esatti.
- [ ] Il confronto AI risponde 403 a broker e link del cliente; il suggerimento salvato contiene pesi, dati usati, punteggi, modello, versione del prompt e testo; un testo che non supera il controllo viene sostituito da quello di riserva.
- [ ] Un pagamento rifiutato riporta la richiesta a «Offerte disponibili» e il cliente può riprovare; un webhook duplicato non produce effetti doppi.
- [ ] Il link al cliente del broker richiede il codice e scade con la garanzia; S02 passa fino al pagamento.
- [ ] I documenti firmati e le evidenze sono salvati; la MUP contiene le parti e i compensi giusti; fuori dalla produzione si vedono i segnaposto legali.
- [ ] GAR-04: dopo l'ultimo momento utile l'accettazione è rifiutata dall'API, non solo nascosta.
- [ ] I contatti del cliente arrivano all'agenzia vincitrice solo dopo la conferma del pagamento (test prima e dopo).

## Test richiesti

- Unità: fee, punteggio AI, migliore offerta per compagnia con garanzie scadute, ultimo momento utile.
- Integrazione: accettazione, firma, pagamento e webhook, link del broker, pubblicazione della classifica.
- End-to-end: S01 fino al pagamento, S02 fino al pagamento, pagamento rifiutato.

## Demo per Dan

Da telefono come Giulia Neri: confronto delle offerte, confronto AI con il fee che passa a 35 €, scelta, firma con il codice di sviluppo, pagamento con carta di prova. Da computer come Agenzia Uno: la richiesta compare in «Da emettere» con i contatti e il conto alla rovescia.
