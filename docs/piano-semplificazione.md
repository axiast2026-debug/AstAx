# Piano: meno clic dalla richiesta al pagamento

**Stato:** proposta per Dan (2026-10-19). Niente codice finché Dan non approva.

**Obiettivo:** il privato va dalla richiesta al pagamento con meno clic e meno passaggi a vuoto, senza perdere controlli, firme e consensi che servono per legge.

## Il percorso di oggi (privato)

Conteggio dalle schermate attuali, con un'auto e un solo conducente. Sono escluse le attese del back office e dell'asta.

| Tratto | Cosa fa il cliente | Clic | Va a prendere un codice |
| --- | --- | --- | --- |
| Accesso | «Entra con il codice», email, «Inviami il codice», incolla il codice | 3 | 1 (email) |
| 1. Veicolo | Libretto (scegli il file + «Carica»), targa + «Cerca», «Continua», attestato (scegli + «Carica») | 6 | — |
| 2. Chi guida | Patente (scegli + «Carica»), dati, «Continua» | 3 | — |
| 3. Copertura | Pacchetto, decorrenza, «Continua» | 3 | — |
| 4. Asta | Durata, validità, «Continua» | 3 | — |
| 5. Consensi | «Mandami il codice», incolla il codice, «Conferma», «Continua» | 3 | 1 (email) |
| 6. Riepilogo | «Invia la richiesta» | 1 | — |
| Offerte | Apri l'avviso, (confronto AI: 2), «Scegli questa offerta» | 2-4 | — |
| Firma | «Ho letto i documenti», «Firma i documenti», codice, «Firma» | 3 | 1 (SMS/email) |
| Pagamento | «Paga …», dati della carta, «Paga con carta» | 2 | — |
| **Totale** | | **~29-31 clic, 9 schermate** | **3 codici** |

I punti più pesanti sono quattro:
- i documenti si caricano uno alla volta, ognuno con il suo pulsante «Carica» e una pagina che si ricarica;
- ci sono sei passi solo per fare la richiesta;
- servono tre codici diversi (accesso, consensi, firma);
- firma e pagamento sono due momenti separati.

## Proposte

Ogni proposta si approva da sola. Le stime sono sui clic del privato.

| # | Proposta | Clic in meno | Serve il legale? |
| --- | --- | --- | --- |
| **A** | **Documenti per primi, tutti insieme.** Una sola schermata iniziale: «Fotografa o carica libretto, patente e attestato». Si caricano da soli appena scelti, senza il pulsante «Carica», e l'AI li legge e compila veicolo, persone, patente e storico. Il cliente controlla e corregge invece di scrivere. Dal telefono si apre la fotocamera. La ricerca della targa parte da sola. | 5-6 | No |
| **B** | **Da 6 passi a 3:** «Documenti e dati» (veicolo e chi guida), «Copertura e asta» (pacchetto, decorrenza, durata, validità), «Conferma e invia» (riepilogo, consensi, invio). Valori già scelti al posto delle domande: durata predefinita, validità predefinita, pacchetto suggerito dalla polizza attuale, il contraente come conducente. | 3-4 | No |
| **C** | **Consensi nel riepilogo, senza codice a parte.** Il privato è appena entrato con il codice email: le spunte dei consensi più «Invia» bastano, e il registro salva ora, testo e versione. Oggi i consensi chiedono un secondo codice. | 3 | **Sì** (LEG-04: oggi «confermati con un codice») |
| **D** | **Accesso con un clic dall'email.** Nell'email del codice c'è anche un pulsante «Entra»: un clic e sei dentro, senza copiare il codice. Lo stesso link apre la richiesta giusta quando arrivano le offerte. | 1-2 | No (stessa sicurezza: link monouso, 10 minuti) |
| **E** | **Offerte, confronto AI e scelta nella stessa pagina.** Il confronto AI diventa un interruttore sulla pagina delle offerte, con l'avviso del costo; niente pagina separata. «Scegli» porta direttamente alla firma. | 1-2 | No |
| **F** | **«Firma e paga» in un solo passaggio.** Una pagina con il riepilogo, i documenti da leggere (link) e un pulsante «Firma e paga»: dopo il codice di firma si va da soli al pagamento, senza un altro «Paga». | 2 | No (la firma resta prima del pagamento) |
| **G** | **Pagamento veloce:** Apple Pay e Google Pay (con Fabrick, se lo offre) e carta ricordata dal fornitore per i rinnovi. | 1-2 | No (va verificato con Fabrick) |
| **H** | **Clienti che tornano:** per un rinnovo o un secondo veicolo, dati di persone e patenti già compilati; il cliente carica solo i documenti nuovi. | molti, nei rinnovi | No |
| **I** | **Approvazione automatica delle richieste «verdi»** (il parametro c'è già, oggi spento): l'asta parte subito quando tutti i controlli sono verdi. Non toglie clic al cliente ma toglie ore di attesa. | — (tempo) | Decisione di Dan |

**Con A-F il percorso passa da circa 30 a circa 14-16 clic, da 9 a 5 schermate, e da 3 a 1-2 codici** (2 se il legale non approva C).

## Cosa non cambia

- La busta chiusa, i controlli del back office, la firma FEA con il suo codice (legge sulla firma elettronica), il pagamento sicuro sulla pagina del fornitore.
- I testi legali restano quelli dell'archivio con versioni.

## Il broker

Valgono le stesse proposte A, B ed E. In più:
- **J.** Il link al cliente porta direttamente all'offerta da firmare e pagare, con un solo codice per entrare, firmare e pagare (oggi: codice di accesso al link, poi codice di firma).

Va verificato con il legale e con Namirial se lo stesso codice può valere per la firma.

## Come misuriamo

- Una prova automatica (Playwright) che conta i clic e le schermate del percorso S01, prima e dopo: deve scendere sotto la soglia approvata da Dan.
- Nel cruscotto dell'amministratore, l'«imbuto»: quante richieste si fermano a ogni passo e quanto tempo passa da un passo all'altro. Solo numeri, mai dati personali.

## Ordine di lavoro proposto

1. **D, E, F**: interventi veloci sulle pagine che ci sono già.
2. **B**: unire i passi della richiesta.
3. **A**: documenti per primi, con la lettura AI (usa l'adattatore già pronto).
4. **C** e **J**: dopo il parere del legale.
5. **G** e **H**: con i contratti di Fabrick e con i primi rinnovi.
6. Prova automatica dei clic e imbuto nel cruscotto, poi la demo per Dan.

## Domande per Dan

1. Quali proposte approvi (A-J)?
2. Obiettivo: «al massimo 15 clic dalla richiesta al pagamento» va bene come soglia?
3. Accendiamo l'approvazione automatica delle richieste verdi (I)?
