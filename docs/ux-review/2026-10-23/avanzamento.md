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
- 2026-10-23, misura di partenza completa (`misure/prima/*.json`, `riepilogo.txt`): 13 flussi, 72 schermate; axe trova solo «page-has-heading-one» (migliore pratica, moderato) sulla home del privato, sul cruscotto del back office e sulla home del broker. Tre correzioni allo strumento (axe vuole un contesto suo; attese più lunghe per il PC lento; integrazione chiedibile solo dopo il completamento dei dati).
- 2026-10-23, corsia A implementata in 8 commit (vedi `git log ux/revisione-2026-10-23`): ripresa della bozza al passo giusto e un solo pulsante arancio in home; dato chiesto una volta (data di nascita dalla patente o dalla scheda del cliente); campi mostrati solo quando servono (copertura, nuovo cliente, modulo dell'offerta) con precompilazione dei minimi del pacchetto; «Scegli questa offerta» con stato di attesa; PDF dell'emissione inviati alla scelta; pannello del broker e pagina del cliente dal link nel nuovo design; aree da 44 px e bordi leggibili nei gusci e nel back office; nomi italiani dei campi letti dal bot. Tema di accesso Keycloak nei colori AstAx (`infra/keycloak/themes/astax/login/resources/css/astax.css`), da verificare dopo il rebuild dell'immagine.
- Da fare: rebuild sito (produzione) e riavvio dell'API con le modifiche; misura «dopo»; `pnpm check`; prove e2e toccate (S01, S02, fase2, broker-area, fase4); controllo indipendente; rapporto; PR.
