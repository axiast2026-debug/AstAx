# Piano: tre tipi di decorrenza (domanda 1)

**Stato:** da approvare da Dan. Niente codice cambiato finché Dan non approva.

## Cosa ha deciso Dan (2026-10-18)

Il cliente sceglie tra tre decorrenze:

1. **Data futura** (come oggi): la copertura parte alle 00:00 di quel giorno.
2. **Immediata dal pagamento**: la copertura parte nel momento in cui il pagamento è confermato.
3. **Dalle 24:00 del giorno del pagamento**: la copertura parte alla mezzanotte che chiude il giorno del pagamento (ora di Roma).

## Cosa cambia

| Area | Oggi | Con le tre scelte |
| --- | --- | --- |
| Richiesta (passo «Copertura») | Una data | Scelta del tipo; la data solo per il tipo 1 |
| Dati del preventivo (`quoteData.request`) | `startDate` | `startMode` (`DATE`, `ON_PAYMENT`, `END_OF_PAYMENT_DAY`) e `startDate` solo per `DATE` |
| Età, patente, anni del veicolo, controlli automatici | Calcolati alla data di decorrenza | Per i tipi 2 e 3: al giorno della richiesta (proposta C) |
| Filtri delle agenzie (`maxStartDateDays`) | Giorni fino alla decorrenza | Per i tipi 2 e 3: 0 giorni, sempre compatibili |
| GAR-04 (ultimo momento per accettare) | Decorrenza meno il termine di emissione | Per i tipi 2 e 3: basta la garanzia dell'offerta |
| EMI-01 (termine di emissione) | 4 ore lavorative dal pagamento, comunque prima della decorrenza | Per i tipi 2 e 3: vedi proposta A |
| EMI-04 (mancata emissione) | Nessuna emissione prima della decorrenza | Per i tipi 2 e 3: nessuna emissione entro il termine |
| Polizza | Scadenza un anno dopo la decorrenza | La decorrenza vera si fissa al pagamento; scadenza un anno dopo |
| Notifiche, pagine, PDF | «Decorrenza: 30/11/2026» | «Decorrenza: immediata dal pagamento» / «dalle 24:00 del giorno del pagamento», poi la data vera dopo il pagamento |

Le richieste già esistenti restano di tipo 1.

## Proposte da approvare

- **A. Termine di emissione per i tipi 2 e 3.** Le stesse 4 ore lavorative dal pagamento, senza il limite «prima della decorrenza», perché la copertura parte già al pagamento. Con la polizza l'agenzia rispetta la decorrenza scelta. Alternativa: un termine più breve, solo per questi tipi (un nuovo parametro).
- **B. Pagamento fuori orario.** Con il tipo 2 pagato sabato sera, l'agenzia emette lunedì mattina (ore lavorative), con decorrenza sabato. Alternativa: il tipo 2 si può pagare solo in orario lavorativo.
- **C. Date dei controlli.** Età, patente e anni del veicolo si calcolano al giorno della richiesta, e il back office li rivede se il pagamento arriva molto dopo. Alternativa: al giorno dell'accettazione.
- **D. Quando si sceglie.** Il tipo si sceglie nella richiesta e le agenzie lo vedono nell'asta, perché incide sul prezzo. Alternativa: il cliente lo sceglie all'accettazione.
- **E. Le agenzie.** Tutte le agenzie ricevono i tre tipi. Alternativa: un filtro in più, «accetto la decorrenza immediata».

## Passi

1. Dati, schemi e regole pure (GAR-04, EMI-01, EMI-04, età) con i test, citando i codici delle regole.
2. Richiesta e asta (form, dati per le agenzie, filtri).
3. Accettazione, pagamento, emissione, polizza (worker e API).
4. Pagine, notifiche e PDF; test E2E di uno scenario per tipo.
5. Aggiornamento di `docs/regole-di-dominio.md` (GAR-04, EMI-01, EMI-04) e degli scenari.
