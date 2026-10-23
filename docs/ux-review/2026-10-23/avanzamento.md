# Revisione UX 2026-10-23 — avanzamento

Ramo `ux/revisione-2026-10-23`. Se la sessione si interrompe, si riparte da qui.

| Passo | Stato | Note |
| --- | --- | --- |
| 1. Preparazione (ambiente, controlli, problemi preesistenti) | in corso | Infrastruttura Docker, API, worker, sito e back office già accesi all'inizio |
| 2. Misura di partenza (390 e 1440 px) | da fare | |
| 3. Revisione (problemi in ordine di gravità) | da fare | |
| 4. Piano (corsia A / B) | da fare | |
| 5. Implementazione corsia A | da fare | |
| 6. Verifica dopo ogni modifica | da fare | |
| 7. Controllo indipendente | da fare | |
| 8. Rapporto e PR | da fare | |

## Diario

- 2026-10-23: letti CLAUDE.md, stato, ADR 0013-0017, piani broker e agenzie, prova guidata, canvas (Movimento, Componenti). Creato il ramo.
- 2026-10-23: strumento di misura in `tests/e2e/ux-review/` (config a parte `tests/e2e/ux-review.config.ts`, non in CI): conta schermate, tocchi, campi, scelte, file, attese; schermate a 390 e 1440 px in `schermate/<fase>/<flusso>/`; axe (WCAG 2.2 AA, tutti gli impatti) per schermata; risultati in `misure/<fase>/<flusso>.json`. Ambiente trovato già acceso (Docker, API stabile, worker, sito in produzione, back office in sviluppo). Controlli completi (`pnpm check`) verdi al commit 88f4115 secondo `docs/stato.md`; non rilanciati all'inizio per la memoria del PC: si rilanciano alla fine. Prima osservazione: la pagina di accesso del privato è quella di Keycloak con il tema grigio/blu di base, fuori dal sistema visivo.
