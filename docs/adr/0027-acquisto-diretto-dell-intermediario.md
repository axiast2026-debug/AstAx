# 0027 — L'intermediario acquista l'offerta, il cliente firma dopo

- **Data:** 2026-10-30
- **Stato:** accettata (Dan, 2026-10-30, `docs/piano-ruoli-acquisto-icone.md`, risposte 3 e 4)
- **Riferimenti:** PRES-02, PRES-05, GAR-04, FEE-03, PAG-01, PAG-02, VIS-02, LEG-05, EMI-01; decisione 26; ADR 0026

## Contesto

Fino a oggi, a fine asta, il broker sceglieva una o più offerte e le mandava al cliente con «Invia al cliente». Il cliente, dal link, sceglieva, firmava con OTP e pagava il premio. Dan vuole che broker, collaboratori, agenti e sub-agenti scelgano direttamente l'offerta e la acquistino, pagando subito loro (risposta 3). Inseriscono email o telefono del cliente in un secondo momento, e il cliente firma con OTP. «Invia al cliente» si toglie (risposta 4).

## Decisione

1. **«Scegli e acquista»** (`POST /requests/:id/purchase`, permesso `offer.purchase` per i richiedenti professionali).
   - Crea l'accettazione con `intermediaryPurchase = true`: il firmatario è il cliente, e i documenti da leggere e firmare sono quelli di sempre.
   - Apre subito il pagamento del solo premio (FEE-03; il fee del broker resta a fattura).
   - Valgono le stesse regole della scelta del cliente: solo la migliore offerta per compagnia (PRES-02) e garanzia ancora valida (GAR-04).
   - Finché il pagamento non è confermato, l'intermediario può ancora cambiare offerta.
2. **Pagamento confermato.**
   - L'accettazione resta «da firmare», con la data di pagamento (`paidAt`), e la richiesta è «Accettata».
   - Non parte l'emissione e l'agenzia non riceve i contatti (VIS-02).
   - L'offerta acquistata è l'unica: da quel momento nessun'altra si può scegliere (`ALREADY_PURCHASED`), anche dopo la data del prezzo garantito.
3. **Contatti e link di firma** (`POST /requests/:id/customer-link`, con email o telefono).
   - I contatti si salvano cifrati sul cliente.
   - Il cliente riceve il link (`offer.link_to_client`), valido `acceptance.signatureLinkValidityDays` giorni (14). Un nuovo invio chiude il link precedente.
   - Dal link il cliente:
     - conferma con il codice;
     - vede la sola offerta acquistata;
     - legge e firma (FEA).
   - Sul link non c'è niente da pagare.
4. **Firma del cliente.** L'accettazione diventa pagata (`confirmPaid`):
   - la richiesta passa «In emissione»;
   - il termine di emissione (EMI-01) si calcola da quel momento;
   - l'agenzia vincitrice riceve i contatti.

   Una firma rifiutata o scaduta non annulla l'acquisto: l'intermediario manda un nuovo link.
5. **I privati non cambiano:** scelgono, firmano e pagano come prima.

## Conseguenze

- `Acceptance.intermediaryPurchase` (migrazione `20261102090000_intermediary_purchase`) e il parametro `acceptance.signatureLinkValidityDays`.
- Il cliente del broker non sceglie più tra più offerte; il testo del link parla di firma.
- Domanda aperta per il legale (`docs/punti-aperti.md`): il pagamento dell'intermediario prima della firma del cliente, e il rimborso se il cliente non firma. Per ora nessun rimborso automatico: lo gestisce il back office.
