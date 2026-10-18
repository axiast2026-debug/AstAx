# Mappa dei dati personali (fase 8, per la valutazione d'impatto)

Documento di supporto per la DPIA del DPO (`docs/punti-aperti.md`, «DPO e privacy»). Descrive quali dati tratta AstAx, dove stanno, chi li vede e quanto restano, come è fatto oggi il codice. Le basi giuridiche e i ruoli (titolare, responsabile) li decide il DPO.

## Persone interessate

| Chi | Come entra in AstAx |
| --- | --- |
| Privati | Account con codice email; chiedono preventivi per sé o per un'altra persona (domanda 12) |
| Clienti dei broker | Senza account: il broker inserisce i dati, il cliente dà il consenso dal link |
| Contraenti, proprietari, conducenti | Nei dati della richiesta |
| Utenti di agenzie e broker | Account professionale con password e TOTP |
| Personale di AstAx (anche in Albania) | Account staff con password e TOTP |

## Dati, luogo, accesso, conservazione

| Dati | Esempi | Dove | Protezione | Chi li vede | Quanto restano |
| --- | --- | --- | --- | --- | --- |
| Identità e contatti | Nome, email, telefono | PostgreSQL (`User`, `Customer`, `Person`) | Email, telefono, codice fiscale, partita IVA, IBAN cifrati per campo (SIC-03); ricerca con indice cieco | La persona; il back office; l'agenzia vincitrice solo dopo il pagamento (VIS-02) | Per il contratto: 10 anni; richieste non concluse: 12 mesi (LEG-06) |
| Dati della richiesta | Veicolo, storia assicurativa, conducenti, classe CU | PostgreSQL (`QuoteDataVersion`, cifrato) | Cifratura del documento intero; colonne derivate senza dati identificativi per le agenzie (VIS-01) | Richiedente, back office; le agenzie invitate senza nomi e contatti | Come sopra |
| Documenti | Libretto, patente, attestato, carta d'identità | S3 (bucket documenti, SSE-KMS) | Mai link diretti alle agenzie; filigrana con chi li apre (VIS-10); ogni apertura registrata | Back office, agenzie invitate (filigranati) | Come sopra; cancellati dalla conservazione |
| Firme | Documenti firmati, prove della firma | S3; fornitore FEA (Namirial) | Come i documenti | Il cliente, il back office | 10 anni (contratto) |
| Pagamenti | Esito, metodo, importi | PostgreSQL; fornitore (Fabrick) | Nessun numero di carta in AstAx | Il cliente, la contabilità | 10 anni (contabilità) |
| Fatture | Intestatario, codice fiscale, importi | PostgreSQL, S3, SDI tramite Openapi | Intestatario cifrato | Il destinatario, la contabilità | 10 anni |
| Confronto AI | Offerte, pesi, testo della spiegazione | PostgreSQL; Claude su Bedrock (UE) | A Bedrock vanno solo i riassunti delle offerte, senza dati personali | Il richiedente | Con la richiesta |
| Lettura dei documenti con l'AI | Immagini dei documenti | Claude su Bedrock (UE), solo per la lettura | AWS non usa i dati per l'addestramento; nessuna conservazione presso il fornitore oltre la richiesta | — | Non conservati dal fornitore |
| Registro attività | Chi ha fatto cosa, quando, da quale IP | PostgreSQL (catena di hash) e copie S3 con Object Lock | Solo in aggiunta (SIC-04) | Amministratori, back office per le sue parti | 10 anni (da confermare con il DPO) |
| Accessi | Accessi riusciti e falliti, IP | Keycloak (7 giorni), registro attività | — | Amministratori | Come il registro |
| Notifiche e messaggi in coda | Testo, indirizzo o numero | PostgreSQL (`Notification`, `MessageOutbox` cifrato e svuotato dopo l'invio) | Contenuto cifrato | Il destinatario | Notifiche: con l'account; coda: vuota dopo l'invio |
| Log tecnici ed errori | Identificativi, tempi, stati | CloudWatch, Sentry (UE), Grafana (UE) | Mai dati personali (regola 8, controllo Semgrep) | Tecnici | Log: 90 giorni (collaudo), 400 (produzione) |

## Trasferimenti e accessi dall'estero

- Tutti i dati restano in AWS Milano (`eu-south-1`); i fornitori sono nell'UE (elenco in `fornitori.md`).
- Il back office può lavorare dall'Albania (paese fuori dall'UE): accede dal browser, i dati restano in UE, ogni apertura è registrata. Le garanzie per l'accesso da un paese terzo le decide il DPO.

## Misure che il codice applica già

Cifratura a riposo e in transito; busta chiusa (nessuno legge le offerte prima della chiusura, `docs/busta-chiusa.md`); permessi per ruolo con negazione predefinita e sicurezza a livello di riga; registro degli accessi non modificabile; contatti alle agenzie solo dopo il pagamento; conservazione automatica (LEG-06); esportazione e richieste dell'interessato dal back office; limiti di frequenza e blocco dopo tentativi sbagliati.
