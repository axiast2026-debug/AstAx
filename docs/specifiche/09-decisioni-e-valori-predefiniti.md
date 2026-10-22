# Decisioni e valori predefiniti

## Sintesi

Questa scheda dà una risposta a ogni domanda aperta. Quello che hai già deciso è segnato come deciso; il resto è una proposta, con un valore che Claude Code può usare subito e che l'amministratore potrà cambiare.

- **Già deciso:** fee fissi esenti IVA (30 € privato, 35 € con il confronto AI, 30 € broker, 15 € agenzia), migliore offerta per compagnia, confronto AI solo per i privati, busta chiusa, prime due offerte e posizione alle agenzie, prezzo garantito, AstAx società separata con progetto nuovo.
- **Proposto qui:** tutto il resto.
- **Da confermare prima di iniziare:** fee sui premi bassi, importi delle penali, fornitori di pagamenti e firma.

## 1. Decisioni che cambiano il codice

| Decisione | Stato | Risposta | Motivo |
| --- | --- | --- | --- |
| Fee del privato | Deciso | 30 € a polizza, 35 € con il confronto AI, esente IVA, pagato solo se acquista | — |
| Fee del broker | Deciso | 30 € a polizza, compenso di intermediazione esente IVA | — |
| Fee dell'agenzia | Deciso | 15 € a polizza emessa, trattenuto dalla rimessa | — |
| Fee sui premi bassi | Proposta | Premio sotto 200 €: fee 15 €, 20 € con il confronto AI | Su moto e ciclomotori 30 € pesano troppo e farebbero perdere il cliente |
| Scelta dell'offerta | Deciso | Libera; evidenziate la più bassa e la scelta dell'AI | — |
| Agenzie invitate | Proposta | Fino a 8 per richiesta; se a metà asta ci sono meno di 3 offerte, il sistema ne invita fino a 4 in più | Abbastanza concorrenza senza far lavorare gratis troppe agenzie |
| Aste deserte | Proposta | Una riapertura automatica di 2 ore con filtri allargati; se resta deserta, avviso al cliente | Il broker partner aggiunge un contratto in più: meglio in fase 2 |
| Casi esclusi | Proposta | Bloccati prima dell'asta, con un messaggio chiaro al cliente | Evita aste che nessuno può vincere |
| Rischio di cambio tariffa | Proposta | A carico dell'agenzia per tutta la garanzia; ogni agenzia sceglie la validità massima che può offrire | È ciò che rende il prezzo davvero garantito |
| Parità di prezzo | Proposta | Vince la garanzia più lunga, poi l'offerta arrivata prima | Premia l'offerta più utile al cliente |
| Frazionamento | Proposta | Solo annuale nell'MVP; semestrale in fase 2 | La seconda rata richiede un secondo incasso e un secondo flusso |
| Contraenti ammessi | Proposta | Persone fisiche e società; flotte escluse | Le flotte hanno prezzi e processi diversi |
| App | Proposta | PWA nell'MVP, app negli store in fase 2 | Una sola base di codice |

## 2. Pacchetti di copertura

Tre pacchetti fissi rendono confrontabili le offerte: l'agenzia può offrire coperture uguali o migliori di quelle del pacchetto, mai inferiori. I massimali minimi di legge sono 6.450.000 € per i danni alle persone e 1.300.000 € per i danni alle cose, per sinistro ([DM 31 maggio 2022](https://www.ipsoa.it/documents/quotidiano/2022/06/28/rc-auto-natanti-adeguati-massimali-garanzia)).

| Voce | Base | Plus | Completo |
| --- | --- | --- | --- |
| Massimali RCA | Minimi di legge | Unico 10 milioni € | Unico 10 milioni € |
| Rinuncia alla rivalsa | No | Sì, almeno per patente scaduta e trasporto non conforme | Come Plus |
| Assistenza stradale | No | Sì | Sì |
| Tutela legale | No | Sì | Sì |
| Infortuni del conducente | No | No | Sì, capitale minimo 50.000 € |
| Furto e incendio | No | No | Sì, scoperto massimo 10% con minimo 250 € |
| Eventi naturali e atti vandalici | No | No | Sì, stesse franchigie massime |
| Cristalli | No | No | Sì, franchigia massima 150 € |

Regole:

- La formula di guida e la scatola nera non fanno parte del pacchetto: sono dati della richiesta, uguali per tutte le offerte.
- La kasko resta fuori dall'MVP: è troppo diversa tra compagnie per un confronto pulito.
- Il controllo automatico confronta il PDF del preventivo con queste soglie e segnala le offerte peggiorative.
- Rivalsa e franchigie vanno validate con 3-4 agenzie del pilota prima di fissarle: devono essere offerte comuni sul mercato.

## 3. Campi per il preventivo

Sono i dati che servono alle agenzie per calcolare un preventivo RCA sui portali delle compagnie. È il punto in cui la tua esperienza con i portali vale di più: va rivisto riga per riga.

| Gruppo | Campo | Formato | Obbligatorio | Fonte |
| --- | --- | --- | --- | --- |
| Persone | Tipo di contraente | Persona fisica o società | Sì | Cliente |
| Persone | Nome e cognome, o ragione sociale | Testo | Sì | Documento e cliente |
| Persone | Codice fiscale o partita IVA | 16 o 11 caratteri, con controllo automatico | Sì | Cliente |
| Persone | Data e comune di nascita, sesso | Data, codice ISTAT | Sì | Ricavati dal codice fiscale |
| Persone | Residenza | Indirizzo, CAP, comune con codice ISTAT, provincia | Sì | Cliente, confrontata con il libretto |
| Persone | Proprietario, se diverso | Stessi campi | Se diverso | Libretto |
| Persone | Professione, stato civile, figli | Elenchi | No | Cliente; usati solo da alcune tariffe |
| Persone | Telefono ed email | Verificati con OTP | Sì | Cliente; mai alle agenzie prima della vittoria |
| Conducenti | Conducente abituale | Collegato a una persona | Sì | Cliente |
| Conducenti | Patente: categoria, numero, rilascio, scadenza | Testo e date | Sì | Foto della patente, letta dall'AI |
| Conducenti | Formula di guida | Libera, esperta, esclusiva | Sì | Cliente |
| Veicolo | Targa | Formato italiano auto o moto | Sì | Cliente |
| Veicolo | Tipo e uso | Elenchi | Sì | Libretto |
| Veicolo | Marca, modello, allestimento | Testo e codice del fornitore dati | Sì | API targa e libretto |
| Veicolo | Alimentazione, cilindrata, potenza in kW | Elenco e numeri | Sì | API targa e libretto |
| Veicolo | Prima immatricolazione | Data | Sì | Libretto |
| Veicolo | Data di acquisto, nuovo o usato | Data, sì/no | Sì | Cliente |
| Veicolo | Valore commerciale | Euro | Solo con furto e incendio | Cliente; banca dati in fase 2 |
| Veicolo | Antifurto satellitare, ricovero notturno, km annui | Elenchi e fasce | No | Cliente |
| Storia | Provenienza | Elenco | Sì | Cliente |
| Storia | Classe CU | 1-18 | Sì, salvo prima immatricolazione | Attestato |
| Storia | Sinistri degli ultimi 5 anni | Numero per anno e tipo di responsabilità | Sì | Attestato |
| Storia | IUR, identificativo univoco del rischio | Codice | Se presente | Attestato |
| Storia | Compagnia e scadenza attuali | Testo e data | Sì, salvo prima immatricolazione | Attestato o API stato assicurativo |
| Storia | Veicolo e familiare per la RC familiare | Targa e codice fiscale | Se provenienza familiare | Cliente |
| Richiesta | Pacchetto | Base, Plus, Completo | Sì | Cliente |
| Richiesta | Decorrenza | Data | Sì | Proposta dalla scadenza attuale |
| Richiesta | Scatola nera | Accettata sì/no | Sì | Cliente |
| Richiesta | Durata dell'asta e validità minima del prezzo | Elenchi | Sì | Cliente |
| Richiesta | Premio attuale | Euro | No | Cliente |

La nazionalità non viene raccolta: usarla come fattore di prezzo è a rischio discriminazione.

## 4. Elenchi di valori

Ogni elenco è una tabella modificabile dall'amministratore: aggiungere un valore non richiede di cambiare il codice.

| Elenco | Valori nell'MVP | Fase 2 |
| --- | --- | --- |
| Tipi di veicolo | Autovettura, motociclo, ciclomotore | Autocarro fino a 3,5 t per uso proprio, camper |
| Usi ammessi | Privato | Uso professionale del contraente |
| Formule di guida | Libera; esperta (tutti i conducenti con almeno 26 anni, soglia configurabile); esclusiva | — |
| Provenienza | Prima immatricolazione; veicolo usato senza attestato proprio; da altra compagnia; RC familiare | Veicolo proveniente dall'estero |
| Frazionamento | Annuale | Semestrale |
| Casi esclusi dall'asta | Veicoli d'epoca o storici; targhe estere o temporanee; noleggio, taxi, NCC, scuola guida, trasporto merci per conto terzi; flotte | Rivalutare dopo il pilota |
| Motivi di rinuncia delle agenzie | Fuori tariffa; compagnia non disponibile; profilo non assumibile; tempi stretti; altro | — |
| Fasce di km annui | Fino a 10.000; 10.000-20.000; oltre 20.000 | — |
| Ricovero notturno | Box chiuso; cortile o posto auto privato; strada | — |

## 5. Parametri numerici

Tutti i valori sono proposte e tutti sono configurabili dall'amministratore: Claude Code li scrive come impostazioni, mai fissi nel codice.

| Parametro | Valore proposto |
| --- | --- |
| Durate dell'asta | 1, 2, 5 o 24 ore lavorative; predefinita 2 ore |
| Orari lavorativi | Lunedì-venerdì 9-19, sabato 9-13, ora italiana |
| Festività | Calendario nazionale italiano, aggiornato ogni anno |
| Validità minima del prezzo | 7, 15 o 30 giorni; predefinita 15 |
| Tempo per la riconferma | 24 ore lavorative |
| Promemoria di scadenza della garanzia | 2 giorni prima |
| Termine di emissione | 4 ore lavorative dal pagamento, comunque prima della decorrenza |
| Agenzie invitate | 8, più fino a 4 se a metà asta ci sono meno di 3 offerte |
| Inviti aggiunti dal back office | Solo nella prima metà dell'asta |
| Proposta di rinnovo | 30 giorni prima della scadenza |
| Rimesse alle agenzie | Settimanali: ogni lunedì per le polizze emesse fino al venerdì |
| Soglia dei premi bassi | 200 € (fee 15 €, 20 € con il confronto AI) |
| Penale per mancata emissione | 100 €; sospensione dopo 3 casi in 6 mesi |
| Penale per ritardo di emissione | 25 € |
| Penale per aggiramento | 1.000 € ed esclusione dalla piattaforma |
| Soglia di confidenza della lettura documenti | 90% per campo; sotto, revisione del back office |
| Durata della sessione | Privati 30 giorni sul dispositivo; professionisti 8 ore di inattività; back office e amministratore 1 ora |
| Conservazione delle richieste non concluse | 12 mesi, poi cancellazione |
| Lunghezza delle note per il cliente | 300 caratteri |

## 6. Fornitori, accessi e ambienti

Si può partire subito senza nessun contratto: finché manca una sandbox, Claude Code usa un adattatore finto con lo stesso contratto del fornitore vero, e il collegamento reale si fa dopo senza toccare il resto del codice.

| Area | Scelta proposta | Alternativa | Cosa fare |
| --- | --- | --- | --- |
| Cloud | AWS, region Milano | Google Cloud Milano | Creare l'account aziendale di AstAx |
| Dominio | astax.it, più .com e .eu se liberi | — | Verificare la disponibilità e registrarli |
| Repository | GitHub, organizzazione AstAx, repository privato | — | Creare l'organizzazione e collegarla a Claude Code |
| Dati targa | Openapi Automotive | InfoTarga | Chiedere la sandbox |
| Fatture SDI | Openapi SDI: stesso fornitore della targa, un contratto in meno | A-Cube | Chiedere la sandbox |
| Firma FEA | Namirial | InfoCert | Offerta e sandbox |
| Pagamenti | Fabrick | Nexi | Offerta e verifica del flusso sul conto separato |
| Email | Amazon SES | Postmark | — |
| SMS | Provider italiano o Twilio | — | Registrare il mittente «AstAx» |
| AI | Claude tramite Amazon Bedrock, region UE | Altro modello con region UE | — |
| Autenticazione | Keycloak su AWS | — | — |
| Workflow | Temporal | — | — |

Tre ambienti separati:

- **Sviluppo:** sul computer, con Docker e adattatori finti.
- **Collaudo:** su AWS, con le sandbox dei fornitori e solo dati finti.
- **Produzione:** su AWS, con dati reali; accesso ristretto e registrato.

## 7. Testi e documenti

I testi legali li scrive il legale. Claude Code usa segnaposto ben marcati, così il codice è pronto e i testi si sostituiscono senza toccarlo.

| Documento | Chi lo accetta o firma | Quando |
| --- | --- | --- |
| Condizioni d'uso per i privati | Privato | Registrazione |
| Informativa privacy e consenso alla condivisione con le agenzie | Privato; il broker per i propri clienti | Prima della richiesta |
| Lettera di incarico ad AstAx | Privato | Accettazione dell'offerta |
| Informativa precontrattuale (MUP) | Privato | Accettazione, prima della firma |
| Condizioni del servizio di firma FEA | Privato | Prima firma |
| Condizioni d'uso per i professionisti, con penali e non aggiramento | Broker, agenzia, sub-agente | Ingresso |
| Accordo di collaborazione con le agenzie | Agenzia | Ingresso |
| Accordo di collaborazione con i broker | Broker | Ingresso |
| Accordo sul trattamento dei dati | Agenzia e broker | Ingresso |
| Cookie policy | Tutti | Primo accesso |

Regole per i segnaposto:

- Ogni testo vive in un archivio di contenuti con numero di versione, non nel codice.
- Ogni accettazione registra versione, data e ora.
- Finché il legale non lo valida, il testo mostra «\[DA VALIDARE — LEGALE\]» e non può andare in produzione.
- I testi delle notifiche li scrivo io nel pacchetto per Claude Code.

## 8. Design e lingue

AstAx deve sembrare affidabile come una banca e veloce come un'asta: interfacce pulite, numeri grandi e leggibili, nessun gergo assicurativo verso i privati.

| Elemento | Proposta |
| --- | --- |
| Colore principale | Blu notte #0B1B33: fiducia; testi e intestazioni |
| Colore d'azione | Arancio #FF6A1A: asta, conto alla rovescia, pulsanti principali |
| Colore di conferma | Verde #12A150: risparmio, pagamenti riusciti |
| Neutri | Scala di grigi caldi per sfondi e bordi; contrasto almeno AA |
| Font | Inter per tutto, con cifre tabellari per i prezzi |
| Logo | Logotipo «AstAx» con la x finale che richiama un martelletto d'asta o una spunta; da far disegnare a un designer, per esempio a ClientUp Studio |
| Riferimenti per i privati | Revolut e Satispay: chiarezza su soldi, stati e conferme |
| Riferimenti per professionisti e back office | Stripe Dashboard e Linear: tabelle dense ma leggibili, filtri rapidi |
| Impostazione | Mobile per i privati; desktop per agenzie, broker e back office |
| Lingue | Solo italiano, back office compreso (ADR 0017, Dan, 2026-10-22). Testi in file di traduzione dal primo giorno |

## 9. Dati e scenari di prova

In sviluppo e collaudo si usano solo dati finti; i documenti reali servono solo a misurare la lettura AI, e vanno resi anonimi.

- **Dati sintetici:** un generatore di persone, codici fiscali validi, targhe e veicoli finti, agenzie e offerte di prova.
- **Documenti per la lettura AI:** 20 libretti, 20 patenti, 20 attestati e 20 PDF di preventivi di almeno 5 compagnie, con nomi, codici fiscali e targhe coperti, raccolti con il consenso degli interessati.

| Scenario di accettazione | Esito atteso |
| --- | --- |
| Privato, asta normale, con confronto AI | Migliore offerta per compagnia, suggerimento motivato, fee 35 €, emissione nei termini, classifica alle agenzie |
| Broker, il cliente compra dopo 10 giorni | Offerta ancora garantita, acquisto senza nuova asta, compenso di 30 € a carico del broker |
| Garanzie tutte scadute | Riconferma alle stesse agenzie entro 24 ore lavorative, nuove date di garanzia |
| Asta deserta | Riapertura automatica con filtri allargati, poi avviso al cliente |
| Mancata emissione per colpa dell'agenzia | Penale, passaggio alla seconda offerta, conferma del cliente o rimborso |
| Due offerte allo stesso prezzo | Vince la garanzia più lunga, poi la prima arrivata |
| Tentativo di leggere le offerte prima della chiusura, anche da amministratore | Accesso negato e registrato |
| Recesso nei termini | Rimborso con il flusso inverso e regola sul fee applicata |
| Premio sotto i 200 € | Fee ridotto applicato |
| Sub-agente di due agenzie invitate alla stessa asta | Può offrire per una sola |

## 10. Impostazione per Claude Code

Un repository unico, regole scritte in CLAUDE.md e lavoro a fasi piccole, ognuna chiusa da test automatici e da una revisione umana.

### Repository

Monorepo con pnpm e Turborepo:

- `apps/web`: Next.js per privati, broker e agenzie.
- `apps/admin`: pannello di back office e amministratore, separato per sicurezza.
- `apps/api`: backend NestJS.
- `apps/worker`: worker Temporal per aste e timer.
- `packages/shared`: tipi, validazioni con Zod, costanti di dominio.
- `packages/ui`: componenti condivisi.
- `packages/adapters`: un modulo per fornitore (targa, AI, FEA, pagamenti, SDI, notifiche), ognuno con una versione finta.
- `infra`: Terraform per AWS.
- `docs`: specifiche esportate da questo documento.

### Convenzioni

- TypeScript in modalità strict, Prisma per il database, Zod per validare ogni input.
- Importi sempre in centesimi interi; date salvate in UTC e mostrate in ora italiana.
- Test con Vitest e Playwright; GitHub Actions per controlli e rilasci.
- Segreti solo in AWS Secrets Manager; nessun dato reale nei test.

### Cosa mettere in CLAUDE.md

1. AstAx in dieci righe: cosa fa, per chi, come guadagna.
2. Stack, comandi per avviare, testare e rilasciare.
3. Struttura delle cartelle e dove va ogni cosa.
4. Regole che non si violano mai: busta chiusa, contatti dei clienti nascosti, permessi controllati nel backend, registro accessi, importi in centesimi.
5. Come scrivere i test e come chiudere una fase.

### Fasi

| Fase | Contenuto | Si chiude quando |
| --- | --- | --- |
| 1. Fondamenta | Monorepo, CI, autenticazione, organizzazioni e ruoli, registro accessi | Login con 2FA e permessi testati per ogni ruolo |
| 2. Richiesta e verifica | Procedura guidata, adattatori targa e AI finti, coda del back office | Una richiesta va dal privato alla verifica approvata |
| 3. Motore d'asta | Workflow, calendario lavorativo, busta chiusa con KMS, filtri e inviti | Un'asta apre e chiude da sola con offerte cifrate |
| 4. Offerte | Aree agenzia e sub-agente, presa in carico, modulo offerta, riconferma | Scenari di parità, riconferma e sub-agente superati |
| 5. Accettazione | Migliore offerta per compagnia, confronto AI, documenti, FEA e pagamento finti | Scenario del privato completo fino al pagamento |
| 6. Dopo l'acquisto | Emissione, rimesse, fatture, classifica, penali | Scenari privato, broker, mancata emissione e premio basso completi |
| 7. Pannelli e notifiche | Back office, amministratore, email, SMS, push | Tutti i parametri modificabili dall'interfaccia |
| 8. Fornitori reali e sicurezza | Sandbox vere, test di sicurezza, prova di carico | Tutti gli scenari superati in collaudo con fornitori veri |

## Fonti

- [IPSOA — RC auto: adeguati i massimali di garanzia (DM 31 maggio 2022)](https://www.ipsoa.it/documents/quotidiano/2022/06/28/rc-auto-natanti-adeguati-massimali-garanzia)
- [Automoto.it — Confrontare massimali, franchigie, rivalse e coperture accessorie](https://www.automoto.it/news/rc-auto-in-italia-premi-piu-cari-del-441-rispetto-a-francia-germania-e-spagna.html)
- [Facile.it — RC moto, offerte di ottobre 2026](https://www.facile.it/assicurazioni/news/assicurazioni-moto-di-ottobre-2026.html)
