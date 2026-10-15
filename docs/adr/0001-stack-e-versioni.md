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

Le altre dipendenze (NestJS, Prisma, Next.js, Keycloak, Temporal…) si aggiungono a questa tabella quando entrano, nel passo che le usa.

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
