# Prova guidata con Dan

Un passo alla volta: Dan prova, dice cosa vede, si corregge un errore alla volta. Ambiente locale (http://localhost:3000 sito, http://localhost:3001 back office, http://localhost:8025 posta di prova), solo dati inventati.

## Percorso

| # | Chi | Cosa | Esito |
| --- | --- | --- | --- |
| 1 | Giulia Neri (privato) | Entra con il codice email, compila e invia una richiesta per un'auto | |
| 2 | Arta Hoxha (verificatore) | Trova la richiesta, la controlla e la approva: parte l'asta | |
| 3 | Anna Moretti (Agenzia Uno), Carla Fontana (Agenzia Tre) | Vedono la richiesta, la prendono in carico, mandano un'offerta | |
| 4 | Arta Hoxha | Con gli strumenti di sviluppo chiude l'asta subito | |
| 5 | Giulia Neri | Vede le offerte, chiede il confronto AI, sceglie, firma, paga con la carta di prova | |
| 6 | Agenzia vincitrice | Riceve i contatti, carica polizza e documenti, segna emessa | |
| 7 | Agenzie | Vedono la classifica nei «Risultati» | |
| 8 | Laura Bianchi (broker) | Richiesta per un cliente, link al cliente, firma e pagamento dal link | |
| 9 | Nuova agenzia | Domanda di ingresso dal sito; Ilaria Volpe (supervisore) la approva | |
| 10 | Fabio Serra, Ilaria Volpe | Rimesse, fatture, rimborsi | |
| 11 | Paola Ricci (amministratore) | Parametri, testi, registro attività, cruscotto | |

## Errori trovati

| # | Passo | Cosa succede | Stato |
| --- | --- | --- | --- |
| 1 | 1 | «connect ECONNREFUSED 127.0.0.1:4000»: l'API si riavviava da sola a ogni modifica di file (modalità sviluppo) e la pagina l'ha chiamata durante un riavvio | Risolto: API e worker avviati senza riavvio automatico per le prove |
| 2 | 1 | «Codice fiscale non valido» con un codice inventato | Non è un errore: il controllo verifica forma e carattere di controllo come l'Agenzia delle Entrate. Usare i codici qui sotto |
| 3 | 1 | Chiede il codice fiscale dell'altro conducente senza la spunta: la casella «Il conducente abituale è il contraente» tornava non spuntata dopo un salvataggio a metà, e senza quella il programma chiedeva i dati di un altro conducente | Corretto: casella spuntata di base, dati dell'altro conducente letti solo con la sua spunta, messaggio chiaro se manca il conducente |

## Persone inventate con codice fiscale valido

| Nome | Sesso | Nascita | Luogo | Codice fiscale |
| --- | --- | --- | --- | --- |
| Mario Bianco | M | 15/03/1980 | Milano | BNCMRA80C15F205V |
| Francesca Russo | F | 22/07/1975 | Roma | RSSFNC75L62H501S |
| Antonio Esposito | M | 05/11/1992 | Napoli | SPSNTN92S05F839T |
| Chiara Romano | F | 30/01/1988 | Torino | RMNCHR88A70L219U |
| Giulia Neri | F | 12/05/1990 | Milano | NREGLI90E52F205X |
