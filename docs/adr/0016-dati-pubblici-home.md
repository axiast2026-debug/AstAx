# 0016 — I dati veri nella home pubblica

- **Data:** 2026-10-22
- **Stato:** accettata (Momento 1 del nuovo design, scelta A di Dan del 2026-10-22)
- **Riferimenti:** consegna di Claude Design, «Dati che servono» punto 4; VIS-03; decisione 18c

## Contesto

La home pubblica del nuovo design mostra l'occasione con dati veri: un'asta in corso adesso, il nastro degli ultimi eventi, le aste aperte, le offerte medie per asta e il risparmio medio rispetto al premio attuale dichiarato dai clienti. Fino a oggi l'API non aveva dati leggibili senza accesso, salvo la salute del servizio e le opzioni della domanda di ingresso.

## Decisione

1. **Un indirizzo pubblico in sola lettura, `GET /public/home`**, senza accesso, con il limite di richieste di tutta l'API. Il risultato resta in memoria per 60 secondi: molte visite fanno una sola lettura.
2. **Solo dati anonimi o aggregati.** Dell'asta in corso: tipo di veicolo, provincia, numero di buste, chiusura e tempo lavorativo. Del nastro: ora, provincia, tipo di veicolo e cosa è successo (busta arrivata, asta chiusa con N offerte). Mai prezzi, compagnie, agenzie, targhe, nomi o codici delle richieste.
3. **Interruttore e soglia nei parametri.** `home.publicData.enabled` spegne tutto; sotto `home.publicData.minClosedAuctions` aste chiuse negli ultimi `home.publicData.windowDays` giorni asta, nastro e numeri non si mostrano: pochi dati darebbero medie poco significative e renderebbero più riconoscibile la singola asta. Il valore iniziale dell'interruttore è spento.
4. **Il risparmio medio** è la media, sulle accettazioni pagate del periodo con il premio attuale dichiarato, di (premio dichiarato − premio scelto) ÷ premio dichiarato, sempre con il numero di polizze su cui è calcolato. Il premio dichiarato è nei dati cifrati della richiesta: si legge come per la presentazione delle offerte (PRES-03).
5. **I compensi di «Quanto costa»** si leggono dai parametri `fees.private.*`, mai scritti nel codice.

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| Solo numeri aggregati (scelta B) | Dan ha scelto la A: la home deve mostrare l'asta che si muove |
| Numeri calcolati di notte in una tabella | Più parti da mantenere; con la memoria di 60 secondi il costo è già basso |

## Conseguenze

- Il «risparmio medio» è un'affermazione pubblicitaria: prima della produzione il legale ne valida testo e calcolo (`docs/punti-aperti.md`). Fino ad allora l'interruttore resta spento in produzione.
- In sviluppo i dati sono sintetici: per vedere la parte con i numeri si abbassa la soglia nei parametri.
