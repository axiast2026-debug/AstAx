# Condizioni del servizio di firma FEA

**Bozza n. 1 del 22/10/2026 — [DA VALIDARE — LEGALE]**

| | |
| --- | --- |
| Chiave del documento | `fea-terms` |
| Chi lo accetta | Il privato; il documento non ha canale fisso nel codice (`channel: null`), quindi vale anche per il cliente dell'intermediario che firma dal link |
| Quando | Alla prima firma, prima di firmare qualunque documento (09 §7) |
| Fonti | `docs/specifiche/00` (Ruolo 2: «FEA con OTP»), `03`, `09` §6-7; `docs/regole-di-dominio.md` (LEG-01, LEG-05, SIC-05); `docs/punti-aperti.md` («Firma FEA»); `docs/privacy/mappa-dati.md`; `docs/privacy/fornitori.md`; `docs/glossario.md`; DPCM 22 febbraio 2013 (regole tecniche sulle firme elettroniche), in particolare artt. 55-61; d.lgs. 82/2005 (Codice dell'amministrazione digitale) |

> Convenzioni: [MAIUSCOLO] = dato da fornire.

> **Nota per il legale:** obblighi di AstAx come soggetto che eroga la FEA (`docs/punti-aperti.md`, «Firma FEA»). La bozza assume che AstAx sia il soggetto che eroga la soluzione di firma ai propri clienti per motivi istituzionali, societari o commerciali (art. 55, comma 2, lett. a, DPCM 22/02/2013) e che la soluzione tecnica sia fornita da [FORNITORE FEA]. Va confermato lo schema e verificato ogni obbligo dell'art. 57.

---

## Art. 1 — Cos'è il servizio

1.1 Il servizio consente al Cliente di firmare sulla piattaforma AstAx, con **firma elettronica avanzata** (FEA), i documenti necessari all'acquisto della polizza: la Lettera di incarico ad AstAx e gli altri documenti che la Piattaforma indica di volta in volta.

1.2 Il servizio è erogato da [RAGIONE SOCIALE] («AstAx») con la soluzione tecnologica di [FORNITORE FEA]. È gratuito.

1.3 La firma elettronica avanzata soddisfa il requisito della forma scritta e ha l'efficacia prevista dall'art. 20 del d.lgs. 82/2005 e dall'art. 2702 del codice civile.

## Art. 2 — Identificazione del firmatario

2.1 Prima della prima firma AstAx identifica il Cliente in modo certo tramite: i dati anagrafici e il documento d'identità caricati nella richiesta e verificati dal back office; il numero di telefono e l'indirizzo email verificati con codice al momento della registrazione.

> **Nota per il legale:** identificazione certa (art. 57, comma 1, lett. a, DPCM 22/02/2013). Oggi il cliente privato è identificato dai documenti caricati (verificati dal back office) e dal telefono verificato con OTP; il cliente dell'intermediario non ha un account e conferma l'identità solo con un codice OTP sul link (decisione 26), mentre i suoi documenti li carica l'intermediario. Va valutato se queste modalità bastano o se serve un passaggio di identificazione aggiuntivo (per esempio riconoscimento da remoto) prima della prima firma.

## Art. 3 — Come funziona la firma

3.1 Il Cliente legge il documento nella Piattaforma, conferma di volerlo firmare e riceve via SMS sul numero verificato un codice monouso, valido per un tempo limitato. L'inserimento del codice completa la firma.

3.2 La soluzione garantisce: la connessione univoca della firma al Cliente; il controllo esclusivo del Cliente sul sistema di generazione della firma (il codice arriva solo sul suo telefono); la possibilità di verificare che il documento non è stato modificato dopo la firma; la possibilità per il Cliente di ottenere evidenza di quanto sottoscritto; l'individuazione di AstAx come soggetto che eroga la soluzione; l'assenza nel documento di elementi che possano modificarne gli atti, i fatti o i dati rappresentati; la connessione univoca della firma al documento sottoscritto.

3.3 Le caratteristiche tecniche della soluzione e delle tecnologie usate sono descritte in [URL PAGINA CARATTERISTICHE FEA], pubblicata sul sito di AstAx.

3.4 Ogni firma è registrata con versione del documento, data, ora e indirizzo IP. Il documento firmato è disponibile nell'area del Cliente e scaricabile.

## Art. 4 — Limiti d'uso

4.1 La firma elettronica avanzata erogata con questo servizio è utilizzabile limitatamente ai rapporti giuridici tra il Cliente e AstAx.

> **Nota per il legale:** limite d'uso (art. 60 DPCM 22/02/2013, da verificare). Se la FEA di AstAx vale solo nei rapporti tra il Cliente e AstAx, non basta per firmare documenti dell'agenzia emittente o della compagnia (per esempio la proposta o la polizza). Le specifiche indicano a volte anche la firma di «informativa precontrattuale e documenti di polizza» (`docs/specifiche/00-panoramica-e-processi.md`, riga 91), mentre LEG-05 prevede la firma della sola lettera di incarico e la presa visione della MUP. Va deciso quali documenti si firmano con questa FEA e come si firmano gli altri (accordo con le agenzie o le compagnie, che potrebbero diventare anche loro soggetti che si avvalgono della soluzione).

## Art. 5 — Obblighi del Cliente

5.1 Il Cliente custodisce il proprio telefono e non comunica a nessuno i codici ricevuti. Avvisa subito AstAx a [EMAIL ASSISTENZA] in caso di smarrimento o furto del telefono o di cambio del numero, che va aggiornato nel profilo con un codice di conferma.

## Art. 6 — Conservazione e copia della dichiarazione

6.1 AstAx conserva questa dichiarazione di accettazione e copia del documento d'identità del Cliente per almeno venti anni, come richiesto dall'art. 57 del DPCM 22/02/2013, e i documenti firmati per i tempi previsti dalla legge.

6.2 Il Cliente può ottenere gratuitamente copia della dichiarazione di accettazione e delle informazioni sul servizio, chiedendole dal profilo o a [EMAIL ASSISTENZA].

> **Nota per il legale:** conservazione. Il codice oggi conserva contratti e documenti per 10 anni (`retention.contractsYears`; `docs/privacy/mappa-dati.md`, riga «Firme»), mentre l'art. 57 prevede almeno venti anni per la dichiarazione di accettazione e la copia del documento d'identità. Serve un parametro di conservazione distinto per questi documenti, e va indicato nell'informativa privacy.

## Art. 7 — Copertura assicurativa

7.1 A tutela dei firmatari e dei terzi da danni causati da inadeguate soluzioni tecniche, AstAx dispone di una copertura assicurativa di responsabilità civile: [COMPAGNIA POLIZZA FEA], massimale [MASSIMALE POLIZZA FEA].

> **Nota per il legale:** verificare l'obbligo e il massimale minimo di legge (art. 57, comma 2, DPCM 22/02/2013) e se la copertura del [FORNITORE FEA] può valere anche per AstAx.

## Art. 8 — Alternative alla firma elettronica

8.1 Il Cliente che non intende usare la FEA può [DA DEFINIRE — modalità alternativa].

> **Nota per il legale:** il codice oggi non prevede un'alternativa alla FEA per concludere l'acquisto. Va deciso se offrirne una o se l'uso della FEA può essere condizione del servizio online.

## Art. 9 — Durata e recesso dal servizio

9.1 Il servizio vale finché il Cliente ha un account sulla Piattaforma o, per il cliente dell'intermediario, per i documenti della singola richiesta. Il Cliente può revocare l'adesione in qualsiasi momento scrivendo a [EMAIL ASSISTENZA]; la revoca non tocca i documenti già firmati.

## Art. 10 — Dati personali

10.1 Per la firma sono trattati nome, codice fiscale, telefono, email del firmatario e i documenti da firmare; [FORNITORE FEA] li tratta per conto di AstAx. Si rinvia all'Informativa privacy.

Dichiarazione di accettazione: il/la sottoscritto/a {{nome e cognome}}, codice fiscale {{codice fiscale}}, dichiara di aver letto e di accettare le presenti condizioni del servizio di firma elettronica avanzata. Data e ora {{data e ora}} — versione {{versione}}.
