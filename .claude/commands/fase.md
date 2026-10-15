---
description: Avvia una fase di sviluppo di AstAx (prima il piano, poi il lavoro)
argument-hint: <numero della fase, da 1 a 8>
---

Avvia la fase $ARGUMENTS di AstAx.

1. Leggi `CLAUDE.md`, `docs/stato.md` e il file della fase in `fasi/` che inizia con `0$ARGUMENTS-`.
2. Controlla in `docs/stato.md` che la fase precedente sia chiusa. Se non lo è, fermati e dimmi cosa manca.
3. Leggi tutti i documenti indicati nella sezione «Prima di iniziare» della fase e le regole di dominio citate.
4. Scrivimi in italiano, in modo semplice:
   - cosa farai in questa fase, in 5-10 righe;
   - il piano in passi piccoli, ciascuno con i suoi test;
   - i rischi o i dubbi che vedi, con la tua proposta per ciascuno;
   - cosa ti serve da me, e per quando.
5. Aspetta la mia approvazione prima di scrivere codice.
6. Dopo l'approvazione lavora passo per passo: test, codice, `pnpm check` verde, commit. Segna `In corso` la fase in `docs/stato.md` e aggiorna il file alla fine di ogni sessione.
