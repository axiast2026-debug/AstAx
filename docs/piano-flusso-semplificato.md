# Piano: flusso semplificato del privato (idea di Dan)

**Stato:** risposte di Dan del 2026-10-21 nella sezione «Decisioni di Dan»; manca solo il via per partire. Sostituisce le proposte A, B e C di `docs/piano-semplificazione.md`; le proposte D-J di quel piano restano valide. Niente codice finché Dan non approva.

**Idea di fondo (Dan):** il cliente dà pochissimi dati e le foto dei documenti; il resto lo estrae il «bot» (il lettore AI dei documenti) e lo conferma il back office prima dell'asta. Tutto pensato prima per il telefono.

## 1. Tre ingressi

Tre indirizzi, uno per tipo di utente: privati, broker, agenzie. Ognuno mostra solo il suo accesso e le sue pagine. Back office e amministratore restano sul loro indirizzo.

## 2. Registrazione del privato

Nome, cognome, telefono ed email. Si entra con il codice (email, oppure SMS al telefono) o con un clic dal link dell'email.

## 3. Nuovo preventivo: le schermate

| # | Schermata | Cosa chiede |
| --- | --- | --- |
| 1 | **Che veicolo è?** | «Già assicurato» oppure «Nuovo da assicurare» |
| 2a | **Già assicurato** | Targa, data di nascita del proprietario, indirizzo di residenza; foto di libretto e documenti |
| 2b | **Nuovo da assicurare** | Targa, data di nascita del proprietario, residenza; foto del libretto del nuovo veicolo e della carta d'identità. Poi: «Da dove prendiamo la classe di merito?» (vedi sotto) |
| 3 | **Tipo di guida** (obbligatorio) | Libera, esperta (tutti i conducenti con almeno 26 anni) oppure esclusiva |
| 4 | **Garanzie e decorrenza** | «Pacchetto consigliato» (RCA + assistenza stradale + infortuni del conducente + tutela legale) oppure «Scelgo io», con le garanzie una per una. Poi la decorrenza: data scelta, immediata o dalle 24:00 |
| 5 | **Conferma** | Riepilogo, una spunta per i consensi, «Invia» |

**Classe di merito per un veicolo nuovo (2b):**
- veicolo proprio, oppure veicolo venduto, demolito o rottamato: la targa di quel veicolo;
- veicolo di un familiare convivente (stessa residenza): targa e data di nascita del familiare.

**Foto dei documenti:** appena caricata, il bot controlla solo se si legge. Se non si legge, il messaggio è immediato: «La foto non è leggibile: rifalla con più luce, senza riflessi». Dal telefono si apre la fotocamera.

## 4. Dopo l'invio

- **Il privato vede:** «Controllo documenti» → «Asta aperta» → «Offerte pronte».
- **Il back office:** il bot estrae i dati dai documenti, compresi classe di merito e sinistri; il back office li controlla, li completa se serve e apre l'asta.
- **Le agenzie:** vedono la richiesta con la targa e possono verificare da sole classe e storico sui sistemi delle loro compagnie.

## 5. Offerte, firma e pagamento

Restano valide le proposte del piano precedente:
- **D** accesso con un clic dall'email;
- **E** offerte, confronto AI e scelta nella stessa pagina;
- **F** «Firma e paga» in un solo passaggio;
- **G** Apple Pay e Google Pay;
- **H** dati già compilati per i clienti che tornano.

## Stima

| | Oggi | Con questo piano |
| --- | --- | --- |
| Schermate della richiesta | 6 passi, molti campi | 5 schermate brevi |
| Campi scritti dal cliente | decine | targa, data di nascita, indirizzo (più la seconda targa per un veicolo nuovo) |
| Clic dalla richiesta al pagamento | circa 30 | circa 15 |
| Codici da prendere | 3 | 1 (la firma), più l'accesso se non si entra dal link |

## Cosa cambia dietro le quinte

1. **Pacchetti → garanzie scelte.** Base, Plus e Completo spariscono dal cliente. Il «consigliato» e le garanzie scelte una a una diventano i requisiti della richiesta, che le offerte devono rispettare: OFF-06 resta e cambia solo da dove vengono i requisiti. Il controllo delle offerte ha già la forma per farlo (requisiti garanzia per garanzia).
2. **Il back office completa i dati.** Oggi corregge solo alcuni campi: con questo flusso deve poter confermare e completare tutti i dati estratti dal bot (persone, veicolo, storico, classe, sinistri) in una sola schermata.
3. **Conducenti:** con il tipo di guida non servono più i dati degli altri conducenti. Per l'esperta il controllo dei 26 anni resta una dichiarazione del cliente.
4. **Codice fiscale e dati anagrafici:** non li scrive il cliente; il bot li legge dai documenti e il back office li conferma.
5. **Scenari e prove:** da riscrivere S01, S02 e S09 e le prove della richiesta.

## Domande per Dan

1. **Prima assicurazione in assoluto** (nessun veicolo da cui prendere la classe): (A) aggiungo l'opzione «Nessuno, è la mia prima polizza» (classe 14); (B) no.
2. **Massimale RCA del pacchetto consigliato:** (A) massimale unico di 10 milioni, come l'attuale Plus; (B) minimi di legge.
3. **Capitale degli infortuni del conducente nel consigliato:** (A) almeno 50.000 euro, come l'attuale Completo; (B) lo decide l'agenzia.
4. **Garanzie una a una, furto e incendio:** serve il valore del veicolo. (A) lo indica l'agenzia nell'offerta; (B) lo scrive il cliente.
5. **Consensi con una spunta:** (A) una spunta per quelli obbligatori e una a parte, facoltativa, per il marketing (la privacy chiede consensi separati per gli usi facoltativi; consiglio questa); (B) una spunta sola, da far confermare al legale.
6. **Se il bot non riesce a leggere un dato:** (A) il back office chiede un'integrazione al cliente dall'app (c'è già); (B) lo chiama.
7. **Approvazione automatica** quando il bot ha letto tutto e i controlli sono verdi: (A) sì, l'asta parte da sola; (B) sempre il back office.
8. **Tre indirizzi:** (A) tre sottodomini (`privati.`, `broker.`, `agenzie.`); (B) tre percorsi dello stesso sito.
9. **Broker:** (A) stesso flusso semplificato per i suoi clienti; (B) il broker tiene il modulo completo, perché i professionisti spesso hanno già tutti i dati.
10. **Il resto dell'«utenza del privato»:** cosa deve trovare nella sua area? Oggi ci sono preventivi, polizze, documenti, reclami e profilo.

## Decisioni di Dan (2026-10-21)

| # | Decisione |
| --- | --- |
| 1 | **A**: c'è l'opzione «Nessuno, è la mia prima polizza» (classe 14) |
| 2 | Pacchetto consigliato con l'RCA ai **minimi di legge** |
| 3 | **B**: il capitale degli infortuni del conducente lo decide l'agenzia |
| 4 | **A**: il valore del veicolo per furto e incendio lo indica l'agenzia |
| 5 | **B**: una spunta sola per tutti i consensi. Da far confermare al legale e al DPO (`docs/punti-aperti.md`): la privacy chiede consensi separati per gli usi facoltativi |
| 6 | **B**: se il bot non legge un dato, il back office chiama il cliente (il telefono c'è dalla registrazione) |
| 7 | Per ora decide sempre il back office; l'approvazione automatica dopo |
| 8 | **A**: tre sottodomini, `privati.`, `broker.`, `agenzie.` |
| 9 | Il broker si riprogetta da capo più avanti: per ora resta com'è |
| 10 | L'area del privato per ora resta com'è; proposta di semplificazione qui sotto, da decidere |

## Passi di lavoro

Ognuno con i suoi test e il suo commit, nell'ordine:

1. **Garanzie richieste al posto dei pacchetti:** il «consigliato» (RCA ai minimi di legge, assistenza stradale, infortuni del conducente, tutela legale) e le garanzie una a una diventano i requisiti della richiesta; OFF-06 controlla le offerte su quelli. Le richieste vecchie restano con il loro pacchetto.
2. **Dati della richiesta ridotti:** veicolo già assicurato o nuovo, targa, data di nascita, residenza, provenienza della classe (veicolo proprio, venduto, demolito o rottamato, familiare convivente, prima polizza), tipo di guida. Gli altri dati diventano «da completare dal back office».
3. **Le 5 schermate del cliente**, pensate per il telefono, con il controllo di leggibilità delle foto e la fotocamera.
4. **La schermata unica del back office:** i dati estratti dal bot accanto alle foto, da confermare o correggere, poi «Apri l'asta». Il pulsante «Chiama il cliente» con il numero.
5. **Tre sottodomini** per privati, broker e agenzie (locale e Terraform).
6. **Proposte D, E, F** del piano precedente: accesso con un clic dall'email, offerte e confronto AI nella stessa pagina, «Firma e paga».
7. **Scenari e prove:** S01, S09 e le prove della richiesta riscritti; una prova automatica che conta i clic (obiettivo: al massimo 15 dalla richiesta al pagamento).
8. Demo per Dan.

## Proposta per l'area del privato (da decidere più avanti)

- **Home con una scheda per ogni cosa in corso:** la richiesta, il suo stato e un solo pulsante con la prossima azione («Carica di nuovo la foto», «Vedi le offerte», «Firma e paga», «Scarica la polizza»).
- **Menu di 3 voci:** «Preventivi», «Polizze», «Profilo». I documenti stanno dentro la richiesta o la polizza a cui appartengono; assistenza e reclami stanno nel profilo e in fondo a ogni pagina.
- **Sul telefono:** menu in basso, notifiche come elenco di eventi con il link all'azione.
