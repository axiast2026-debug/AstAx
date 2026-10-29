# Piano: filtri e aste dell'agenzia, registrazione, richiesta lato agente (Dan, 2026-10-29)

**Stato:** approvato da Dan il 2026-10-29 e fatto ([ADR 0024](adr/0024-aste-aperte-a-tutte-le-agenzie.md)).

Vale per agenzie e sub-agenti: usano le stesse pagine.

## 1. Filtri e aste

**Oggi.** La pagina «Filtri» c'è già (tipo di veicolo, province, classe CU, sinistri, età, pacchetti, compagnie, decorrenza, validità, «senza documenti»), ma decide **a quali aste l'agenzia è invitata** (massimo 8 agenzie per asta, ASTA-04). In «Partecipa all'asta» l'agenzia vede **solo le aste a cui è invitata**, con pochi filtri (stato, veicolo, provincia, chiusura, pacchetto). Le email sono attive o spente per tipo di avviso, non per filtro.

**Cosa cambia.**

1. **«I miei filtri».** La pagina «Filtri» diventa la sezione in cui l'agenzia sceglie le aste che vuole ricevere **via email**. Un'asta che rispetta i filtri genera l'email «Nuova asta»; le altre no.
2. **«Partecipa all'asta».** L'elenco mostra **tutte le aste aperte** e ogni agenzia attiva (non sospesa) può fare un'offerta su ognuna (risposta A). Il limite delle 8 agenzie invitate, gli inviti di metà asta e la rotazione non servono più. Pausa, capacità giornaliera e orari di ricezione valgono solo per le email. Con un'asta deserta la riapertura manda l'email a tutte le agenzie con i filtri compatibili. Le regole ASTA-04, 05, 06, 08 si riscrivono in un ADR prima del lavoro. Sopra c'è un riquadro con gli stessi filtri della sezione «I miei filtri» e due pulsanti:
   - «Filtra», che usa i filtri scelti a mano lì;
   - «Applica i miei filtri», che filtra con i filtri salvati dell'agenzia (e quelli personali dell'utente), insieme a quelli scelti a mano.
3. **Contatti del cliente.** Nome, email e telefono non compaiono mai prima dell'acquisto: né nell'elenco, né nella richiesta, né nella scheda ANIA (oggi il nome del contraente, dei conducenti e dell'intestatario si vede). Restano visibili, come oggi, solo in «Da emettere», dopo il pagamento.

## 2. Registrazione

| Oggi | Dopo |
| --- | --- |
| IBAN chiesto nella registrazione, con il codice SMS | IBAN dell'agenzia chiesto **solo la prima volta che si invia un'offerta**, a chi la invia, anche un sub-agente, con il codice SMS sul suo telefono (risposta B); poi non più |
| Codice ISTAT del comune da scrivere | Si sceglie il comune dai suggerimenti, come per i privati; il codice ISTAT lo mette il sistema |
| Con un errore la pagina si svuota e si riscrive tutto | Restano tutti i dati scritti; si corregge solo il campo sbagliato, segnato in rosso con la spiegazione |
| Passo «Polizza di RC professionale» (PDF e scadenza) | Tolto |

Il broker non dà l'IBAN nella registrazione: gli viene chiesto la prima volta che serve, cioè quando AstAx gli deve pagare la prima provvigione (risposta B2).

## 3. La richiesta vista dall'agente

**Oggi.** La pagina mostra le sezioni Veicolo, Persone, Storia assicurativa e Richiesta, la scheda ANIA (se letta) e i documenti (libretto, patente, attestato, tessera sanitaria, altro; manca la carta d'identità).

**Dopo**, la pagina ha solo tre parti.

1. **Dati ANIA**, con la scritta «Dati ANIA per facilitare il vostro preventivo, da confrontare con documenti e libretto forniti.» Contiene tutti i dati ANIA disponibili tranne la scadenza della copertura e il nome dell'intestatario. Ci sono veicolo, categoria e uso, alimentazione, cilindrata, potenza, peso, prima immatricolazione, data di acquisto, data e luogo di nascita, sesso, residenza, classe CU e classe interna, compagnia attuale, scadenza del contratto e sinistri. In più ci sono:
   - il **codice fiscale** e l'**indirizzo** inseriti dal cliente;
   - la **tipologia del preventivo** confermata dal back office (rinnovo, prima immatricolazione, ecc.).
2. **La richiesta.**
   - **Guida:** libera o esperta.
   - **Garanzie:** RCA, più le altre del pacchetto scelto dal cliente.
   - **Scatola nera:** accetta o non accetta.
   - **Decorrenza, validità minima dell'offerta, durata dell'asta.**
3. **I documenti**, tutti quelli caricati dal cliente, compresa la carta d'identità (risposta C). Il nome del cliente si vede quindi solo nei documenti; email e telefono mai.

Le sezioni Veicolo, Persone e Storia assicurativa non ci sono più.

## 4. Date

Tutte le date in **GG/MM/AAAA**, con l'ora quando serve (29/10/2026 10:00). Vale per sito, back office, email e PDF. Oggi molte sono scritte «29 ottobre 2026».

## Risposte di Dan (2026-10-29)

- **A.** Tutte le agenzie vedono tutte le aste aperte e possono offrire; i filtri decidono solo le email.
- **B.** L'IBAN alla prima offerta lo inserisce chi la invia. Al broker l'IBAN si chiede solo quando serve la prima volta.
- **C.** I documenti caricati dal cliente restano visibili all'agente prima dell'acquisto.

## Passi

1. Date in GG/MM/AAAA ovunque (una funzione sola, con prove).
2. Richiesta lato agente: nuova pagina, scheda ANIA senza nome e senza scadenza della copertura, codice fiscale, indirizzo e tipologia; carta d'identità tra i documenti; prove che nome, email e telefono non escono (VIS-01).
3. Registrazione: comune dai suggerimenti, dati che restano dopo un errore, niente RC professionale, IBAN alla prima offerta.
4. Aste aperte a tutte le agenzie (ADR): offerta senza invito, email solo per le aste nei filtri, elenco di tutte le aste con «Filtra» e «Applica i miei filtri».
5. Prove (unità, integrazione, E2E dell'agenzia e della registrazione), documenti, `pnpm check`, push; la demo si aggiorna da sola.
