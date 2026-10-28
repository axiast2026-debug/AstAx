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
4. **Login manuale:** il portale chiede utente, password e authenticator; il login lo fa Dan dal suo PC (`infra/login.sh` del repository privato) e la sessione cifrata va sul server. Le credenziali non passano mai da AstAx, dal repository o dalla chat.

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| Aspettare l'ambiente di produzione | Dan vuole usarla ora; l'ambiente di produzione non c'è ancora |
| Solo alcune targhe di prova | Proposta; Dan ha scelto tutte le targhe |
| Schermo remoto sul server per il login | Più memoria e lavoro sul server; il login dal PC basta finché la sessione dura |

## Conseguenze

- Gli utenti del back office della demo devono essere persone autorizzate: gli accessi di prova vanno dati solo allo staff.
- Se la sessione del portale scade, «Leggi da ANIA» risponde che serve un nuovo login; Dan rilancia `infra/login.sh`.
- Il server della demo tratta dati personali veri: backup, accessi SSH e conservazione vanno trattati come in produzione; punto per il legale in `docs/punti-aperti.md`.
- La sessione presa dal PC potrebbe non valere da un altro indirizzo IP: in quel caso serve lo schermo remoto sul server.
