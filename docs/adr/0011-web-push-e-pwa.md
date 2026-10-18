# 0011 — Web Push e app installabile senza Serwist

- **Data:** 2026-10-18
- **Stato:** approvata (passo A4 del piano della fase 8, approvato da Dan il 2026-10-18)
- **Fase:** 8

## Contesto

Lo stack prevede «PWA con Serwist e Web Push per i privati». Serve a due cose: ricevere le notifiche sul telefono anche a pagina chiusa e poter installare AstAx come un'app. Serwist genera un service worker che mette in cache le pagine per l'uso senza rete. Le pagine di AstAx contengono dati personali e dati di preventivo: tenerle in cache sul dispositivo non serve (senza rete non si può fare un'offerta né pagare) ed è un rischio per la privacy. Serwist si integra con Next.js tramite webpack, mentre le app usano Turbopack (Next.js 16).

## Decisione

- Nessun Serwist. Un service worker scritto a mano, piccolo e leggibile: `apps/web/public/sw.js`. Fa due cose sole: mostra la notifica push ricevuta (titolo, testo, pagina da aprire) e apre la pagina quando la si tocca. Non mette in cache nessuna pagina e nessun dato.
- Manifest dell'app (`app/manifest.ts` di Next.js): nome, colori e icona. Con il service worker basta perché il telefono proponga «Aggiungi alla schermata Home».
- Invio con la libreria `web-push` 3.6.7 (la più usata per Web Push in Node.js, licenza MPL-2.0), dietro la porta `WebPushPort`: adattatore `VapidWebPush` con le chiavi VAPID di AstAx. Il testo arriva al browser cifrato (RFC 8291): il servizio push di Google, Mozilla o Apple vede solo dati cifrati. Il testo comunque non contiene prezzi né dati personali (regola 8).
- `PUSH_PROVIDER=fake` (predefinito in sviluppo e nei test) consegna le push a Mailpit; `PUSH_PROVIDER=vapid` invia quelle vere. Le chiavi le crea `pnpm env:init`; in cloud stanno in Secrets Manager. Un'iscrizione che il servizio push dichiara scaduta (404/410) viene revocata.
- L'iscrizione la chiede il privato da «Profilo → Notifiche» con il pulsante «Attiva sul telefono»; il browser chiede il permesso. Si toglie con «Disattiva».

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| Serwist | Cache delle pagine non voluta (dati personali sul dispositivo); integrazione con Turbopack non stabile |
| Push cifrate scritte in casa (RFC 8291 con node:crypto) | Possibile, ma più codice crittografico da mantenere; la libreria è lo standard |
| Notifiche native tramite un'app nello store | Fuori dall'MVP |

## Conseguenze

- Su iPhone le push web arrivano solo se AstAx è aggiunta alla schermata Home (limite di Apple, da iOS 16.4).
- Cambiare le chiavi VAPID rende inutili le iscrizioni esistenti: i privati devono riattivarle.
- `web-push` va annotata nell'ADR 0001.
