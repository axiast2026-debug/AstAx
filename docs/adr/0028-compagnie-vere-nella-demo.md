# 0028 — Compagnie vere e loghi nella demo

- **Data:** 2026-10-30
- **Stato:** accettata (Dan, 2026-10-30: «Sì, scrivi l'ADR» per le compagnie vere nella demo; «Dentro il repo» per i loghi)
- **Riferimenti:** regola 11 e regola VIS di `CLAUDE.md` e `docs/regole-di-dominio.md`; ADR 0020 (demo online), ADR 0022 (ANIA vera nella demo); `seed/compagnie-demo.json`; `seed/loghi/FONTI.md`

## Contesto

Nella demo le offerte arrivano da «Compagnia Alfa», «Compagnia Beta»…: chi la prova non riconosce il prodotto. Dan vuole le compagnie vere, con il loro logo, accanto alle offerte. La regola 11 ammetteva solo dati sintetici, con la sola eccezione della lettura ANIA nel back office (ADR 0022). Il repository è pubblico (2026-10-15): i file dei loghi messi nel repository sono scaricabili da chiunque.

## Decisione

1. **Seconda eccezione alla regola 11, solo per le compagnie.** Con `DEMO_COMPANIES=true` la seed carica le 22 compagnie di `seed/compagnie-demo.json` **al posto** delle quattro inventate: nessuna compagnia inventata nella demo, in nessuna schermata. Agenzie, persone e targhe restano inventate. Senza la variabile (sviluppo, test, CI) restano solo le compagnie inventate.
2. **Gli adattatori finti seguono la stessa scelta.** Visura targa, ANIA, registro RUI e lettore dei documenti finti usano i nomi veri quando `DEMO_COMPANIES=true` (`fakeCompanyNames` in `packages/shared`), così nella demo nemmeno la compagnia attuale del veicolo o il mandato dal RUI è inventato.
3. **I loghi stanno nel repository**, in `seed/loghi/`, per scelta di Dan, sapendo che il repository è pubblico. Per ogni logo `seed/loghi/FONTI.md` dice da dove viene, quando è stato scaricato e che il marchio è del titolare. Nessun logo disegnato, ricolorato o ritagliato.
4. **`InsuranceCompany` ha `logoKey` e `website`**, entrambi facoltativi. Il file sta nello storage S3 dei documenti, sotto `public/companies/`: non è un dato personale. Il browser non legge lo storage: l'API dà il logo con `GET /companies/:id/logo` senza accesso, e sito e back office lo servono dal proprio indirizzo (`/loghi/:id`), così la Content-Security-Policy resta `img-src 'self'` e lo storage resta chiuso. Lo stesso percorso vale in sviluppo e in cloud.
5. **Dove si vede il logo:** solo accanto a un'offerta reale di un'agenzia con mandato per quella compagnia (offerte del privato e del broker, confronto con AI, riepilogo dell'accettazione, modulo dell'offerta dell'agenzia) e nel pannello delle compagnie del back office. Mai in home, pagine pubbliche o marketing. Il cliente vede il logo della compagnia, mai nome o logo dell'agenzia prima dell'accettazione (VIS). Senza logo si mostra il nome con un segnaposto neutro.
6. **Nota legale** nel piè di pagina delle schermate con le offerte, chiave `legal.trademarks`: i marchi sono dei titolari e AstAx non è partner delle compagnie.

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| Loghi fuori dal repository, caricati solo sullo storage del server della demo | Proposta; Dan ha scelto di tenerli nel repository |
| Compagnie vere anche in sviluppo e nei test | La regola 11 resta per tutto il resto: i test non dipendono da marchi di terzi |
| Bucket pubblico con URL non firmati letti dal browser | Apre lo storage all'esterno e chiede un'eccezione alla Content-Security-Policy; il passaggio dall'API dà lo stesso risultato senza nuove risorse |

## Conseguenze

- I marchi delle compagnie sono pubblicati con il repository: se un titolare lo chiede, si tolgono il file e la riga di `FONTI.md`, e la schermata mostra il segnaposto. Punto per il legale in `docs/punti-aperti.md`.
- Per accendere le compagnie vere sul server della demo serve `DEMO_COMPANIES=true` in `demo.env` e la seed di `deploy.sh`. Su un database che ha già le compagnie inventate la seed le rinomina in quattro compagnie vere (Alfa → Unipol, Beta → Generali, Gamma → Allianz, Delta → AXA), così mandati, prodotti, offerte e polizze già creati le seguono; i testi già scritti nelle richieste (per esempio la compagnia attuale letta dall'attestato) restano come sono finché il database della demo non si azzera (scelta di Dan, non automatica).
- Tre compagnie non hanno logo (siti non raggiungibili allo scarico): si vedono con il nome e il segnaposto finché il back office non carica il file dal pannello delle compagnie.
