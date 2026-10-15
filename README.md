# AstAx

Piattaforma di aste inverse per i preventivi RC auto.

- Istruzioni di lavoro e regole: [`CLAUDE.md`](CLAUDE.md)
- Specifiche: [`docs/specifiche/`](docs/specifiche/README.md)
- Fasi di sviluppo: [`fasi/`](fasi/)
- Stato del lavoro: [`docs/stato.md`](docs/stato.md)

## Avvio da una macchina pulita

### Requisiti

| Strumento | Versione | Note |
| --- | --- | --- |
| Node.js | 24 LTS (vedi `.nvmrc`) | |
| pnpm | 12 | `corepack enable pnpm` (su Windows senza diritti di amministratore: `corepack enable pnpm --install-directory "%APPDATA%\npm"`) |
| Docker Desktop | recente, con WSL 2 su Windows | Circa 2 GB di memoria per i container |
| Git | recente | |

### Primo avvio

Su Windows, da PowerShell (dove Docker è nel PATH), con Docker Desktop acceso:

```bash
pnpm install
pnpm env:init
pnpm infra:up
pnpm build
pnpm db:migrate
pnpm db:seed
pnpm dev
```

1. `pnpm install` installa le dipendenze.
2. `pnpm env:init` crea `.env` da `.env.example`, con password e chiavi locali generate a caso. Non sovrascrive un `.env` esistente. `.env` non va mai nel repository.
3. `pnpm infra:up` avvia i servizi locali e aspetta che siano pronti. La prima volta compila l'immagine di Keycloak con l'estensione AstAx: qualche minuto.
4. `pnpm build` compila pacchetti e app.
5. `pnpm db:migrate` crea le tabelle.
6. `pnpm db:seed` carica parametri, elenchi, festività, testi legali segnaposto e dati di prova, e crea gli utenti di prova in Keycloak.
7. `pnpm dev` avvia l'API (http://localhost:4000, documentazione su `/docs`), il sito (http://localhost:3000) e il back office (http://localhost:3001).

Controlli: `pnpm check` (lint, tipi, test unitari e di integrazione) e `pnpm test:e2e` (test nel browser; usa i server di `pnpm dev` se sono accesi, altrimenti li avvia).

### Utenti di prova

Solo dati inventati (regola 11 di `CLAUDE.md`).

- **Professionisti e personale AstAx:** password `DEV_USERS_PASSWORD` di `.env`. Al primo accesso si configura il TOTP con un'app di autenticazione (Google Authenticator, Microsoft Authenticator, FreeOTP…).
- **Privati:** entrano con un codice; l'email arriva in Mailpit (http://127.0.0.1:8025).

| Chi | Email | Dove entra |
| --- | --- | --- |
| Privata Giulia Neri (anche Sara Conti, Davide Galli, Elena Sala, Luca Ferri) | `giulia.neri@example.test` | Sito, «Sono un cliente privato» |
| Titolare di Agenzia Uno | `anna.moretti@agenzia-uno.test` | Sito, «Accesso professionisti» |
| Supervisore di Agenzia Uno | `olga.martini@agenzia-uno.test` | Sito, «Accesso professionisti» |
| Operatore di Agenzia Uno | `bianca.ferri@agenzia-uno.test` | Sito, «Accesso professionisti» |
| Marco Rossi, operatore in Agenzia Uno e Agenzia Tre | `marco.rossi@collaboratori.test` | Sito, «Accesso professionisti» |
| Titolare di Broker Demo Srl | `laura.bianchi@broker-demo.test` | Sito, «Accesso professionisti» |
| Operatore di Broker Demo Srl | `paolo.verdi@broker-demo.test` | Sito, «Accesso professionisti» |
| Back office, verifica | `arta.hoxha@astax.test` | Back office |
| Back office, assistenza / contabilità / supervisore | `chiara.lodi@astax.test`, `fabio.serra@astax.test`, `ilaria.volpe@astax.test` | Back office |
| Amministratore | `paola.ricci@astax.test` | Back office |

Le Agenzie da Due a Dieci hanno lo stesso schema (titolare, supervisore e operatore, con dominio `agenzia-due.test` e così via). L'elenco completo è in `packages/db/src/seed/synthetic.ts`.

### Servizi locali

| Servizio | Indirizzo | A cosa serve |
| --- | --- | --- |
| PostgreSQL 18 | `127.0.0.1:5433`, database `astax` | Dati. Utenti: `astax_owner` (migrazioni) e `astax_app` (API, con sicurezza a livello di riga) |
| Redis 8 | `127.0.0.1:6380` | Sessioni delle app web, cache, code |
| Keycloak 26 | http://localhost:8180 | Accesso e secondo fattore (ADR 0002). Console: realm `master`, utente `admin`, password `KEYCLOAK_ADMIN_PASSWORD` di `.env` |
| Temporal | `127.0.0.1:7233`, interfaccia http://127.0.0.1:8233 | Workflow e timer delle aste (dalla fase 3), namespace `astax` |
| SeaweedFS (S3) | http://127.0.0.1:8333 | Documenti (ADR 0003) |
| Mailpit | http://127.0.0.1:8025 | Tutte le email e gli SMS di sviluppo |

Le porte sono diverse da quelle standard (5432, 6379) per non scontrarsi con un PostgreSQL o un Redis già installati sul computer. Si cambiano in `.env`.

### Comandi utili

| Comando | Cosa fa |
| --- | --- |
| `pnpm infra:up` | Avvia i servizi locali |
| `pnpm infra:ps` | Mostra lo stato dei servizi |
| `pnpm infra:down` | Ferma i servizi; i dati restano |
| `docker compose --env-file .env -f infra/docker-compose.yml down -v` | Ferma i servizi e **cancella** i dati locali |
| `pnpm audit:verify` | Controlla la catena di hash del registro attività |
| `pnpm legal:check` | Fallisce finché un testo legale in uso non è validato dal legale: oggi fallisce, ed è giusto così |
