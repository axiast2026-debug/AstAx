# Dichiarazione dell'intermediario sul consenso dei propri clienti

**Bozza n. 1 del 22/10/2026 — [DA VALIDARE — LEGALE]**

| | |
| --- | --- |
| Chiave del documento | `broker-clients-declaration` |
| Chi la firma | Il titolare dell'intermediario richiedente: broker (sez. B) o intermediario di sez. E che lavora per un broker; agenzia (sez. A) che chiede preventivi per i propri clienti (ADR 0015) |
| Quando | All'ingresso (o al primo accesso dopo l'introduzione del documento); vale per tutta l'organizzazione e per i suoi utenti; di nuovo a ogni nuova versione |
| Fonti | `packages/db/src/seed/legal-placeholders.ts` (righe 72-81); `docs/piano-broker.md` (risposta 3 di Dan e «Da sapere sul passo 1»); `docs/adr/0014`, `0015`; `docs/regole-di-dominio.md` (LEG-01, LEG-04, VIS-13); `docs/punti-aperti.md` («Dichiarazione unica del broker»); `docs/domande-aperte.md` (7, 8) |

> Il documento non compare nella tabella della scheda 09, §7 (aggiunto il 2026-10-21): chi lo accetta e quando sono ricavati da `legal-placeholders.ts` e da `docs/piano-broker.md`.

> **Nota per il legale:** questione principale (`docs/punti-aperti.md`): se basta una dichiarazione firmata una volta dall'intermediario («ho il permesso dei miei clienti») al posto del consenso di ogni cliente alla condivisione dei dati con le agenzie (LEG-04). Oggi, nel codice, ogni richiesta dell'intermediario registra il consenso come «coperto dalla dichiarazione», con il riferimento alla firma; restano possibili anche il link di consenso al cliente e il caricamento di un consenso firmato. La risposta dipende dalla base giuridica scelta per la condivisione (documento 02, Nota al § 4) e dai ruoli privacy (documento 10).

---

Il/la sottoscritto/a {{nome e cognome}}, in qualità di {{titolare / legale rappresentante}} di {{ragione sociale}}, iscritta al RUI sez. {{A / B / E}} n. {{numero RUI}} («Intermediario»),

**dichiara**, per sé e per tutti gli utenti dell'Intermediario abilitati sulla piattaforma AstAx, che per ogni richiesta di preventivo che l'Intermediario inserirà sulla piattaforma, anche tramite caricamento di lotti:

1. il cliente ha conferito all'Intermediario l'incarico di cercare un preventivo RC auto e lo ha autorizzato a usare a tal fine la piattaforma AstAx;
2. l'Intermediario ha fornito al cliente, e agli eventuali altri interessati i cui dati inserisce (contraente, proprietario, conducenti), l'informativa sul trattamento dei dati che comprende la comunicazione ad AstAx e alle agenzie assicurative invitate all'asta, nel testo messo a disposizione da AstAx [o equivalente];
3. il cliente ha acconsentito alla comunicazione dei dati e dei documenti della richiesta alle agenzie invitate all'asta e ai loro collaboratori, per il solo calcolo dell'offerta, sapendo che telefono ed email saranno comunicati solo all'agenzia di cui accetterà e pagherà l'offerta;
4. i dati e i documenti inseriti sono veri e sono stati raccolti lecitamente;

**si impegna** a:

5. conservare la prova dell'incarico, dell'informativa e del consenso di ogni cliente per [DURATA CONSERVAZIONE PROVA] e a esibirla ad AstAx entro [TERMINE] giorni dalla richiesta;
6. registrare subito sulla piattaforma la revoca del consenso di un cliente, sapendo che da quel momento non si aprono nuove aste per lui;
7. non inserire richieste per clienti per i quali non abbia ottenuto il consenso;
8. tenere indenne AstAx da ogni danno, sanzione o pretesa derivante dalla non veridicità di questa dichiarazione;

**prende atto** che:

9. la dichiarazione vale per tutto l'Intermediario e per tutti i suoi utenti fino a revoca o nuova versione; ogni richiesta registra il riferimento a questa dichiarazione;
10. AstAx può chiedere in ogni momento, anche a campione, la prova di cui al punto 5 e, in mancanza, sospendere le richieste dell'Intermediario.

Data e ora {{data e ora}} — versione {{versione}} — accettazione registrata con indirizzo IP.

> **Nota per il legale:** i punti 5 e 10 (prova a richiesta e controlli a campione) sono una proposta di garanzia non presente nelle fonti: il codice oggi non prevede né la richiesta di prova né la sospensione per mancata prova. Se il legale li conferma, vanno aggiunti al codice.
