---
description: Verifica i criteri di accettazione e chiude una fase di AstAx
argument-hint: <numero della fase, da 1 a 8>
---

Chiudi la fase $ARGUMENTS di AstAx.

1. Esegui `pnpm check` e i test end-to-end previsti dal file della fase in `fasi/` che inizia con `0$ARGUMENTS-`. Se qualcosa fallisce, correggi e riesegui finché è tutto verde.
2. Per ogni criterio di accettazione della fase trova la prova: il test che lo verifica, il comando o la schermata. Se un criterio non ha una prova, scrivi il test che manca.
3. Chiedi al sottoagente `verificatore` di controllare in modo indipendente la fase $ARGUMENTS: criteri di accettazione e regole non violabili di `CLAUDE.md` sul codice cambiato in questa fase. Correggi ciò che trova e richiedi una nuova verifica.
4. Aggiorna `docs/stato.md`: fase `In verifica`, tabella dei criteri con esito e prova, debiti tecnici, ADR scritti, istruzioni passo passo della demo per Dan.
5. Scrivimi in italiano un riepilogo breve: cosa è pronto, cosa provare nella demo, cosa resta aperto.

Non dichiarare la fase chiusa se anche un solo criterio non è soddisfatto. La fase passa a `Chiusa` solo dopo che ho visto la demo e ho confermato.
