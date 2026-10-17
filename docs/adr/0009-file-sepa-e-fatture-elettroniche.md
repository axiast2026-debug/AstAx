# 0009 — File SEPA e fatture elettroniche: formato e controllo

- **Data:** 2026-10-17
- **Stato:** approvata (proposta B del piano della fase 6, approvato da Dan il 2026-10-17)
- **Fase:** 6

## Contesto

La fase 6 produce due tipi di file per altri: il file dei bonifici delle rimesse (CONT-02), che il back office carica in banca, e la fattura elettronica dei compensi (CONT-03), che va al Sistema di Interscambio. I criteri chiedono che entrambi superino la validazione contro lo schema ufficiale. Node.js non ha un validatore XSD; le librerie diffuse (libxmljs2) hanno parti native da compilare, che su Windows e in CI si rompono facilmente.

## Decisione

- Il file dei bonifici è ISO 20022 `pain.001.001.03` (bonifico SEPA), costruito in casa in `packages/adapters/src/xml/pain001.ts`. La fattura è FatturaPA 1.2.2, formato `FPR12`, costruita in `packages/adapters/src/xml/fatturapa.ts` con i dati che il dominio calcola: natura, dicitura e bollo vengono dai parametri `invoicing.*`.
- Gli schemi ufficiali sono salvati nel repository, in `packages/adapters/schemas/`, così come pubblicati: `pain.001.001.03.xsd` (ISO 20022), `Schema_del_file_xml_FatturaPA_v1.2.2.xsd` (Agenzia delle Entrate, con l'unica modifica dell'indirizzo dello schema della firma, che punta alla copia locale) e `xmldsig-core-schema.xsd` (W3C), che lo schema FatturaPA importa. Scaricati il 2026-10-17 da iso20022.org, fatturapa.gov.it e w3.org.
- La validazione usa `xmllint-wasm` 5.3.0 (licenza MIT, nessuna dipendenza): è xmllint di libxml2 compilato in WebAssembly, senza parti native. Ogni file si controlla prima di salvarlo o inviarlo; un file che non passa non esce.
- Il bollo, quando è a carico del destinatario, è una riga a parte con natura N1 («escluso art. 15»), come si usa per le fatture esenti; il totale della fattura lo comprende.

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| libxmljs2 | Parti native da compilare: fragile su Windows e in CI |
| Validare solo con la CI scaricando gli schemi ogni volta | Il controllo deve valere anche prima di generare un file vero, e senza rete |
| Lasciare il formato al fornitore SDI | Il criterio della fase chiede di validare l'XML; e cambiare fornitore non deve cambiare le fatture |

## Conseguenze

- Se l'Agenzia delle Entrate pubblica una nuova versione dello schema, va aggiornato il file in `schemas/` e rilanciati i test di `src/xml/xml.test.ts`.
- La versione di pain.001 accettata dalla banca va confermata quando si sceglie la banca (fase 8): alcune chiedono la variante CBI italiana.
- Natura N4, dicitura e bollo restano da confermare con il commercialista (domanda già nel piano della fase 6).
