# Piano: tre tipi di decorrenza (domanda 1)

**Stato:** risposte di Dan del 2026-10-18 qui sotto (A, nuova regola, A, A, A). Restano da chiarire i punti 6 e 7; il codice parte dopo.

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

Risposte di Dan (2026-10-18): A sì; B no, vedi «Nessuna decorrenza retroattiva»; C sì; D sì; E sì.

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

## Nessuna decorrenza retroattiva (Dan, 2026-10-18, risposta 2)

Se il cliente paga sabato o domenica, la prima decorrenza possibile cade entro le prime quattro ore lavorative di lunedì. La decorrenza non può mai essere precedente all'emissione. Quindi per il tipo 2 la decorrenza non è più «al pagamento» in senso letterale.

Da chiarire con Dan:

6. **Tipo 2, «immediata»:** la decorrenza è (A) il momento in cui l'agenzia emette, al massimo 4 ore lavorative dopo il pagamento, oppure (B) sempre la fine delle 4 ore lavorative dopo il pagamento, un orario fisso noto al pagamento?
7. **Tipo 3, «dalle 24:00 del giorno del pagamento»:** se le 4 ore lavorative finiscono dopo quella mezzanotte (pagamento venerdì alle 18, o di sabato), la decorrenza (A) passa alle 24:00 del giorno in cui finiscono le 4 ore, oppure (B) l'agenzia deve emettere entro quella mezzanotte, e se non è possibile la scelta non si offre?

Risposte di Dan (2026-10-18): **6A**, la decorrenza «immediata» è il momento dell'emissione, al massimo 4 ore lavorative dopo il pagamento. **7**: con il pagamento venerdì sera o di sabato l'agenzia ha tempo fino alle 12 di lunedì.

Da chiarire ancora:

8. **Tipo 3 quando l'emissione slitta a lunedì:** la decorrenza è (A) il momento dell'emissione, come il tipo 2, oppure (B) le 24:00 di lunedì?
9. **Orario dell'emissione.** Oggi le ore lavorative sono quelle delle aste (`calendar.workingHours`: lunedì-venerdì 9-19, sabato 9-13): con un pagamento venerdì alle 18 il termine cadrebbe sabato alle 12. «Lunedì alle 12» vuol dire un orario solo per l'emissione, senza il sabato e da un'ora diversa: nuovo parametro `issuance.workingHours`, da fissare con Dan.
