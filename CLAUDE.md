# AstAx — istruzioni per Claude Code

## Cos'è AstAx

AstAx è una piattaforma italiana di aste inverse per i preventivi RC auto, gestita da AstAx, società iscritta al RUI come broker (sez. B).

- Chi chiede un preventivo: privati (consumatori) e broker per i propri clienti.
- Chi offre: agenzie assicurative (sez. A), con i loro sub-agenti (sez. E) che offrono sempre a nome dell'agenzia.
- Il back office di AstAx verifica ogni richiesta; poi parte un'asta a busta chiusa di durata scelta dal richiedente (1, 2, 5 o 24 ore lavorative).
- Ogni offerta è vincolante e ha una data di prezzo garantito. Alla chiusura il richiedente vede la migliore offerta per ogni compagnia; i privati possono chiedere un confronto qualità/prezzo con AI.
- Il cliente sceglie, firma con FEA e paga AstAx; l'agenzia vincitrice riceve i contatti ed emette; AstAx rimette il premio all'agenzia ogni settimana.
- Ricavi, solo a polizza acquistata, tutti esenti IVA: privato 30 € (35 € con il confronto AI; 15 € o 20 € sotto i 200 € di premio); broker 30 €; agenzia 15 €.
- Trasparenza finale: quando il cliente accetta, ogni agenzia vede le prime due offerte anonime e la propria posizione.
- Il progetto parte da zero. Nessuna integrazione con sistemi di altre società (in particolare GD Brokers e CorteXa).

## Lingue

- Documenti e interfaccia in italiano; il back office anche in albanese. Nessun testo dell'interfaccia scritto nel codice: solo file di traduzione.
- Codice, nomi, commenti e messaggi di commit in inglese. I nomi di dominio sono quelli di [`docs/glossario.md`](docs/glossario.md), senza sinonimi.
- Con Dan si parla in italiano, in modo semplice: è esperto di assicurazioni, non di programmazione.

## Dove sono le cose

| Cosa | Dove |
| --- | --- |
| Specifiche funzionali (cosa vede e fa ogni utenza, processi) | `docs/specifiche/` |
| Regole di dominio con i codici (BC, VIS, OFF, ASTA, GAR, PRES, FEE, PAG, EMI, CONT, CLA, SIC, LEG) | `docs/regole-di-dominio.md` |
| Decisioni prese nel pacchetto per i dettagli mancanti | `docs/decisioni-aggiunte.md` |
| Ruoli e permessi | `docs/permessi.md` |
| Modello dati e stati | `docs/modello-dati.md` |
| Busta chiusa | `docs/busta-chiusa.md` |
| Fornitori e adattatori | `docs/adattatori.md` |
| Organizzazione del codice | `docs/architettura-codice.md` |
| Notifiche | `docs/notifiche.md`, `seed/notifiche.yaml` |
| Scenari di accettazione S01-S10 | `docs/scenari-accettazione.md` |
| Fasi di sviluppo | `fasi/01-…` → `fasi/08-…` |
| Valori iniziali (parametri, elenchi, pacchetti, festività) | `seed/` |
| Stato del lavoro, debiti tecnici, ADR | `docs/stato.md`, `docs/adr/` |
| Domande per Dan | `docs/domande-aperte.md` |
| Punti per legale e commercialista | `docs/punti-aperti.md` |

Se due fonti non coincidono vale, in quest'ordine: le regole non violabili qui sotto; `docs/regole-di-dominio.md`; `docs/decisioni-aggiunte.md`; `docs/specifiche/09-decisioni-e-valori-predefiniti.md`; le altre specifiche. Se resta un dubbio di business, non indovinare: scrivi la domanda in `docs/domande-aperte.md`, usa il valore più prudente e dillo a Dan a fine sessione.

## Stack

- TypeScript strict ovunque; monorepo pnpm + Turborepo; Node.js nella versione LTS attiva.
- `apps/web` e `apps/admin`: Next.js (App Router), Tailwind, componenti di `packages/ui` (shadcn/ui), TanStack Query, React Hook Form + Zod, next-intl, PWA con Serwist e Web Push per i privati.
- `apps/api`: NestJS, REST con OpenAPI, WebSocket (Socket.IO con Redis).
- `apps/worker`: Temporal (TypeScript SDK).
- `packages/db`: PostgreSQL con Prisma, sicurezza a livello di riga. `packages/shared`: tipi, schemi Zod, funzioni di dominio pure. `packages/adapters`: porte e adattatori finti e veri.
- Keycloak per identità e secondo fattore; Redis; S3 (MinIO in locale); KMS; Mailpit in locale.
- Test: Vitest, Testcontainers, ambiente di test di Temporal, Playwright. CI: GitHub Actions. Infrastruttura: Terraform su AWS `eu-south-1` (Milano).
- Versioni: le ultime stabili al momento dell'installazione, fissate nel lockfile e annotate nell'ADR 0001. Una nuova dipendenza si aggiunge solo se serve davvero, e si spiega nel messaggio di commit.

## Comandi

Li crea la fase 1; da allora questa sezione va tenuta aggiornata.

| Comando | Cosa fa |
| --- | --- |
| `pnpm env:init` | Crea `.env` da `.env.example` con valori locali casuali (mai sovrascrive) |
| `pnpm infra:up` | Avvia PostgreSQL (5433), Redis (6380), Keycloak (8180), Temporal (7233, UI 8233), storage S3 SeaweedFS (8333, ADR 0003), Mailpit (8025) e aspetta che siano pronti |
| `pnpm infra:down` | Ferma i servizi locali, senza cancellare i dati |
| `pnpm install` | Installa le dipendenze |
| `pnpm db:migrate` | Applica le migrazioni (come `astax_owner`) |
| `pnpm db:seed` | Carica parametri, elenchi, festività, testi legali segnaposto e dati sintetici, e crea gli utenti di prova in Keycloak (`keycloak:sync`). Si può rilanciare |
| `pnpm db:reset` | Ricrea il database, applica le migrazioni, carica seed e dati sintetici. Prisma chiede il consenso esplicito di Dan quando lo lancia un agente AI |
| `pnpm keycloak:sync` | Solo sviluppo: utenti di prova in Keycloak e durate di sessione dai parametri |
| `pnpm dev` | Avvia web (3000), admin (3001), api (4000) e il worker delle aste (Temporal, ADR 0008) in sviluppo |
| `pnpm check` | Lint, tipi, test unitari e di integrazione (serve Docker acceso): deve essere verde prima di ogni commit |
| `pnpm build` | Compila pacchetti e app, comprese le build di produzione di Next.js |
| `pnpm test:e2e` | Test end-to-end con Playwright (ambiente locale acceso e `pnpm db:seed` fatto) |
| `pnpm audit:verify` | Controlla la catena di hash del registro attività |
| `pnpm legal:check` | Fallisce se un testo legale in uso non è validato |
| `pnpm reference:municipalities` | Rigenera `seed/comuni.csv` dall'elenco ISTAT dei comuni (scarica il file; oppure gli si passa un CSV già scaricato) |

Su Windows Docker Desktop è installato nella cartella dell'utente: i comandi che usano Docker (`infra:*`, `check`, `test:e2e`) vanno lanciati da PowerShell, dove Docker è nel PATH.

## Regole che non si violano mai

1. **Busta chiusa.** Prima della chiusura nessuno legge le offerte altrui: né le altre agenzie, né il richiedente, né back office o amministratore, né chi ha accesso al database. Il contenuto si cifra all'arrivo; solo il worker lo decifra alla chiusura. Ogni tentativo di lettura riceve 403 ed è registrato. Dettagli: `docs/busta-chiusa.md`.
2. **Contatti del cliente.** Telefono ed email del cliente arrivano a un'agenzia solo quando vince e il pagamento è confermato. Non compaiono mai prima in schermate, risposte API, esportazioni, notifiche o log. `quoteData` non li contiene per costruzione.
3. **Permessi nel backend.** Ogni endpoint controlla ruolo, contesto (`X-AstAx-Context`) e organizzazione, con negazione predefinita. La sicurezza a livello di riga di PostgreSQL è la seconda linea. Nascondere un pulsante non è un controllo.
4. **Registro accessi.** Ogni apertura di dati o documenti di un cliente, ogni azione sensibile e ogni accesso negato finisce nel registro, che è solo in aggiunta e con catena di hash.
5. **Denaro.** Importi in centesimi interi (`...Cents`); massimali e capitali in euro interi (`...Eur`). Mai numeri decimali per il denaro.
6. **Tempo.** Date in UTC nel database, mostrate nel fuso di Roma. L'ora la dà solo `Clock` (nei workflow, il tempo di Temporal). Le ore lavorative si calcolano solo con il calendario di dominio.
7. **Parametri.** Ogni numero di business (durate, fee, soglie, penali, pesi) viene dai parametri, mai scritto nel codice. Un'asta usa i parametri in vigore alla sua apertura.
8. **Niente dati sensibili dove non servono.** Log, errori, analisi, payload di Temporal, URL e notifiche contengono identificativi, non dati personali, prezzi di offerte o documenti.
9. **Fornitori solo tramite adattatori.** Ogni fornitore ha una porta e un adattatore finto; test e sviluppo usano solo i finti.
10. **Testi legali solo dall'archivio con versioni.** Finché il legale non li valida mostrano «[DA VALIDARE — LEGALE]» e la produzione non parte.
11. **Solo dati sintetici** in sviluppo, test e collaudo. Compagnie inventate («Compagnia Alfa»…), persone e targhe inventate.
12. **Segreti mai nel repository**, mai nei log, mai nella chat. In locale `.env` (ignorato da git); in cloud AWS Secrets Manager.
13. **Strumenti di sviluppo** (orologio spostabile, timer anticipati, offerte di prova) solo con `DEV_TOOLS=true`, mai in produzione.

## Come lavoriamo

- Una fase alla volta, nell'ordine. Si parte con `/fase N` (o leggendo `fasi/0N-…`): prima il piano, poi l'approvazione di Dan, poi il lavoro.
- Passi piccoli. Ogni passo ha i suoi test e un commit con un messaggio chiaro. Niente commit con `pnpm check` rosso; niente test disattivati per farli passare.
- Prima di modificare un'area, rileggi le regole che la riguardano e cita i codici nei test.
- Se una scelta tecnica non è nelle specifiche o se ne discosta, scrivi un ADR in `docs/adr/` prima di procedere.
- Alla fine di ogni sessione aggiorna `docs/stato.md`: cosa hai fatto, cosa resta, come provarlo, debiti tecnici.
- La fase si chiude con `/chiudi-fase N`: tutti i criteri verificati, con il sottoagente `verificatore` come controllo indipendente, e la demo per Dan descritta in `docs/stato.md`.
- Push: dal 2026-10-15 Dan autorizza in modo permanente i push su `https://github.com/axiast2026-debug/AstAx` (ramo `main` e rami di lavoro), solo con `pnpm check` verde. Niente `push --force`.
- Il repository è pubblico per scelta di Dan (2026-10-15): mai segreti, dati reali o credenziali nei file, nei commit, nei log della CI.
- Non creare risorse cloud e non usare credenziali vere senza che Dan lo chieda.

## Come si scrivono i test

| Cosa | Dove e come |
| --- | --- |
| Funzioni di dominio | Vitest accanto al codice; almeno un test per regola, con il codice della regola nel nome (`it("GAR-01 …")`) |
| Casi d'uso API, permessi, sicurezza a livello di riga, registro | Vitest + Testcontainers con PostgreSQL vero e adattatori finti |
| Workflow e tempi | Ambiente di test di Temporal a tempo accelerato; orologio controllabile |
| Adattatori | Suite di contratto unica per finto e sandbox |
| Percorsi utente e scenari | Playwright in `tests/e2e`; ogni scenario S01-S10 ha il suo file |
| Bug | Prima un test che lo riproduce, poi la correzione |

I permessi si testano a tabella, da `docs/permessi.md`: per ogni ruolo le azioni consentite e quelle vietate.

## Quando una fase è finita

1. `pnpm check` e i test end-to-end della fase sono verdi, in locale e in CI.
2. Ogni criterio di accettazione del file della fase ha una prova (test, comando o schermata).
3. Il sottoagente `verificatore` ha controllato criteri e regole non violabili senza trovare problemi aperti.
4. `docs/stato.md` è aggiornato, con la demo per Dan.
5. Dan ha visto la demo e ha detto che va bene.
