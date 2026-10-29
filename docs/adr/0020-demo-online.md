# 0020 — Demo online su un server Hetzner

- **Data:** 2026-10-27
- **Stato:** accettata (Dan, 2026-10-27: server CAX11 (prima scelta CAX21, ma per 8 GB Hetzner proponeva circa 45 € al mese), dominio `astaxapp.com` su Cloudflare, strumenti di sviluppo solo nel back office, accesso con il solo link, email vere con Resend; «crea»)
- **Riferimenti:** `docs/piano-demo-online.md`; ADR 0002, 0003, 0008; regole 3, 7, 9, 11, 12 e 13 di CLAUDE.md; criteri della fase 8

## Contesto

Dan vuole far provare AstAx a soci e agenti prima del collaudo su AWS della fase 8. Vercel non basta: ospita i siti Next.js, ma non i servizi che devono restare accesi (worker delle aste con Temporal, Keycloak, canale in tempo reale, database, archivio documenti). Dan ha scelto un solo server Hetzner con tutto il pacchetto in Docker Compose, un dominio suo su Cloudflare e le email vere con Resend. La demo usa solo dati inventati e fornitori finti: non è un collaudo e non è la produzione.

## Decisione

1. **Un server, un Compose a sé.** Server Hetzner CAX11 (ARM, 2 vCPU, 4 GB, backup di Hetzner), Ubuntu 24.04, con 4 GB di swap su disco. La demo ha il suo file `infra/demo/compose.yml`, separato da quello di sviluppo: stessi servizi (PostgreSQL, Redis, Keycloak, Temporal, SeaweedFS, API, worker, sito, back office), nessuna porta aperta tranne quelle del proxy, un limite di memoria stretto per ogni servizio (circa 3,4 GB in tutto).
2. **Le immagini della fase 8, costruite da GitHub.** Un'azione (`.github/workflows/demo.yml`) costruisce su un runner ARM le stesse immagini di `deploy.yml` dal commit di `main` con la CI verde e le pubblica su GitHub Container Registry (`ghcr.io/axiast2026-debug/astax-demo`, un pacchetto solo con un'etichetta per servizio), pubbliche come il repository. Le immagini non contengono segreti né indirizzi (nessuna variabile `NEXT_PUBLIC_`): la configurazione arriva tutta all'avvio. Il server non compila niente. Dal 2026-10-29 (Dan) la CI la chiama da sola a ogni push su `main` appena «check» è verde, senza aspettare le prove dal browser, che girano insieme in 4 parti e restano obbligatorie per la produzione; si può ancora lanciare a mano.
3. **La demo non è produzione, per costruzione.** API, worker e attrezzi (migrazioni, seed) girano con `NODE_ENV=development`, `DEV_TOOLS=true` e i fornitori finti: le pagine di prova di firma e pagamento, l'orologio spostabile e le offerte di prova funzionano, e il blocco della produzione (`release:check`) rifiuta questa configurazione com'è già oggi. Il sito e il back office girano dalle loro build di produzione di Next.js.
4. **Strumenti di sviluppo solo nel back office** (risposta 3A). Il back office li mostra quando `DEV_TOOLS=true`, senza più guardare `NODE_ENV`, che nella build di produzione di Next.js vale sempre `production`. Il controllo vero resta nell'API (regola 3): gli endpoint di sviluppo rispondono 404 se `DEV_TOOLS` è spento o se `NODE_ENV` è `production`. In produzione la variabile del back office resta spenta e, se anche fosse accesa, i pulsanti non farebbero niente.
5. **Email vere con Resend** (risposta 5A). Nuovo adattatore `ResendEmailSender` (API HTTP di Resend), scelto con `EMAIL_PROVIDER=resend`; Keycloak manda i codici di accesso con l'SMTP di Resend. Mittente su `astaxapp.com`, con i record DNS di Resend su Cloudflare. Le email verso indirizzi riservati ai test (`.test`, `example.com`… RFC 2606), cioè gli utenti inventati del seed, restano su Mailpit (`TestAddressRouter`): a Resend arrivano solo indirizzi veri, come quelli degli agenti invitati. Gli altri fornitori restano finti (regola 9). La chiave di Resend vive solo nel file dei segreti del server.
6. **Rete.** Cloudflare fa da DNS e da proxy (HTTPS, protezione). Sul server Caddy riceve solo da Cloudflare (firewall sulle porte 80 e 443 aperto ai soli indirizzi di Cloudflare), prende da solo i certificati di Let's Encrypt e smista: `demo.astaxapp.com` (sito), `bo.astaxapp.com` (back office), `accesso.astaxapp.com` (Keycloak), `api.astaxapp.com` (API e canale in tempo reale). Nessun Cloudflare Access (risposta 4B): entra chi ha il link e un utente di prova. Tutte le risposte hanno `X-Robots-Tag: noindex`. SSH solo con chiave, senza password, con aggiornamenti di sicurezza automatici.
7. **Keycloak in modalità produzione** (`start`, non `start-dev`) con il nome pubblico `https://accesso.astaxapp.com` e le intestazioni del proxy; il realm della demo ha gli indirizzi di ritorno dei domini della demo, scritti all'avvio dalla configurazione del server.
8. **Segreti solo sul server** (regola 12). Uno script del server genera le chiavi e le password interne con `openssl rand` in `/opt/astax/.env` (permessi 600), senza stamparle. La chiave di Resend la incolla Dan in una finestra del terminale, che la scrive nello stesso file: mai nella chat, mai nel repository.
9. **Si vede che è una demo.** Una fascia «DEMO: usare solo dati inventati» in ogni pagina del sito e del back office, accesa da `DEMO_NOTICE=true`. Dati del seed sintetici e utenti di prova (regola 11); testi legali ancora segnaposto.
10. **Copie e aggiornamenti.** Backup giornaliero di Hetzner più un `pg_dump` notturno tenuto 7 giorni sul server. Gli aggiornamenti si portano sulla demo dal PC di Dan via SSH, solo quando Dan lo chiede; un `db:reset` sulla demo solo con il suo consenso.

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| Tutto su Vercel | Non fa girare servizi sempre accesi né Docker: niente worker, Keycloak, Temporal, canale in tempo reale |
| Vercel per i siti e Hetzner per il resto | Due posti da controllare, e la parte su Hetzner ha comunque bisogno di un indirizzo; Dan ha scelto il solo Hetzner |
| Railway | Costo a consumo più alto per otto servizi sempre accesi |
| Il collaudo AWS della fase 8 | Richiede gli account e i fornitori veri della parte B; la demo serve prima |
| `NODE_ENV=production` con un'eccezione «demo» | Aprirebbe in produzione strade pensate per lo sviluppo: meglio una demo che è sviluppo per costruzione e che il blocco della produzione rifiuta già |
| Cloudflare Tunnel o certificato di origine di Cloudflare | Entrambi chiedono un segreto creato da Dan e portato sul server; Let's Encrypt dietro Cloudflare non ne chiede |

## Conseguenze

- Il back office mostra gli strumenti di sviluppo solo per la variabile: in produzione va lasciata spenta, come le altre (il blocco della produzione la controlla).
- `EMAIL_PROVIDER` accetta `resend` accanto a `ses`: il blocco della produzione lo conta come fornitore vero.
- La documentazione dell'API (`/docs`) e la console di amministrazione di Keycloak (`/admin`) esistono sulla demo, ma Caddy le rifiuta da fuori: si raggiungono solo dal server.
- Tutte le immagini della demo stanno in un solo pacchetto di GitHub, `astax-demo`, con un'etichetta per servizio (`api-<commit>`, `web-<commit>`…): Dan lo rende pubblico una volta sola, e il server le scarica senza chiavi.
- La demo costa circa 5 € al mese più il dominio; si spegne quando parte il collaudo su AWS.
- Con 4 GB e lo swap la demo è più lenta, soprattutto alla prima apertura dopo l'inattività; il «Rescale» di Hetzner porta a un server più grande senza cambiare la configurazione (si alzano solo i limiti di memoria).
