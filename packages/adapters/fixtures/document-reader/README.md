# Esempi del lettore di documenti finto

Dati inventati (CLAUDE.md, regola 11). Il lettore finto sceglie il file di esempio dal nome del file caricato: `libretto-giulia-neri.jpg` usa `REGISTRATION_CERTIFICATE/giulia-neri.json` (i nomi disponibili sono in `index.json` di ogni cartella), altrimenti `default.json`. Un nome che contiene `low-confidence` dà confidenza 0,6 a tutti i campi. `@today+30` è la data di 30 giorni dopo oggi. I dati tecnici del libretto vengono dalla ricerca per targa finta, così i due finti coincidono.
