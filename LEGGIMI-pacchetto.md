# Pacchetto AstAx per Claude Code

Questo pacchetto contiene tutto quello che serve a Claude Code per costruire AstAx a fasi, partendo da un repository vuoto: regole, specifiche, decisioni, modello dati, fasi con criteri di accettazione, scenari di prova, valori iniziali e testi delle notifiche.

## Cosa c'è dentro

| Percorso | A cosa serve |
| --- | --- |
| `LEGGIMI.md` | Questa guida, per te |
| `PROMPT_INIZIALE.md` | Il messaggio da incollare nella prima sessione di Claude Code |
| `repo/` | La cartella del progetto: diventa il repository |
| `repo/CLAUDE.md` | Le istruzioni che Claude Code legge a ogni sessione |
| `repo/docs/specifiche/` | Le dieci schede del documento delle specifiche, in Markdown |
| `repo/docs/regole-di-dominio.md` | Le regole del business con un codice ciascuna (per esempio FEE-02), richiamate dai test |
| `repo/docs/decisioni-aggiunte.md` | I dettagli che le specifiche lasciavano aperti e la scelta fatta: **da leggere** |
| `repo/docs/permessi.md` | Chi può fare cosa, ruolo per ruolo |
| `repo/docs/modello-dati.md` | Entità, campi e stati |
| `repo/docs/busta-chiusa.md` | Come la crittografia garantisce che nessuno veda le offerte prima della chiusura |
| `repo/docs/adattatori.md` | Come il codice parla con i fornitori (targa, AI, firma, pagamenti, SDI…) |
| `repo/docs/scenari-accettazione.md` | I dieci scenari di prova, con numeri e date |
| `repo/docs/notifiche.md` e `repo/seed/notifiche.yaml` | Eventi, destinatari, canali e testi (italiano; albanese per il back office) |
| `repo/docs/punti-aperti.md` | Cosa resta a legale, DPO e commercialista |
| `repo/fasi/` | Le otto fasi, ognuna con obiettivo, contenuto, criteri di accettazione, test e demo |
| `repo/seed/` | Parametri, elenchi, pacchetti e festività da caricare nel database |
| `repo/.claude/` | I comandi `/fase` e `/chiudi-fase` e il revisore indipendente `verificatore` |

Le specifiche in `repo/docs/specifiche/` sono la copia del documento «AstAx — asta preventivi RCA» al 14 ottobre 2026. Se in futuro modifichi il documento, le modifiche vanno riportate anche qui (posso riesportarle io): Claude Code legge solo i file del repository.

## Come si usa

1. **Crea il repository.** Su GitHub, un'organizzazione AstAx e un repository privato, per esempio `astax`.
2. **Prepara la cartella.** Usa direttamente la cartella `repo/` come cartella del progetto (rinominala `astax` se vuoi). Non copiarne il contenuto a mano: contiene cartelle nascoste (`.claude`, `.gitignore`) che il Finder o Esplora risorse non mostrano e che andrebbero perse.
3. **Requisiti del computer di sviluppo.** Docker Desktop, Node.js (versione LTS), pnpm, Git e Claude Code. Claude Code può anche lavorare su GitHub dal cloud, ma per le prime fasi serve Docker per l'ambiente locale.
4. **Prima sessione.** Apri Claude Code nella cartella e incolla il testo di `PROMPT_INIZIALE.md`. Claude leggerà i documenti, ti dirà cosa ha capito, ti farà le sue domande e ti proporrà il piano della fase 1. Non partirà finché non approvi.
5. **Durante una fase.** Claude lavora a piccoli passi, con test e commit. A fine sessione aggiorna `docs/stato.md`: è il punto da cui riparte la sessione successiva, anche dopo giorni.
6. **Fine di una fase.** Scrivi `/chiudi-fase 1`. Claude esegue tutti i test, fa controllare il lavoro al revisore indipendente e ti prepara la demo. Provala tu (o il tuo sviluppatore di riferimento); se va bene, conferma e passa alla successiva con `/fase 2`.
7. **Se Claude ha un dubbio di business** lo scrive in `docs/domande-aperte.md`. Rispondi lì o in chat: la risposta diventa una regola.

Consiglio: anche con Claude Code, serve una persona tecnica di fiducia che riveda il codice almeno alla fine di ogni fase, soprattutto busta chiusa, pagamenti e sicurezza.

## Cosa serve da te, e quando

| Quando | Cosa |
| --- | --- |
| Prima della fase 1 | Repository GitHub; computer con Docker |
| Prima della fase 2 | Rivedere riga per riga i campi del preventivo (scheda 09, §3): è la parte dove la tua esperienza con i portali conta di più |
| Prima della fase 4 | Confermare rivalsa e franchigie dei pacchetti con 3-4 agenzie del pilota |
| Prima della fase 6 | Conferme del commercialista su esenzione IVA, dicitura in fattura, bollo e frequenza delle fatture |
| Durante la fase 7 | Far rileggere a un madrelingua i testi in albanese del back office |
| Prima della fase 8 | Account AWS, domini, contratti e sandbox (Openapi, Namirial, Fabrick, SMS, Claude su Bedrock), 80 documenti anonimi per misurare la lettura AI, società per il test di sicurezza |
| Prima del lancio | Iscrizione RUI di AstAx, conto separato o fideiussione, testi legali validati, accordi privacy |

## Decisioni da rivedere

In `repo/docs/decisioni-aggiunte.md` ci sono 44 scelte di dettaglio che le specifiche non fissavano: per esempio la garanzia minima calcolata dalla chiusura prevista, il massimo di due riconferme, il fee ridotto solo per i privati, la fattura al privato emessa all'emissione della polizza, la quota di provvigione del broker spenta finché il legale non valida lo schema. Quasi tutte sono parametri che l'amministratore potrà cambiare; conviene leggerle prima della fase 1 e dire cosa cambiare.

## Cosa resta a legale e commercialista

Il dettaglio è in `repo/docs/punti-aperti.md`. In breve: iscrizione RUI di AstAx; effetto liberatorio del pagamento ad AstAx; collaborazione a tre intermediari nel canale broker; confronto AI e consulenza IDD; vendita a distanza e regole di rimborso del fee; penali e non aggiramento; ruoli privacy e dati in Albania; esenzione IVA di tutti i fee, bollo e frequenza delle fatture; incasso diviso tra premio e fee. Nessuno di questi punti blocca lo sviluppo: il codice usa valori provvisori e testi segnaposto, e la produzione non parte finché i testi legali non sono validati.
