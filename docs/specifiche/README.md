# Specifiche funzionali di AstAx

Questi file sono l'esportazione del documento «AstAx — asta preventivi RCA: specifiche per ruoli e processi», fatta il 14 ottobre 2026. Sono la fonte delle funzioni: cosa vede e cosa fa ogni utenza, e come funzionano i processi.

| File | Contenuto |
| --- | --- |
| [00-panoramica-e-processi.md](00-panoramica-e-processi.md) | Principi, ruoli, modello economico, ciclo di vita, processi 1-4, punti aperti |
| [01-utenze-elementi-comuni.md](01-utenze-elementi-comuni.md) | Accesso, profilo, chi vede cosa, stati di richiesta e offerta, notifiche |
| [02-utenza-broker.md](02-utenza-broker.md) | Broker richiedente: menu, schermate, permessi |
| [03-utenza-privato.md](03-utenza-privato.md) | Cliente privato |
| [04-utenza-agenzia.md](04-utenza-agenzia.md) | Agenzia (sez. A) |
| [05-utenza-sub-agente.md](05-utenza-sub-agente.md) | Sub-agente (sez. E) |
| [06-utenza-back-office.md](06-utenza-back-office.md) | Back office |
| [07-utenza-amministratore.md](07-utenza-amministratore.md) | Amministratore |
| [08-architettura-tecnica.md](08-architettura-tecnica.md) | Stack, motore d'asta, integrazioni, sicurezza, piano |
| [09-decisioni-e-valori-predefiniti.md](09-decisioni-e-valori-predefiniti.md) | Decisioni prese, pacchetti, campi, elenchi, parametri, fornitori |

## Quale fonte vale

La panoramica è stata scritta prima delle decisioni. Dove due testi non coincidono vale, in quest'ordine:

1. le regole non violabili di `CLAUDE.md`;
2. [`../regole-di-dominio.md`](../regole-di-dominio.md);
3. [`../decisioni-aggiunte.md`](../decisioni-aggiunte.md);
4. `09-decisioni-e-valori-predefiniti.md`;
5. gli altri file di questa cartella.

Esempi già risolti: i pacchetti sono Base, Plus e Completo (non «Base più furto e incendio»); l'orario è lunedì-venerdì 9-19 e sabato 9-13 (non 9-19 dal lunedì al sabato); l'attestato si carica e si legge con l'AI, senza collegamento diretto alla banca dati ANIA; il fee sui premi bassi è deciso.

Non modificare questi file per adattarli al codice. Se una specifica è sbagliata o incompleta, scrivilo in [`../domande-aperte.md`](../domande-aperte.md).
