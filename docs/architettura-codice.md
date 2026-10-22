# Architettura del codice

Come si organizza il codice nel monorepo. Le scelte di prodotto e di infrastruttura sono in [`specifiche/08-architettura-tecnica.md`](specifiche/08-architettura-tecnica.md); qui c'è come tradurle in cartelle, moduli e convenzioni.

## Repository

```
apps/
  web/        Next.js: privati (mobile, PWA), broker e agenzie (desktop)
  admin/      Next.js: back office e amministratore, dominio separato
  api/        NestJS: API REST, WebSocket, webhook
  worker/     Worker Temporal: workflow e attività
packages/
  shared/     Tipi, schemi Zod, codici di stato, funzioni di dominio pure
  db/         Schema Prisma, migrazioni, client, script di seed
  adapters/   Porte e adattatori (finti e veri) verso i fornitori
  ui/         Componenti condivisi (shadcn/ui, Tailwind), token di design
  config/     Configurazioni condivise di TypeScript, ESLint, Prettier
infra/        Terraform (AWS), configurazione di Keycloak, docker compose
docs/         Specifiche, regole, decisioni, stato
fasi/         Le otto fasi di sviluppo
seed/         Parametri, elenchi, pacchetti, festività, notifiche
```

## Livelli dell'API

Dentro `apps/api` ogni area è un modulo NestJS con quattro livelli:

1. **Controller**: valida l'input con Zod, legge il contesto (`X-AstAx-Context`), chiama un caso d'uso. Niente logica.
2. **Caso d'uso** (servizio applicativo): controlla i permessi, apre la transazione, carica gli aggregati, chiama il dominio, salva, scrive `DomainEvent`, `OutboxEvent` e `AuditLog`.
3. **Dominio**: funzioni pure in `packages/shared/src/domain` (calendario lavorativo, fee, ordinamento e classifica, migliore offerta per compagnia, garanzie, conformità al pacchetto, filtri, transizioni di stato, filtro delle note, codice fiscale). Nessun accesso a database, rete o orologio di sistema: ricevono tutto come argomenti.
4. **Repository**: Prisma, sempre con il contesto dell'organizzazione impostato per la sicurezza a livello di riga.

Moduli: `auth`, `organizations`, `users`, `legal`, `settings`, `lists`, `audit`, `customers`, `requests`, `documents`, `verification`, `auctions`, `offers`, `presentation`, `ai-comparison`, `acceptance`, `payments`, `policies`, `penalties`, `accounting` (rimesse, fatture, riconciliazione), `notifications`, `support` (reclami, segnalazioni, richieste sui dati), `reports`, `webhooks`.

## Workflow (Temporal)

- `QuoteRequestWorkflow`, uno per richiesta, con id `quote-request-{id}`. Segnali: `approved`, `auctionExtended`, `invitationsAdded`, `auctionCancelled`, `acceptanceSigned`, `paymentConfirmed`, `paymentFailed`, `policyIssued`, `issuanceProblem`, `secondOfferConfirmed`, `reconfirmationRequested`, `requestCancelled`. Timer: chiusura, rabbocco a metà asta, promemoria di chiusura, scadenze delle garanzie, promemoria a 2 giorni, termine di emissione, risposta alla seconda offerta.
- `PolicyWorkflow`, uno per polizza: questionario post-vendita, rinnovo a 30 giorni, scadenza.
- Pianificazioni Temporal (fuso Europe/Rome): rimesse del lunedì, fatture mensili ai broker, import RUI, cancellazioni per conservazione, controllo notturno CloudTrail-chiusure.
- Le attività fanno il lavoro (database, adattatori) e sono idempotenti. Payload solo con identificativi (SIC-06).
- I tempi in ore lavorative si calcolano con il calendario di dominio e diventano timer con una data assoluta.
- Test con l'ambiente di test di Temporal a tempo accelerato.

## API

- REST con documento OpenAPI generato dal codice; il client dei frontend si genera da quel documento.
- Errori in formato `application/problem+json` con un codice stabile (`SEALED_BID`, `AUCTION_CLOSED`, `CLAIMED_BY_COLLEAGUE`…), messaggi in italiano lato interfaccia.
- Paginazione a cursore. Chiave di idempotenza obbligatoria su pagamenti, rimborsi e invii di offerte.
- WebSocket (Socket.IO con adattatore Redis) per contatori e cambi di stato: i messaggi dicono solo cosa è cambiato; il client rilegge dall'API.
- Webhook dei fornitori in `/webhooks/{fornitore}`, con verifica della firma.

## Frontend

- Next.js con App Router e TypeScript strict. Dati con TanStack Query e il client generato; moduli con React Hook Form e gli stessi schemi Zod dell'API.
- Testi solo nei file di traduzione (`next-intl`), in italiano, l'unica lingua (ADR 0017). Nessun testo scritto nei componenti.
- `packages/ui`: componenti shadcn/ui con i token di design (blu notte `#0B1B33`, arancio `#FF6A1A`, verde `#12A150`, grigi caldi, contrasto almeno AA), font Inter con cifre tabellari per i prezzi.
- Area privati mobile first, installabile (PWA con Serwist, notifiche Web Push). Aree professionali pensate per il desktop.
- Date e importi sempre attraverso funzioni di formattazione comuni (fuso Europe/Rome, euro con due decimali).

## Ambiente locale

`infra/docker-compose.yml` con PostgreSQL, Redis, Keycloak (realm importato), server di sviluppo Temporal con interfaccia web, MinIO, Mailpit. Un solo comando avvia tutto; un comando carica i seed e i dati sintetici.

Dati sintetici: generatore in `packages/db/src/synthetic` con persone, codici fiscali validi, targhe, compagnie inventate («Compagnia Alfa», «Compagnia Beta»…), agenzie, broker e privati di prova, sempre gli stessi a parità di seme.

## Test

| Livello | Strumento | Dove | Cosa |
| --- | --- | --- | --- |
| Unità | Vitest | accanto al codice (`*.test.ts`) | Funzioni di dominio, una o più prove per regola con il codice nel nome |
| Integrazione | Vitest + Testcontainers (PostgreSQL) | `apps/api/test/integration` | Casi d'uso, permessi, sicurezza a livello di riga, registro |
| Workflow | Ambiente di test di Temporal | `apps/worker/test` | Tempi, timer, segnali, chiusura |
| Contratto | Vitest | `packages/adapters/test/contract` | Stessa suite per adattatore finto e sandbox |
| End-to-end | Playwright | `tests/e2e` | Scenari S01-S10 e percorsi principali per ruolo |

`pnpm check` esegue lint, controllo dei tipi, test unitari e di integrazione. La CI esegue anche gli end-to-end.
