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

```bash
pnpm install
pnpm env:init
pnpm infra:up
pnpm check
```

1. `pnpm install` installa le dipendenze.
2. `pnpm env:init` crea `.env` da `.env.example`, con password e chiavi locali generate a caso. Non sovrascrive un `.env` esistente. `.env` non va mai nel repository.
3. `pnpm infra:up` avvia i servizi locali e aspetta che siano pronti.
4. `pnpm check` esegue lint, controllo dei tipi e test.

### Servizi locali

| Servizio | Indirizzo | A cosa serve |
| --- | --- | --- |
| PostgreSQL 18 | `127.0.0.1:5433`, database `astax` | Dati. Utenti: `astax_owner` (migrazioni) e `astax_app` (API e worker, con sicurezza a livello di riga) |
| Redis 8 | `127.0.0.1:6380` | Cache, code, WebSocket |
| Keycloak 26 | http://127.0.0.1:8180 | Accesso e secondo fattore. Amministrazione: utente `admin`, password `KEYCLOAK_ADMIN_PASSWORD` in `.env` |
| Temporal | `127.0.0.1:7233`, interfaccia http://127.0.0.1:8233 | Workflow e timer delle aste, namespace `astax` |
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
| `pnpm check` | Lint, tipi, test unitari e di integrazione |

Le credenziali degli utenti di prova si aggiungono qui con il seed (fase 1, passo 4).
