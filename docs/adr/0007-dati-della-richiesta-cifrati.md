# 0007 — Dati della richiesta cifrati, bozza a sezioni, proprietà delle righe

- **Data:** 2026-10-15
- **Stato:** proposta
- **Fase:** 2

## Contesto

`quoteData` (modello dati, «Clienti e richieste») contiene nomi, codici fiscali, indirizzi, numeri di patente: dati personali di contraente, proprietario e conducenti. Il criterio della fase 2 chiede che codice fiscale, telefono ed email siano cifrati nel database. Se `quoteData` restasse JSON in chiaro, il codice fiscale sarebbe in chiaro dentro il JSON. Servono inoltre i filtri (stato, pacchetto, provincia…) e la ricerca esatta per codice fiscale.

## Decisione

1. **`quoteData` cifrato per intero.** Ogni versione è una riga di `QuoteDataVersion` con il JSON cifrato (`dataEnc`, AES-256-GCM con la chiave dei campi, `FieldCipher`; KMS in fase 8) e l'impronta SHA-256 del JSON canonico (`dataSha256`). Le righe si aggiungono e non si modificano. La richiesta tiene il numero della versione in vigore.
2. **Colonne derivate in chiaro** su `QuoteRequest` (tipo di veicolo, provincia, classe CU, sinistri, età del conducente più giovane, pacchetto, decorrenza, validità minima): servono ai filtri e alla selezione delle agenzie e non identificano una persona.
3. **Bozza a sezioni, cifrata.** La bozza (`draftEnc`) è un `QuoteDraft` (schema in `packages/shared`): una sezione si salva solo completa e valida. All'invio le sezioni diventano la versione 1 di `quoteData`.
4. **Codice fiscale, partita IVA, telefono, email** di `Person` e `Customer` sono cifrati, con l'indice cieco (`...Hash`) per la ricerca esatta (SIC-03). I contatti stanno solo in `Customer`, mai in `quoteData` (VIS-01). Anche i **campi letti dai documenti** (`Document.extractionEnc`: nomi, codici fiscali, numeri di patente) sono cifrati, aggiunto dopo la verifica indipendente del 2026-10-16.
4b. **Richieste dei broker: il contraente è il cliente.** Il consenso (LEG-04) vale per il cliente; all'invio, e in ogni correzione del back office, il codice fiscale (o la partita IVA) del contraente deve essere quello del cliente, confrontato con l'indice cieco. L'identità del cliente si fissa alla creazione e non cambia più. **Richieste dei privati:** il contraente può essere un'altra persona, per esempio il coniuge (risposta di Dan alla domanda 12); il cliente resta chi usa l'account e non prende i dati del contraente. Il consenso del contraente è un punto per il legale (`docs/punti-aperti.md`).
5. **Registro senza dati personali.** Una correzione del back office registra nel registro la versione prima e dopo, l'impronta prima e dopo e i percorsi dei campi cambiati, non i valori. Il valore prima e dopo si legge, da chi ha il permesso, confrontando le due versioni cifrate.
6. **Proprietà di ogni riga** per la sicurezza a livello di riga: ogni tabella dei clienti e delle richieste ha `ownerUserId` (privato) oppure `ownerOrganizationId` (broker). La funzione SQL `app_owns_row` dà accesso al privato proprietario (senza contesto professionale attivo), all'organizzazione del contesto attivo e al personale AstAx. Le agenzie arrivano in fase 3, con gli inviti all'asta.

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| Cifrare solo i campi sensibili dentro il JSON | Schema doppio, facile dimenticare un campo nuovo; i nomi e gli indirizzi resterebbero in chiaro |
| `quoteData` in chiaro con colonne di PostgreSQL cifrate (pgcrypto) | La chiave passerebbe dal database; con KMS in fase 8 la cifratura resta nell'applicazione |
| Valori prima e dopo in chiaro nel registro | Il registro è letto da più ruoli e non si può cancellare: niente dati personali dentro |

## Conseguenze

- Le ricerche dentro `quoteData` (per esempio per targa) usano colonne in chiaro aggiunte apposta: la targa sta in `Vehicle.plate` e in `QuoteRequest.plate`. Una targa non identifica direttamente una persona; il registro e i log contengono comunque solo identificativi.
- Ogni lettura di `quoteData` passa dall'API, che decifra e registra l'apertura quando a leggere è il back office (regola 4).
- Cambiare chiave richiede di ricifrare le righe: si fa in fase 8 con KMS e la versione nel prefisso del valore cifrato (`v1:`).
