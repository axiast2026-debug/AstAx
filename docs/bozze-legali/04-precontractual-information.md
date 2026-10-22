# Informativa precontrattuale (MUP)

**Bozza n. 1 del 22/10/2026 — [DA VALIDARE — LEGALE]**

| | |
| --- | --- |
| Chiave del documento | `precontractual-information` |
| Chi la riceve | Il privato (presa visione); il documento non ha canale fisso nel codice (`channel: null`), quindi lo riceve anche il cliente dell'intermediario richiedente dal link |
| Quando | All'accettazione, prima della firma (09 §7; LEG-05) |
| Fonti | `docs/specifiche/00` (Ruoli 2-3, Modello economico, Processo 4, Responsabilità di AstAx), `03`, `09` §7; `docs/regole-di-dominio.md` (FEE, PAG, EMI, LEG-05); `docs/decisioni-aggiunte.md` (17, 21); `docs/punti-aperti.md`; `seed/parametri.json`; d.lgs. 209/2005 (CAP), Titolo IX; Regolamento IVASS n. 40/2018 e relativi allegati |

> Convenzioni: [MAIUSCOLO] = dato che AstAx deve fornire; {{campo}} = dato che la Piattaforma inserisce per la singola offerta.
>
> Struttura. La bozza segue il modello unico precontrattuale previsto dal Regolamento IVASS n. 40/2018 per i prodotti assicurativi diversi dai prodotti d'investimento assicurativo: Parte I = informativa sul distributore (Allegato 3); Parte II = informazioni sulla distribuzione del prodotto (Allegato 4); Parte III = elenco delle regole di comportamento del distributore (Allegato 4-ter).

> **Nota per il legale:** verificare che la struttura e i titoli delle sezioni corrispondano alla versione vigente degli Allegati 3, 4 e 4-ter del Reg. IVASS 40/2018. Le specifiche (`docs/specifiche/00-panoramica-e-processi.md`, riga 108) citano il «Provv. IVASS 147/2024»: il riferimento non è stato verificato e va confermato o corretto.

---

## Parte I — Informativa sul distributore (Allegato 3)

### Sezione I — Informazioni generali sull'intermediario che entra in contatto con il contraente

| Voce | Dato |
| --- | --- |
| Denominazione | [RAGIONE SOCIALE] |
| Iscrizione al RUI | Sezione B (broker), n. [NUMERO RUI], data [DATA ISCRIZIONE RUI] |
| Responsabile dell'attività di distribuzione | [RESPONSABILE DELLA DISTRIBUZIONE], iscritto al RUI sez. B n. [NUMERO RUI RESPONSABILE] |
| Addetti all'attività di distribuzione a contatto con il pubblico | [ADDETTI — eventuali iscritti in sez. E, con numero RUI] |
| Sede legale e operativa | [SEDE LEGALE]; [SEDE OPERATIVA] |
| Recapiti | Telefono [TELEFONO]; email [EMAIL ASSISTENZA]; PEC [PEC]; sito [SITO WEB] |
| Autorità di vigilanza | IVASS — Istituto per la Vigilanza sulle Assicurazioni |

Gli estremi dell'iscrizione possono essere verificati sul RUI, consultabile sul sito dell'IVASS.

> **Nota per il legale:** iscrizione RUI di AstAx (`docs/punti-aperti.md`): requisiti per la sezione B (sede in Italia, responsabile della distribuzione e rappresentante legale iscritti, RC professionale). Tutti i dati di questa sezione mancano e bloccano il lancio. Va anche deciso se il personale del back office che opera dall'estero e ha contatti con i clienti debba essere iscritto in sez. E (specifiche 00, riga 216).

### Sezione II — Informazioni sull'attività svolta dall'intermediario

AstAx svolge l'attività di intermediazione tramite la piattaforma online AstAx, accessibile da [SITO WEB]. Nel contratto proposto AstAx agisce **su incarico del Cliente** e opera in **collaborazione con l'agenzia emittente** {{agenzia: ragione sociale, RUI sez. A n. …}}, che agisce su mandato della compagnia {{compagnia}}, ai sensi dell'art. 22, comma 10, del d.l. 179/2012 convertito dalla l. 221/2012.

Sul sito di AstAx è disponibile l'elenco degli obblighi di comportamento cui AstAx è tenuta (Parte III).

### Sezione III — Informazioni relative a potenziali situazioni di conflitto d'interessi

- AstAx [non detiene / detiene] partecipazioni dirette o indirette pari o superiori al 10% del capitale sociale o dei diritti di voto di un'impresa di assicurazione: [DA COMPILARE].
- Nessuna impresa di assicurazione o controllante di un'impresa di assicurazione [detiene / non detiene] partecipazioni dirette o indirette pari o superiori al 10% del capitale sociale o dei diritti di voto di AstAx: [DA COMPILARE].
- Rapporti con altri intermediari: [SOCIETÀ COLLEGATE — legami da dichiarare]. Le società collegate che usano la Piattaforma lo fanno alle stesse condizioni degli altri utenti.

> **Nota per il legale:** rapporti con la società di brokeraggio indicata in `docs/punti-aperti.md` («Rapporti con …») e con le altre società collegate (specifiche 00, riga 248): uso della piattaforma a condizioni di mercato e legame dichiarato. Definire il testo da inserire qui.

### Sezione IV — Informazioni sugli strumenti di tutela del contraente

- **Responsabilità civile professionale.** L'attività di AstAx è garantita da una polizza di responsabilità civile professionale per i danni arrecati per negligenze ed errori professionali, anche di dipendenti e collaboratori: [COMPAGNIA RC PROFESSIONALE], massimali [MASSIMALE RC PROFESSIONALE].
- **Reclami.** Il contraente può presentare reclamo per iscritto ad AstAx, dalla Piattaforma (modulo «Reclamo») oppure a [INDIRIZZO RECLAMI] / [PEC] / [EMAIL RECLAMI]. AstAx risponde entro 45 giorni. I reclami relativi al contratto o ai sinistri vanno presentati alla compagnia {{compagnia}}, secondo il DIP aggiuntivo. In caso di risposta insoddisfacente o di mancata risposta entro 45 giorni il contraente può rivolgersi all'IVASS ([INDIRIZZO IVASS], PEC [PEC IVASS]), allegando la documentazione relativa al reclamo.
- **Altri sistemi di risoluzione delle controversie:** [DA COMPILARE — mediazione, Arbitro Assicurativo se operativo, altri sistemi applicabili].
- **Fondo di garanzia per i mediatori**: [DA VERIFICARE se e come indicarlo].

> **Nota per il legale:** completare i sistemi alternativi di risoluzione delle controversie e verificare la menzione del fondo di garanzia per l'attività dei mediatori; le fonti di AstAx non ne parlano.

---

## Parte II — Informazioni sulla distribuzione del prodotto assicurativo (Allegato 4)

Prodotto: {{prodotto}} della compagnia {{compagnia}} — RC auto {{garanzie}} — veicolo {{targa}}.

### Sezione I — Informazioni sul modello di distribuzione

Il contratto è distribuito da AstAx (broker, intermediario che entra in contatto con il contraente) **in collaborazione orizzontale** con l'agenzia emittente {{agenzia}} (RUI sez. A n. {{numero RUI}}), che emette la polizza in base al proprio mandato con {{compagnia}}. L'offerta è stata selezionata tramite un'asta a busta chiusa tra agenzie invitate da AstAx.

### Sezione II — Informazioni sull'attività di distribuzione e consulenza

- AstAx **[fornisce / non fornisce] consulenza** ai sensi del CAP sul prodotto proposto.
- AstAx distribuisce i contratti di più imprese tramite le agenzie che partecipano alle aste. Le offerte presentate al Cliente sono quelle pervenute nell'asta (la migliore ancora garantita per ogni compagnia), non un'analisi dell'intero mercato.
- Il contratto proposto è coerente con le richieste ed esigenze di copertura del contraente come espresse nella richiesta: garanzie {{«Consigliato» oppure elenco «Su misura»}}, decorrenza {{decorrenza}}, tipo di guida {{tipo di guida}}.

> **Nota per il legale:** consulenza e confronto AI (`docs/punti-aperti.md`). Da decidere: (a) se AstAx dichiara di fornire o non fornire consulenza; (b) se il confronto AI facoltativo (PRES-06/07/08) è consulenza; (c) se AstAx, come broker, deve dichiarare di basare la proposta su un'analisi imparziale e personale di un numero sufficiente di contratti e come questo si concilia con offerte limitate alle agenzie invitate; (d) come si documenta la valutazione di richieste ed esigenze, che oggi è implicita nelle garanzie scelte dal cliente.

### Sezione III — Informazioni relative alle remunerazioni

| Soggetto | Natura del compenso | Importo |
| --- | --- | --- |
| AstAx, pagato dal Cliente | Compenso di intermediazione fisso, pagato direttamente dal Cliente, esente IVA (art. 10, c. 1, n. 9, DPR 633/1972); dovuto solo con l'acquisto | {{importo}} € (valori in vigore oggi: 30 €; 35 € con il confronto AI; 15 € / 20 € se il premio non supera 200,00 €). Nel canale degli intermediari il cliente non paga compensi ad AstAx |
| AstAx, pagato dall'agenzia emittente | Compenso fisso per polizza emessa, trattenuto dal premio rimesso | {{oggi 15 €}} |
| Agenzia emittente | Provvigione inclusa nel premio, corrisposta dalla compagnia | [MISURA PROVVIGIONE AGENZIA — {{percentuale o importo}}] |
| Broker richiedente (solo canale intermediari) | Quota di provvigione | Oggi non prevista |

> **Nota per il legale:** AstAx non conosce oggi la provvigione dell'agenzia e il codice non la raccoglie nell'offerta. Va deciso come indicarla (dato dichiarato dall'agenzia nella libreria prodotti o nell'offerta) e se per la RC auto valgono obblighi specifici di indicazione della misura delle provvigioni.

### Sezione IV — Informazioni sul pagamento dei premi

- **Separazione patrimoniale.** I premi pagati dal contraente ad AstAx sono versati sul conto separato intestato ad AstAx in qualità di intermediario ([BANCA CONTO SEPARATO]), costituente patrimonio autonomo e separato da quello di AstAx (art. 117 CAP).
- **Modalità di pagamento ammesse:** carta di pagamento e bonifico istantaneo tramite [FORNITORE PAGAMENTI]; [altri strumenti attivati]. Non è ammesso il pagamento in contanti.
- **Effetto del pagamento:** [DA COMPILARE — il pagamento ad AstAx ha / non ha effetto liberatorio nei confronti della compagnia, ai sensi dell'art. 118 CAP, in virtù di …].
- AstAx rimette all'agenzia emittente il premio, al netto del proprio compenso, con cadenza settimanale.

> **Nota per il legale:** effetto liberatorio del pagamento ad AstAx nella collaborazione con l'agenzia emittente (art. 118 CAP; `docs/punti-aperti.md`). È la frase più delicata di questa informativa: senza effetto liberatorio il contraente resta esposto finché la compagnia non riceve il premio.

> **Nota per il legale:** conto separato o fideiussione (art. 117 CAP; `docs/punti-aperti.md`, «Commercialista e amministrazione»): la frase sopra presuppone il conto separato, come fa oggi il codice (PAG-01).

---

## Parte III — Elenco delle regole di comportamento del distributore (Allegato 4-ter)

AstAx è tenuta a:

a) consegnare al contraente, prima della sottoscrizione della proposta o del contratto, copia di questa informativa e della documentazione del prodotto;
b) proporre o raccomandare contratti coerenti con le richieste ed esigenze di copertura assicurativa del contraente, acquisendo a tal fine ogni utile informazione;
c) se il contratto non è coerente con le richieste ed esigenze, informarne il contraente e non proporlo;
d) valutare se il contraente rientra nel mercato di riferimento del prodotto e non appartiene alle categorie per le quali il prodotto non è compatibile;
e) fornire in forma chiara e comprensibile le informazioni oggettive sul prodotto, illustrandone caratteristiche, durata, costi e limiti della copertura;
f) consegnare copia dei documenti firmati e della polizza.

> **Nota per il legale:** il testo della Parte III è una traccia: sostituirlo con l'elenco esatto dell'Allegato 4-ter vigente e verificare come ciascun obbligo è soddisfatto nel flusso della Piattaforma (per esempio il punto d, mercato di riferimento, oggi non è gestito dal codice; la documentazione del prodotto viene dalla libreria che l'agenzia carica per compagnia e prodotto, decisione 17).

---

Il contraente dichiara di aver ricevuto e letto la presente informativa il {{data e ora}} (presa visione registrata con versione {{versione}}).
