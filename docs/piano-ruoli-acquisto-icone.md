# Piano: ruoli, acquisto diretto degli intermediari, icone al posto delle descrizioni

Richiesta di Dan del 2026-10-30. Stato: **da approvare**.

**Risposte di Dan (2026-10-30):**
1. **Team:** il team resta, solo per i dipendenti del titolare (agente o broker). Sub-agenti e collaboratori sez. E si iscrivono sempre da soli.
2. **Collaboratore del broker:** ha gli stessi poteri del broker, tranne creare un team.
3. **Pagamento:** paga l'intermediario, subito, quando sceglie l'offerta. Il cliente dopo firma soltanto, con OTP. Per il legale: l'intermediario paga il premio per conto del cliente prima della firma del cliente. Va aggiunto a `docs/punti-aperti.md`.
4. **«Invia al cliente»:** si toglie. Resta solo «Scegli e acquista».

## 1. Ruoli

**Chi chiede un preventivo:**
- privati;
- broker (sez. B);
- collaboratori (sez. E) di un broker;
- agenti (sez. A);
- sub-agenti (sez. E) di un agente.

**Chi offre:**
- agenti (sez. A);
- sub-agenti (sez. E) di un agente.

**Oggi.** Chiedere un preventivo e offrire funzionano già così (ADR 0015 e 0024). Cambia solo quello che segue.

1. **Iscrizione uguale per sub-agenti e collaboratori.** Entrambi si iscrivono da «Lavora con AstAx» con il proprio numero RUI sez. E e il numero RUI di chi li ha incaricati (agente A o broker B). Il back office li verifica, poi hanno un proprio account.
   - Oggi questo percorso esiste già per tutti e due: lo rendo identico nei testi e nei passi.
   - Si toglie il vecchio caso «collaboratore aggiunto dal titolare senza RUI», che resta solo per i dipendenti (vedi domanda 1).
2. **Il sub-agente può fare tutto quello che fa l'agente, tranne creare un team.** Il sub-agente iscritto con il suo RUI sez. E:
   - vede ed è padrone dei suoi filtri, prodotti, contabilità, registro accessi, dati e IBAN, come l'agente;
   - non vede la voce «Team» e l'API rifiuta l'invito di colleghi (403).
   - Lo stesso vale per il collaboratore del broker rispetto al broker (vedi domanda 2).
3. **Testi e documenti.** Aggiorno `docs/permessi.md`, il glossario, la specifica dell'agenzia e del broker e `CLAUDE.md`, che dice ancora «chiedono solo privati e broker».
   - Un ADR nuovo fissa la regola «sez. E = stessi poteri del titolare, senza team».

## 2. Acquisto diretto da parte dell'intermediario

**Oggi.** A fine asta il broker spunta le offerte e le manda al cliente con «Invia al cliente». È il cliente che sceglie, firma con OTP e paga dal link. I contatti del cliente servono già all'invio.

**Nuovo.** Broker, collaboratore, agente e sub-agente, a fine asta:

1. **Scelgono** direttamente l'offerta che interessa e la **acquistano**, pagando subito ad AstAx il premio (risposta 3). L'offerta è bloccata da quel momento.
2. **In un secondo momento** inseriscono telefono ed email del cliente. AstAx manda al cliente il link per la **firma con OTP** (FEA) dei documenti.
3. Dopo la firma l'agenzia vincitrice riceve i contatti ed emette, come oggi.

Il pulsante «Invia al cliente» e la scelta del cliente tra più offerte spariscono (risposta 4).

**Regole che restano:**
- i contatti del cliente non arrivano all'agenzia prima del pagamento confermato;
- la fee dell'intermediario resta 30 € (agenzia 15 €), solo a polizza acquistata.

**Da fare:**
- pulsante «Scegli e acquista» sulle offerte;
- pagina «Da completare» con i contatti mancanti;
- correzione dei contatti del cliente (oggi non si possono modificare);
- promemoria se i contatti non arrivano entro la data del prezzo garantito.

## 3. Icone al posto delle descrizioni

**Oggi.** Sotto il titolo di circa 67 riquadri (35 nel portale, 32 nel back office) c'è una riga di spiegazione in grigio.

**Nuovo.** Accanto al titolo compare una piccola icona «i». Passando sopra con il mouse si apre una finestrella con la spiegazione. Lo stesso succede toccandola dal telefono o arrivandoci con la tastiera. La riga sotto il riquadro sparisce.

- Componente unico `InfoTip` in `packages/ui`, usato ovunque.
- **Restano scritti per esteso**, perché devono essere letti senza cliccare:
  - avvisi;
  - errori;
  - testi legali e consensi;
  - la frase dei dati per il preventivo.

## Prove

- Permessi a tabella aggiornati: il sub-agente ha tutto meno `team.manage`, e lo stesso il collaboratore.
- Integrazione:
  - iscrizione del sub-agente e del collaboratore;
  - acquisto diretto, poi contatti, poi firma OTP, poi emissione;
  - i contatti non escono prima del pagamento.
- E2E:
  - broker che sceglie e acquista, poi inserisce i contatti;
  - icona che apre la spiegazione.

## Ordine di lavoro

1. Ruoli e permessi.
2. Icone.
3. Acquisto diretto, il più lungo.

Ogni parte va in demo appena pronta.
