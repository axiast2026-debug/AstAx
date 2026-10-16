# 0001 — Stack e versioni

- **Data:** 2026-10-15
- **Stato:** proposta
- **Fase:** 1

## Contesto

`CLAUDE.md` fissa lo stack e chiede le ultime versioni stabili al momento dell'installazione, fissate nel lockfile. Alcune versioni «ultime» non funzionano ancora insieme, e alcune regole (orologio, testi) vanno fatte rispettare dal lint.

## Decisione

| Strumento | Versione | Nota |
| --- | --- | --- |
| Node.js | 24.15.0 (LTS «Krypton») | In `.nvmrc` ed `engines` |
| pnpm | 12.11.2 | Attivato con corepack; in `packageManager` |
| Turborepo | 2.11.8 | |
| TypeScript | 6.0.3 | Non la 7.0: typescript-eslint 8.71 supporta solo `<6.1` |
| ESLint | 10.12.0, typescript-eslint 8.71.2 | Configurazione flat condivisa in `@astax/config` |
| Prettier | 3.9.10 | |
| Vitest | 5.0.4 | |
| Zod | 4.6.7 | Schemi condivisi tra API, worker e frontend |
| pino | 10.4.0 | Logger di API e worker, sempre dietro `redact` |
| PostgreSQL | 18.6 | Immagine Docker; Prisma 7.10.0 (non l'8, ancora release candidate) con `@prisma/adapter-pg` e `pg` 8.23 |
| Redis | 8.10.2 | Immagine Docker; client `redis` 6.3.0 |
| Keycloak | 26.8.1 | Immagine propria con l'estensione AstAx (ADR 0002) |
| Temporal | CLI 1.9.1 (server 1.32) | Server di sviluppo; SDK dalla fase 3 |
| SeaweedFS | 4.48 | Storage S3 locale (ADR 0003) |
| Mailpit | 1.31.6 | |
| NestJS | 12.1.3 | Con express 5.3, `@nestjs/swagger` 12.0.2, `jose` 6.2.12, `yaml` 2.9.1 |
| Next.js | 16.4.1 | React 19.3.1, next-intl 4.14.9, Tailwind 4.3.3, `openid-client` 6.8.8 (ADR 0004) |
| Testcontainers | 12.2.1 | PostgreSQL vero nei test di integrazione; SeaweedFS nel test di contratto dello storage (fase 2) |
| AWS SDK S3 | 3.1151.0 | `@aws-sdk/client-s3` e `s3-request-presigner`: storage dei documenti, SeaweedFS in locale e S3 in cloud (fase 2) |
| libsodium-wrappers | 0.8.4 | Busta chiusa: `crypto_box_seal` e `crypto_secretbox` (fase 3, ADR 0005) |
| Temporal TypeScript SDK | 1.24.0 | `@temporalio/worker`, `client`, `workflow`, `activity`, `testing`: worker delle aste (fase 3, ADR 0008) |
| Playwright | 1.64.1 | Chromium per i test end-to-end |

Le dipendenze delle fasi successive si aggiungono a questa tabella quando entrano, nel passo che le usa.

Convenzioni:

- Pacchetti interni in ESM, compilati con `tsc` in `dist/` ed esposti per sottopercorso (`@astax/shared/settings`, `/permissions`, `/logging`, `/audit`), così il frontend non importa codice solo per Node.
- Regole di lint proprie in `@astax/config`: `astax/no-system-time` vieta `Date.now()`, `Date()` e `new Date()` senza argomenti (esente solo `src/clock/system-clock.ts`); `astax/no-ui-literals` vieta testi nei componenti JSX. `new Date(valore)` resta permesso perché legge una data, non l'orologio.
- Le date tecniche `createdAt`/`updatedAt` le mette il database; ogni ora di business (invio, chiusura, accettazione…) viene da `Clock` (dubbio 7 approvato da Dan).

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| TypeScript 7.0 | Non supportato da typescript-eslint; lint senza regole di tipo |
| Regola `react/jsx-no-literals` | Una dipendenza in più e meno precisa sugli attributi (`placeholder`, `alt`, `aria-label`) |
| Pacchetti interni non compilati | Node non esegue TypeScript dentro `node_modules`; servirebbe un bundler anche per API e worker |

## Conseguenze

- Il passaggio a TypeScript 7 si rivaluta quando typescript-eslint lo supporta (debito tecnico).
- Ogni pacchetto deve essere compilato prima dei pacchetti che lo usano: Turborepo lo fa da sé (`dependsOn: ["^build"]`).
