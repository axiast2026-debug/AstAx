# Piano: verifica del back office più chiara e bot ANIA in AstAx (Dan, 2026-10-28)

**Stato:** risposte di Dan del 2026-10-28 (domande 39–42 di `docs/domande-aperte.md`). Il disegno della schermata si approva prima del codice (domanda 42): https://claude.ai/artifact/1zZsouJx6sV1PqCGXF8QzM (privato, visibile a Dan). Prima di questo lavoro resta in coda: codice automatico del broker, poi B3, B4, B5 (`docs/stato.md`, «In coda»).

## Cosa ha chiesto Dan

1. **Presa in carico visibile a tutti.** Quando un operatore preme «Prendo io in carico», tutto il back office vede che la pratica è sua.
2. **Una schermata di verifica nuova**, chiara e con poche cose. Per ora l'operatore fa cinque verifiche:
   - **Libretto:** si apre, è leggibile e corrisponde al preventivo → spunta;
   - **Documenti d'identità:** si aprono, sono leggibili e corrispondono → spunta;
   - **Targa:** corretta → spunta, oppure la corregge in base al libretto;
   - **Data di nascita** del titolare del veicolo: corretta → spunta, oppure la corregge in base ai documenti;
   - **Tipologia del preventivo:** la conferma (per esempio «Rinnovo») → spunta; e conferma che il preventivo è fattibile.
3. **Bot ANIA dentro AstAx**, costruito da capo, «uguale identico» a quello fatto per CorteXa: con la sola targa legge la Banca Dati ANIA e prepara una scheda con tutti i dati essenziali del preventivo, da mandare all'agenzia che fa la quotazione.

## Scelte già fatte (Dan, 2026-10-28)

- **Presa in carico:** fascia in alto «In carico a Mario Rossi dalle 10:32». Solo chi ha preso la pratica può approvare, escludere o chiedere un'integrazione; gli altri vedono. Il supervisore può riassegnarla.
- **Tipologie:** Rinnovo (già assicurato), Veicolo nuovo prima polizza, Classe da un familiare (Bersani / RC familiare), Classe da un mio veicolo venduto o rottamato.
- **Pratica non fattibile:** dalla stessa schermata «Chiedi un documento al cliente» (integrazione) o «Escludi» con il motivo. «Approva e apri l'asta» si accende solo con le cinque spunte fatte e la scheda per le agenzie completa.
- **ANIA:** il bot legge dal portale agenzie Allianz, come quello di CorteXa, solo con il via scritto di Allianz per l'uso da parte di AstAx (punto per il legale in `docs/punti-aperti.md`). Le credenziali le inserisce Dan sul server, nel terminale, mai in chat.
- **Codice del bot vero in un repository privato** separato; AstAx (pubblico) tiene la «presa» (porta) e la versione finta.
- **Dati veri solo in produzione** (regola 11): sviluppo e demo usano un ANIA finto che risponde come quello vero, con targhe e persone inventate.

## Passi

1. **Presa in carico.** API: le azioni di decisione (approva, escludi, integrazione, correzione, completamento) le fa solo chi ha la pratica; il supervisore la riassegna, con il registro attività. Back office: fascia in cima alla pratica, colonna «In carico a» nell'elenco con il filtro «Le mie», aggiornamento in tempo reale dell'elenco quando qualcuno prende una pratica.
2. **Disegno della schermata** (questo documento ha il link): Dan lo approva o lo corregge.
3. **Le cinque spunte.** Modello: le cinque verifiche con chi e quando, salvate sulla pratica e nel registro; targa e data di nascita correggibili (nuova versione dei dati, come le correzioni di oggi); tipologia confermata.
4. **Schermata nuova.** Documenti grandi a sinistra (libretto e carta d'identità, ogni file, PDF e foto, con lo zoom); a destra le cinque spunte; sotto la scheda per le agenzie; in fondo «Approva e apri l'asta», «Chiedi un documento», «Escludi». Cronologia, versioni, controllo automatico e agenzie invitate in sezioni chiuse in fondo («Altro»).
5. **Porta ANIA e ANIA finto.** `AniaPort` in `packages/adapters` con la scheda dello stesso formato del bot di CorteXa (`SchedaAnia` e `datiPreventivo`), le stesse regole (date senza ora, scadenza di copertura e di contratto, nominativo solo se il codice fiscale coincide, peso solo per gli autocarri, nascita dal codice fiscale, categoria e uso separati, avviso «verificare sul libretto di circolazione» quando il codice non è chiaro, data di acquisto dalla riga di immatricolazione più vecchia). La versione finta risponde con dati inventati.
6. **Scheda per le agenzie.** «Leggi da ANIA» con la sola targa: i dati letti riempiono la scheda (veicolo, intestatario, storia assicurativa: classe CU, compagnia, scadenze, sinistri), con l'indicazione «da ANIA»; l'operatore corregge se serve; la scheda diventa i dati della richiesta che vedono le agenzie (sempre senza i contatti del cliente, regola 2).
7. **Bot ANIA vero** nel repository privato, che si collega alla porta solo in produzione e si accende quando c'è il via di Allianz e le credenziali sono sul server.
8. **Prove e documenti:** test della presa in carico (a tabella con i ruoli), delle spunte e della scheda; E2E del back office aggiornate; specifica 06, regole e `docs/stato.md`.
