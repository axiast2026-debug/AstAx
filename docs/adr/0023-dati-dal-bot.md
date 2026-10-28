# 0023 — I dati della richiesta dai bot, confermati con una spunta

- **Data:** 2026-10-28
- **Stato:** accettata (Dan, 2026-10-28, `docs/piano-dati-dal-bot.md`)
- **Riferimenti:** ADR 0013 (richiesta in due tempi), ADR 0022 (ANIA vera); VIS-01; regola 2

## Contesto

Con l'ADR 0013 il back office completava a mano, in «Completa i dati», quello che i documenti non dicevano (data di acquisto, classe, compagnia, scadenza…). Con la lettura ANIA quei dati arrivano dal bot. Dan: «Completa i dati non ci deve essere più»; una sola spunta «Confermo la correttezza dei dati estratti dal bot» e l'asta parte; i dati confermati li vedono anche agenti e sub-agenti; se il bot non trova un dato, «bastano i dati che riesce a estrapolare».

## Decisione

1. I dati della richiesta si costruiscono da richiesta del cliente, documenti, dati dalla targa e scheda ANIA (`quoteDataFromBot`), con targa e data di nascita delle verifiche 3 e 4 e la provenienza dalla tipologia della verifica 5. ANIA vince su date del veicolo e storia assicurativa.
2. «Confermo la correttezza dei dati estratti dal bot» (`POST /verification/requests/:id/bot-confirm`) richiede le 5 verifiche, crea la versione dei dati e approva in un passo; nel registro chi, quando e quali dati sono rimasti «non disponibile».
3. Diventano facoltativi nel modello: alimentazione, potenza, prima immatricolazione, data di acquisto, luogo di nascita e sesso; per i dati dai bot non bloccano classe CU, compagnia attuale e RC familiare mancanti. Il tipo di veicolo, se ANIA non lo riconosce, è «Autovettura» e lo dice l'avviso della scheda.
4. Chiedere un documento al cliente su una richiesta con i soli dati essenziali salva prima i dati dei bot (senza le 5 verifiche e senza aprire l'asta).
5. Le agenzie invitate vedono il riquadro «Dati ANIA confermati dal back office» e «non disponibile» per i dati mancanti; mai telefono ed email (VIS-01).

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| Tenere «Completa i dati» per i soli dati mancanti | Dan: bastano i dati del bot |
| Bloccare l'asta senza classe CU o compagnia | Dan: bastano i dati del bot; l'agenzia lo vede come «non disponibile» |

## Conseguenze

- Un'agenzia può ricevere una richiesta con dati «non disponibile»: decide se offrire, come con ogni dato.
- «Completa i dati» e la sua azione non ci sono più; i dati si correggono ancora da «Correggi altri dati».
