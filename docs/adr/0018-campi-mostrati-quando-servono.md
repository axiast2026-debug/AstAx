# 0018 — Campi mostrati solo quando servono, con CSS `:has()` e senza script

- **Data:** 2026-10-23
- **Stato:** accettata (revisione UX del 2026-10-23, corsia A; mandato di Dan senza conferme intermedie)
- **Riferimenti:** `docs/ux-review/2026-10-23/rapporto.md`, `apps/web/src/app/globals.css`

## Contesto

Alcune schermate mostravano campi che servono solo con una certa scelta: le garanzie «Su misura» anche con «Consigliato», la data di decorrenza anche con «appena l'agenzia emette», i campi di persona e società insieme nel nuovo cliente del broker, i massimali separati anche con «Massimale unico», i dettagli di ogni garanzia anche se non inclusa. I moduli del sito usano le azioni del server di Next.js e funzionano senza JavaScript (fase 2): non volevamo introdurre stato lato client solo per nascondere campi.

## Decisione

1. **Un blocco con l'attributo `data-shows-when="<scelta>"` compare solo mentre la scelta è attiva**, con regole CSS `form:has(...)` in `apps/web/src/app/globals.css`. Niente script.
2. **Chi non ha `:has()` vede tutto** (`@supports selector(:has(*))`): nessuno resta senza un campo.
3. **Un modulo rimandato con errori mostra tutto** (`data-has-errors` sul `form`): i link del riepilogo errori raggiungono sempre il loro campo.
4. **Mai dentro un blocco nascosto:** consensi, spunte legali, documenti precontrattuali, dati obbligatori senza un'alternativa visibile. I campi nascosti vengono comunque inviati: il server decide in base alla scelta (pacchetto, tipo di massimale, tipo di cliente), come già faceva.

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| Componenti client con stato (React) | Rompe il funzionamento senza script dei moduli e aggiunge codice per un effetto solo visivo |
| Una schermata in più per ogni scelta | Più passaggi: il contrario dell'obiettivo |

## Conseguenze

- I campi nascosti restano nel DOM ma fuori dall'albero di accessibilità e dal giro del tab (`display: none`).
- Un test e2e che compila un campo nascosto deve prima fare la scelta che lo mostra (Playwright rifiuta di scrivere in un campo invisibile).
