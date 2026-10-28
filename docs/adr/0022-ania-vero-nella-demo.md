# 0022 — Banca Dati ANIA vera nel back office della demo

- **Data:** 2026-10-28
- **Stato:** accettata (Dan, 2026-10-28: «abbiamo il via libera di Allianz; il bot ANIA verrà gestito solo dal back office, che è uno staff autorizzato»)
- **Riferimenti:** regole 9, 11 e 12 di `CLAUDE.md`; `docs/piano-back-office-verifica.md` passo 7; `docs/adattatori.md` «Banca Dati ANIA»; ADR 0020

## Contesto

Il back office legge la Banca Dati ANIA con la sola targa per preparare la scheda per le agenzie. Fino a oggi c'era solo l'ANIA finto. Dan ha il via scritto di Allianz per la consultazione attraverso il portale agenzie e vuole usarla subito, sulla demo online, per tutte le targhe.

## Decisione

1. **Il bot è quello di CorteXa, invariato**, in un repository privato separato (`astax-ania-bot`): il codice del connettore resta fuori dal repository pubblico di AstAx. AstAx tiene la porta, il finto e l'adattatore `HttpAniaReader` (`ANIA_PROVIDER=http`).
2. **Gira sul server della demo**, nella rete interna di Docker, senza porte aperte fuori; lo chiama solo l'API, con una chiave generata sul server e mai stampata. Il bot tiene il suo registro di audit (targa solo come HMAC) e la sessione del portale cifrata.
3. **Eccezione alla regola 11 per la sola lettura ANIA:** nella demo la scheda ANIA può contenere dati veri di persone (per tutte le targhe, scelta di Dan). La leggono solo gli utenti del back office, che entrano con password e secondo fattore; i dati restano cifrati sulla verifica (`aniaEnc`) e il registro attività ne tiene solo il fatto. Il resto della demo resta con dati sintetici.
4. **Login manuale dal back office** (aggiornato il 2026-10-28): il portale chiede utente, password e authenticator e non lascia riusare una sessione presa sul PC (provato da Dan). Il login si fa quindi sul browser del bot, sul server: nella pagina «Portale ANIA» del back office l'operatore vede quel browser come immagine, ci clicca e scrive; quando compare la ricerca ANIA, le consultazioni usano quella stessa sessione. Quello che scrive passa all'API e al bot senza essere conservato né registrato; il registro tiene chi ha aperto lo schermo e quando il portale era pronto. Nessun login automatico e nessuna consultazione per tenere viva la sessione.

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| Aspettare l'ambiente di produzione | Dan vuole usarla ora; l'ambiente di produzione non c'è ancora |
| Solo alcune targhe di prova | Proposta; Dan ha scelto tutte le targhe |
| Login dal PC e sessione portata sul server | Provato: il portale chiede di nuovo il login con la sessione salvata |
| Tenere viva la sessione con consultazioni periodiche | Scelta di CorteXa: niente keep-alive, per le regole del portale |

## Conseguenze

- Gli utenti del back office della demo devono essere persone autorizzate: gli accessi di prova vanno dati solo allo staff.
- La sessione scade dopo meno di un'ora senza consultazioni: «Leggi da ANIA» lo dice e rimanda a «Portale ANIA» per un nuovo login.
- Il server della demo tratta dati personali veri: backup, accessi SSH e conservazione vanno trattati come in produzione; punto per il legale in `docs/punti-aperti.md`.
