# Cookie policy

**Bozza n. 1 del 22/10/2026 — [DA VALIDARE — LEGALE]**

| | |
| --- | --- |
| Chiave del documento | `cookie-policy` |
| Chi lo accetta | Tutti gli utenti (09 §7: «Tutti»; `legal-placeholders.ts`: `audiences: ["ALL"]`) |
| Quando | Al primo accesso; di nuovo a ogni nuova versione |
| Fonti | `docs/specifiche/09` §7; `docs/adr/0002`, `0004` (cookie di sessione), `0011` (service worker e notifiche push); `docs/sorveglianza.md` (Sentry senza cookie); codice di `apps/web` e `apps/admin` alla data della bozza (nomi dei cookie e memoria del browser); d.lgs. 196/2003, art. 122; Garante per la protezione dei dati personali, «Linee guida cookie e altri strumenti di tracciamento» del 10 giugno 2021 |

> Convenzioni: [MAIUSCOLO] = dato da fornire. L'elenco dei cookie è stato ricavato dal codice alla data della bozza: va riverificato prima del rilascio in produzione.

> **Nota per il legale:** oggi la Piattaforma usa solo cookie e strumenti **tecnici** (nessun cookie di profilazione, nessuno strumento di analisi o pubblicità, nessun contenuto di terze parti che installi cookie). Per i soli strumenti tecnici le linee guida del Garante non richiedono il consenso né il banner: basta l'informativa. Le fonti invece prevedono che tutti «accettino» la cookie policy al primo accesso (09 §7). Va deciso se mantenere un'accettazione (che non è un consenso) o sostituirla con un'informativa sempre raggiungibile, senza blocchi. Se in futuro si aggiungono strumenti di analisi o di marketing, servirà un banner con consenso preventivo e la possibilità di rifiutare con la stessa facilità.

---

## 1. Chi siamo

Questa informativa riguarda i siti e le applicazioni web di AstAx ([SITO WEB] e i sottodomini per privati, broker e agenzie, oltre al pannello del back office), gestiti da [RAGIONE SOCIALE], [SEDE LEGALE], P.IVA [P.IVA], titolare del trattamento. Contatti: [EMAIL PRIVACY]; DPO: [DPO].

## 2. Cosa sono i cookie e gli altri strumenti

I cookie sono piccoli file di testo che il sito salva nel browser e rilegge alle visite successive. Strumenti simili sono la memoria del browser (per esempio la memoria di sessione, che si cancella alla chiusura della scheda) e il «service worker», un piccolo programma che il browser usa per ricevere le notifiche.

## 3. Quali strumenti usiamo

Usiamo **solo strumenti tecnici**, necessari a far funzionare il servizio che l'utente chiede. Non usiamo cookie di profilazione, di analisi o di pubblicità, né cookie di terze parti.

| Nome | Tipo | A cosa serve | Durata |
| --- | --- | --- | --- |
| `astax_web_session` | Cookie tecnico, di prima parte | Mantiene l'accesso dell'utente all'area privati, broker o agenzie. Contiene solo un identificativo casuale; i dati della sessione restano sui server di AstAx. Protetto (`HttpOnly`, `Secure`, `SameSite=Lax`) | Fino all'uscita o alla scadenza della sessione (privati: oggi 30 giorni dall'ultimo utilizzo, al massimo 365 giorni; professionisti: oggi 8 ore di inattività) |
| `astax_admin_session` | Cookie tecnico, di prima parte | Come sopra, per il pannello del back office | Oggi 1 ora di inattività |
| Cookie del servizio di autenticazione ([SERVIZIO DI AUTENTICAZIONE]) | Cookie tecnici, di prima parte | Gestiscono l'accesso, il codice monouso e il secondo fattore | [DURATA — da verificare] |
| `astax_offerta_…`, `astax_offerta_link_…` | Cookie tecnici, di prima parte | Ricordano, per il cliente di un intermediario che apre il link dell'offerta, che ha già confermato la propria identità con il codice, così da non chiederlo di nuovo durante firma e pagamento | Fino alla scadenza del link |
| `astax_offers_seen_…` | Cookie tecnico, di prima parte | Ricorda che l'utente ha già visto l'apertura delle buste di un'asta, per non ripetere l'animazione | [DURATA — da verificare] |
| `astax_envelopes_…`, `astax_incoming_seen_…` | Memoria di sessione del browser | Ricordano quali buste o richieste l'utente ha già visto nella scheda aperta | Fino alla chiusura della scheda |
| Service worker (`sw.js`) e iscrizione alle notifiche push | Strumento tecnico | Solo se l'utente attiva le notifiche sul telefono dal profilo: mostra la notifica e apre la pagina giusta. Non salva pagine né dati sul dispositivo | Finché l'utente non disattiva le notifiche |

Le pagine del fornitore dei pagamenti ([FORNITORE PAGAMENTI]) e del servizio di firma ([FORNITORE FEA]), quando l'utente vi viene indirizzato per pagare o firmare, possono usare propri cookie tecnici, regolati dalle informative di quei fornitori.

> **Nota per il legale:** verificare come presentare i cookie delle pagine del fornitore dei pagamenti e del servizio di firma (pagine esterne o incorporate) e il servizio di notifiche push dei produttori dei browser, che riceve il testo delle notifiche in forma cifrata.

## 4. Consenso

Gli strumenti tecnici non richiedono il consenso (art. 122 del d.lgs. 196/2003). Se in futuro AstAx userà strumenti diversi da quelli tecnici, chiederà prima il consenso con un banner che permetterà di accettare o rifiutare con la stessa facilità, e aggiornerà questa informativa.

## 5. Come gestire i cookie

L'utente può cancellare i cookie e bloccarli dalle impostazioni del browser; bloccando i cookie tecnici l'accesso alla Piattaforma non funziona. Le notifiche push si disattivano dal profilo («Disattiva») o dalle impostazioni del browser.

## 6. Altre informazioni

Per i diritti dell'interessato e gli altri trattamenti si rinvia all'Informativa privacy di AstAx. Ultimo aggiornamento: [DATA DI ENTRATA IN VIGORE] — versione {{versione}}.
