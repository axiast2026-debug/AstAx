# 0013 — Richiesta del privato in due tempi: dati essenziali e completamento del back office

- **Data:** 2026-10-21
- **Stato:** approvata (flusso semplificato di Dan, `docs/piano-flusso-semplificato.md`, decisioni del 2026-10-21)
- **Fase:** dopo la fase 8 (semplificazione)

## Contesto

Oggi il privato compila tutti i dati del preventivo (`quoteData`: persone, veicolo, conducenti, storico) e la richiesta si invia solo quando sono completi; il back office verifica e corregge. Dan vuole il contrario: il cliente dà pochi dati e le foto dei documenti, il «bot» (il lettore AI dei documenti, fase 8) estrae il resto e il back office lo conferma prima dell'asta.

Tutto il sistema (filtri delle agenzie, controllo automatico, asta, offerte, accettazione) legge una `quoteData` completa e versionata. Non si può togliere.

## Decisione

1. **Una nuova sezione della bozza, `intake`** (dati essenziali): veicolo già assicurato o nuovo; targa; data di nascita del proprietario; residenza; per un veicolo nuovo la provenienza della classe (veicolo proprio, venduto, demolito o rottamato con la sua targa; veicolo di un familiare convivente con targa e data di nascita; prima polizza); tipo di guida. Più la sezione `request` di oggi (garanzie, decorrenza) e i documenti.
2. **Invio in due tempi.** Il privato invia la richiesta con `intake`, `request` e i documenti leggibili. La richiesta va «In verifica» **senza `quoteData`** (`quoteDataVersion` vuota): è una richiesta «da completare».
3. **Completamento del back office.** Una funzione pura, `quoteDataFromIntake`, prepara una `quoteData` candidata da `intake` e dai campi letti dal bot. Il back office la vede accanto alle foto, corregge e conferma: nasce la versione 1 di `quoteData` (sorgente `BACK_OFFICE_COMPLETION`), con le colonne derivate e il controllo automatico. Da lì tutto prosegue come oggi: approvazione, asta, offerte.
4. **Approvazione solo con `quoteData`.** L'API rifiuta l'approvazione di una richiesta ancora da completare.
5. **Controllo di leggibilità** al caricamento: il bot dice se il documento si legge (campi trovati con fiducia sopra `documents.confidenceThreshold`). Se no, il cliente lo ricarica subito.
6. **Il broker** resta sul modulo completo (Dan, risposta 9): `intake` vale solo per i privati.
7. Un nuovo tipo di documento, `IDENTITY_DOCUMENT` (carta d'identità), per il veicolo nuovo.

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| Il bot compila la `quoteData` completa e l'invio resta come oggi | Se il bot non legge un campo obbligatorio il cliente resta bloccato: è quello che Dan vuole evitare |
| `quoteData` con molti campi facoltativi | Ogni lettore a valle (filtri, controlli, offerte) dovrebbe gestire i buchi; più rischi di errore che con una richiesta «da completare» chiaramente separata |

## Conseguenze

- Le pagine e i servizi che leggono la richiesta prima dell'approvazione devono gestire `quoteData` assente (dettaglio del cliente, scheda del back office, avvisi dell'invio).
- La regola LEG-04 (consensi confermati con un codice) diventa una spunta per il privato (Dan, risposta 5B), da far confermare al legale (`docs/punti-aperti.md`).
- Scenari S01 e S09 e le prove della richiesta del privato vanno riscritti.
