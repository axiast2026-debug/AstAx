# Piano: i dati del bot al posto di «Completa i dati» (Dan, 2026-10-28)

**Stato:** approvato da Dan il 2026-10-28 e fatto ([ADR 0023](adr/0023-dati-dal-bot.md)).

## Cosa ha chiesto Dan

- «Completa i dati» nel back office non c'è più.
- L'operatore ha **una sola spunta**: «Confermo la correttezza dei dati estratti dal bot». Con la spunta la richiesta va **subito all'asta**.
- I dati estratti dal bot e confermati li vedono anche le agenzie e i sub-agenti che fanno l'offerta (VIS-01: tutti i dati utili al preventivo, mai telefono ed email del cliente).
- Le 5 verifiche restano (risposta di Dan). Se il bot non trova un dato, «bastano i dati che riesce a estrapolare il bot»: nessun campo da compilare a mano.

## Da dove vengono i dati

| Dato | Da dove |
| --- | --- |
| Targa, residenza, guida, coperture, durata dell'asta | Richiesta del cliente |
| Cognome, nome, codice fiscale | Libretto o carta d'identità; se mancano, ANIA (intestatario) |
| Data di nascita | Richiesta (corretta nella verifica 4); sesso e luogo dal codice fiscale |
| Marca, modello, alimentazione, cilindrata, potenza, prima immatricolazione | Dati dalla targa e ANIA (modello e allestimento da Prima) |
| Tipo e uso del veicolo | ANIA, «Categoria/Uso» (AUTOVETTURA → Autovettura, MOTOCICLO → Motociclo, AUTOCARRO → Autocarro, PROPRIO → Uso privato) |
| Data di acquisto | ANIA (immatricolazione più vecchia con il codice fiscale dell'intestatario) |
| Classe CU, compagnia, scadenza, sinistri ultimi 5 anni | ANIA (ultimo attestato e ultima copertura) |
| Provenienza | Tipologia confermata nella verifica 5 |

## Cosa cambia

1. **Back office.** Al posto di «Completa i dati»: la scheda per le agenzie (già oggi) con, in fondo, la spunta «Confermo la correttezza dei dati estratti dal bot» e il pulsante «Approva e apri l'asta». La spunta si può dare solo dopo «Leggi da ANIA» e con le 5 verifiche fatte; un clic crea la versione dei dati e apre l'asta.
2. **Dati mancanti.** Se il bot non trova un dato (per esempio la targa non è in ANIA, o la «Categoria/Uso» è un codice non riconosciuto), quel dato resta **«non disponibile»** e l'asta parte lo stesso. Diventano facoltativi nel modello: data di acquisto, alimentazione, potenza, prima immatricolazione, luogo di nascita, sesso, classe CU (come oggi), sinistri. Restano obbligatori, perché servono a scegliere le agenzie: targa, tipo di veicolo, provincia di residenza, data di nascita, pacchetto. Il tipo di veicolo, se ANIA non lo riconosce, è «Autovettura» con l'avviso «da verificare sul libretto» in vista anche alle agenzie.
3. **Agenzie e sub-agenti.** Nella pagina della richiesta un riquadro «Dati ANIA confermati dal back office»: veicolo, data di acquisto, classe CU e classe interna, compagnia attuale, scadenze, sinistri principali e paritari degli ultimi 5 anni, avvisi. Il nome e il codice fiscale dell'intestatario restano come oggi nei dati della richiesta; telefono ed email mai (VIS-01, regola 2).
4. **Registro.** La conferma finisce nel registro attività con chi e quando; i dati ANIA restano cifrati.

## Passi

1. Modello: campi facoltativi, conversione della scheda ANIA nei dati della richiesta (funzione pura con le sue prove), versione «BOT_CONFIRMED» dei dati.
2. API: «conferma e approva» in un passo; la scheda ANIA confermata salvata sulla richiesta e mostrata alle agenzie invitate (con il registro delle aperture, VIS-09).
3. Back office: via «Completa i dati», spunta e pulsante.
4. Agenzie: il riquadro dei dati ANIA.
5. Prove (unità, integrazione, E2E del back office e dell'agenzia), documenti, `pnpm check`, push, demo.
