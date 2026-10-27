# Piano: demo online di AstAx su Hetzner

**Stato:** risposte di Dan del 2026-10-27 qui sotto, dominio scelto `astaxapp.com`. Niente risorse cloud né spese finché Dan non scrive «crea».

## A cosa serve

Far provare AstAx a voi, ai soci e ad alcuni agenti **prima del collaudo su AWS** (fase 8). È una demo, non la produzione:

- solo **dati inventati**: persone, targhe e compagnie finte. Ogni pagina dice «DEMO: usare solo dati inventati». Nessun cliente vero, neanche per prova (regola 11);
- fornitori **finti**: firma, pagamenti, SMS, lettura dei documenti e dati del veicolo sono simulati. Nessun pagamento vero, nessun costo;
- testi legali ancora «[DA VALIDARE — LEGALE]»;
- pagine escluse dai motori di ricerca.

Quando il collaudo su AWS sarà pronto la demo si spegne, e il server si cancella o si riusa.

## Come è fatta

Un solo server, con lo stesso Docker Compose che gira sul tuo PC, in versione «produzione».

| Pezzo | Dove | Note |
| --- | --- | --- |
| Sito dei clienti, back office, API, motore delle aste | Server Hetzner | Le stesse immagini della fase 8, costruite su GitHub (gratis, il repository è pubblico) e scaricate sul server: il server non compila niente |
| Keycloak (accessi), Temporal, PostgreSQL, Redis, archivio documenti | Stesso server | Come in locale |
| HTTPS e protezione | Cloudflare (gratis) | Dominio, lucchetto HTTPS, protezione dagli attacchi; il server risponde solo a Cloudflare. Entra chi ha il link e un utente di prova (risposta 4B) |
| Email (codici di accesso, avvisi delle aste) | Resend (gratis) | 3.000 email al mese, 100 al giorno, inviate da un indirizzo del vostro dominio |
| Errori dell'app | Sentry (gratis) | Facoltativo |
| Copie di sicurezza | Backup di Hetzner + copia giornaliera del database sul server | Se qualcosa va storto si torna al giorno prima |

**Indirizzi** con il dominio `astaxapp.com`:

- `demo.astaxapp.com`: sito dei clienti, broker e agenzie
- `bo.astaxapp.com`: back office
- `accesso.astaxapp.com`: pagine di accesso (Keycloak)
- `api.astaxapp.com`: API e aggiornamenti in tempo reale

**Costo stimato**

| Voce | Costo |
| --- | --- |
| Server Hetzner da 8 GB con backup | circa 8–10 € al mese (il prezzo esatto si vede al momento dell'acquisto) |
| Dominio | circa 10–15 € l'anno |
| Cloudflare, Resend, GitHub, Sentry | 0 € |

Se la demo va lenta si passa al server da 16 GB (circa 20–25 € al mese) con un clic, senza rifare niente.

## Chi fa cosa

**Tu** (servono password o dati di pagamento, quindi io non posso farlo; ti preparo le istruzioni con gli schermi da toccare, un passo alla volta):

1. compri il dominio (vedi la domanda 1);
2. crei l'account Cloudflare (gratis) e ci aggiungi il dominio;
3. crei l'account Hetzner e il server, con la «chiave SSH» che ti preparo io. È la serratura con cui entro nel server dal tuo PC: ti do solo la parte pubblica, che non è segreta; la parte privata resta sul tuo PC;
4. crei l'account Resend e aggiungi su Cloudflare i record del dominio che ti scrivo;
5. la chiave di Resend la incolli tu in una finestra del terminale che ti apro io, **mai nella chat**.

**Io:**

- scrivo la configurazione della demo (`infra/demo/`) e un'azione di GitHub che costruisce e pubblica le immagini;
- preparo il server: aggiornamenti automatici, firewall aperto solo a Cloudflare, HTTPS, backup giornaliero del database;
- genero sul server tutte le password interne della demo, senza mostrarle e senza metterle nel repository (è pubblico);
- aggiungo la scritta «DEMO» e l'esclusione dai motori di ricerca;
- carico i dati di prova, provo tutti i percorsi principali (privato, broker, agenzia, back office) e ti do gli utenti di prova;
- scrivo un ADR (la decisione tecnica) e aggiorno `docs/stato.md`.

**Aggiornamenti:** quando c'è una novità su `main` con i controlli verdi, la porto sulla demo io, dal tuo PC, solo se me lo chiedi.

## Risposte di Dan (2026-10-27)

1. **Dominio:** un `.com` comprato su Cloudflare. Dan voleva `astax.com`, ma è già registrato da altri dal 2004 (scade nel 2027 ed è bloccato contro i trasferimenti). Scelto **`astaxapp.com`** (libero il 2026-10-27).
2. **Server:** A, **CAX21** (4 processori ARM, 8 GB).
3. **Strumenti di sviluppo:** A, **accesi solo nel back office**, con un interruttore «demo» separato dalla produzione che il blocco della produzione rifiuta sempre (regola 13). Va scritto un ADR prima della modifica.
4. **Chi entra:** B, **chiunque abbia il link**, con il solo accesso di AstAx (niente Cloudflare Access). Cloudflare resta per il dominio e l'HTTPS; il firewall del server accetta solo Cloudflare; pagine escluse dai motori di ricerca. Utenti solo di prova, creati da noi.
5. **Email:** A, **vere, con Resend**, inviate da un indirizzo del dominio della demo.

Si parte con il «crea» di Dan: prima i suoi passi (dominio, Cloudflare, Hetzner, Resend) con le istruzioni, poi i miei.
