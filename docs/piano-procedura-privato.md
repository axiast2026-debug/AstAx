# Piano: procedura del privato più semplice (richieste di Dan, 2026-10-28)

**Stato:** Dan ha chiesto di procedere senza attendere l'approvazione del piano («una volta scritto il piano procedi senza autorizzazione»). Dove serviva una sua decisione ho scelto la strada più prudente: le scelte sono segnate **[scelta]** qui sotto e nelle domande 33–37 di `docs/domande-aperte.md`, da confermare o correggere dopo.

Prima di questo lavoro, in coda: codice automatico al cliente del broker, poi B3, B4, B5 della revisione UX (`docs/stato.md`, «In coda»).

## Cosa ha chiesto Dan

1. Al primo accesso (email e codice) il privato inserisce **nome, cognome e telefono**; la home dice **«Ciao {nome}»**.
2. Nella richiesta di preventivo per un veicolo **già assicurato**: **libretto e carta d'identità**; non più patente né attestato di rischio.
3. Documenti in **PDF o JPG**, anche **più file insieme**.
4. Dopo il caricamento dei documenti, **targa, data di nascita e gli altri campi vuoti**, non precompilati.
5. Data di nascita: va bene il formato, ma si deve poter **incollare**.
6. **Comune** da un elenco completo, con i suggerimenti mentre si scrive; si sceglie dall'elenco.
7. **CAP e provincia** compilati da soli se il comune ha un solo CAP; se ne ha più di uno, il cliente sceglie quello giusto.
8. Se all'«Avanti» c'è un errore, il cliente **corregge solo quel campo**, senza riscrivere tutto.
9. **Coperture in tre scelte:**
   - «RCA obbligo di legge»;
   - «Consigliate», più distinguibili: RCA, assistenza stradale, infortuni del conducente, tutela legale;
   - «Su misura»: eventi naturali **separati** da atti vandalici, più **kasko collisione**, **full kasko** e **collisione con animali selvatici**.
10. **Niente «Da quando vuoi essere assicurato»** e niente data di decorrenza.
11. Niente scritta piccola sul premio annuale («Il pagamento è annuale.»).

## Come lo faccio, in passi

Ogni passo ha i suoi test e il suo commit, con `pnpm check` verde; le prove end-to-end toccate si aggiornano e si lanciano una alla volta; la suite completa la fa la CI.

### Passo 1 — Primo accesso e «Ciao nome»

- API: `PUT /me/profile` solo per i privati (nome, cognome, telefono cellulare italiano), telefono cifrato come oggi (`phoneEnc`, `phoneHash`), registro attività (regola 4). Il permesso è nuovo e solo dei privati (tabella di `docs/permessi.md` e test a tabella).
- Sito: dopo i documenti legali, se a un privato manca nome, cognome o telefono, `requireViewer` lo porta a `/benvenuto` («Come ti chiami?»): tre campi e «Continua». Poi la home con «Ciao {nome}». Il profilo mostra i dati e permette di correggerli.
- Il telefono serve dopo all'agenzia vincitrice (oggi per i privati era quasi sempre vuoto): resta visibile solo a chi vince e dopo il pagamento (regola 2).
- **[scelta]** Telefono obbligatorio, cellulare italiano (`+39 3…`): serve all'agenzia per l'emissione.

### Passo 2 — Data di nascita che si può incollare

- Al posto del calendario del browser, un campo di testo «gg/mm/aaaa» che accetta anche `12/03/1985`, `12-03-1985`, `12.03.1985`, `12031985` e `1985-03-12`, incollati o scritti; le barre si aggiungono da sole. Funzione di dominio `parseItalianDate` in `packages/shared`, con test; la stessa per la data di nascita del familiare (classe di merito).

### Passo 3 — Comune con suggerimenti, CAP e provincia da soli

- Campo «Comune» con suggerimenti mentre si scrive (da 2 lettere, i 7.896 comuni ISTAT di `seed/comuni.csv`), scelta obbligatoria dall'elenco; il sito salva il codice ISTAT, non il nome scritto.
- CAP: nuovo file `seed/cap.csv` (codice ISTAT → CAP) ricavato da GeoNames (licenza CC BY 4.0, attribuzione in `seed/`), con uno script per rigenerarlo. Comune con un CAP → CAP e provincia compilati e bloccati; con più CAP (Roma, Milano, Napoli… 45 comuni) → elenco dei CAP da scegliere; comune senza CAP nei dati (198 comuni nati da fusioni recenti) → CAP da scrivere, 5 cifre.
- **[scelta]** Dati aperti di GeoNames invece dell'elenco ufficiale di Poste (a pagamento): coprono il 97,5% dei comuni e il CAP resta correggibile.

### Passo 4 — Gli errori non cancellano quello che è stato scritto

- I passaggi «Dati», «Guida» e «Copertura» diventano moduli che, se c'è un errore, restano come sono: si colora solo il campo sbagliato con il suo messaggio e il cursore va lì. I valori non passano mai nell'indirizzo della pagina (regola 8).

### Passo 5 — Documenti: libretto e carta d'identità, più file, niente precompilazione

- Già assicurato e nuovo: **libretto e carta d'identità** (`intakeDocuments`), niente patente né attestato di rischio. **[scelta]** Tolto anche l'attestato facoltativo.
- Ogni documento accetta più file (fronte e retro, più pagine), PDF o JPG (e PNG/WEBP come oggi), fino a un numero massimo dai parametri (`documents.maxFilesPerDocument`, 4); ogni file si può togliere. Il bot legge tutti i file del documento insieme.
- I campi del modulo non si precompilano più dalla lettura del bot (spariscono le frasi «Letta dal libretto…»): il cliente scrive i suoi dati, il bot li confronta e il back office vede le differenze come oggi.
- Le regole che usavano la patente (data di rilascio, scadenza, neopatentati) passano al back office: la verifica li completa se servono. **[scelta]**

### Passo 6 — Coperture in tre scelte e garanzie nuove

- Tre scelte: «RCA obbligo di legge» (pacchetto BASE), «Consigliate» (RCA, assistenza stradale, infortuni del conducente, tutela legale, con l'elenco ben visibile nella scheda) e «Su misura».
- Su misura: eventi naturali e atti vandalici **separati**; nuove **kasko collisione**, **full kasko**, **collisione con animali selvatici**; restano furto e incendio, cristalli, rinuncia alla rivalsa.
- Modello delle coperture (`packages/shared/src/domain/coverage.ts`), pacchetti in `seed/pacchetti.json` (nuove versioni), modulo dell'offerta dell'agenzia, controllo di conformità, confronto AI e testi. Le richieste già fatte con «eventi naturali e atti vandalici» insieme restano leggibili. ADR per il cambio del modello.

### Passo 7 — Niente decorrenza nella richiesta del privato, niente «Il pagamento è annuale.»

- Il privato non sceglie più la decorrenza. **[scelta]** La richiesta del privato parte con la decorrenza «immediata» già prevista (`ON_ISSUANCE`: la polizza copre da quando l'agenzia la emette, mai prima, `docs/piano-decorrenza.md`), e il back office può fissare una data in verifica se il cliente la chiede (oggi già possibile). Il broker continua a sceglierla (lotti, scadenze dei clienti).
- Tolta la frase «Il pagamento è annuale.» dalla scelta delle coperture.

### Passo 8 — Prove, documenti, demo

- Prove end-to-end toccate (fase 2, S01, S02…), specifiche 02 e 09, regole di dominio, `docs/stato.md`.
- La demo online si aggiorna solo se Dan lo chiede.

## Domande per Dan (scelte prudenti già applicate)

Sono le domande 33–37 in `docs/domande-aperte.md`.
