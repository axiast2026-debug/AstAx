# Domande aperte per Dan

Quando una regola di business non è chiara o due fonti si contraddicono, Claude Code non inventa: scrive qui la domanda, usa il valore più prudente e lo segnala alla fine della sessione. Dan risponde nella colonna «Risposta»; la risposta diventa una regola o una decisione aggiunta.

| # | Data | Fase | Domanda | Valore usato intanto | Risposta |
| --- | --- | --- | --- | --- | --- |
| 1 | 2026-10-15 | 3-5 | La decorrenza è una data senza ora. Per GAR-04 ed EMI-01 («prima della decorrenza») a che ora inizia la copertura: alle 00:00 del giorno di decorrenza, alle 24:00, o all'ora scelta dal cliente? | 00:00 (ora di Roma) del giorno di decorrenza: l'ultimo momento utile per emettere e per accettare è il più anticipato possibile | |
| 2 | 2026-10-15 | 1 | `session.privateDays` = 30 giorni: è la durata massima della sessione dal login, o 30 giorni di inattività (la sessione si rinnova finché il privato usa l'app)? | 30 giorni dal login, poi nuovo codice OTP | |
| 3 | 2026-10-15 | 5 | FEE-02 dice «sotto 200 €». Con un premio di esattamente 200,00 € il fee è ridotto (15/20 €) o pieno (30/35 €)? | Pieno: il ridotto vale solo sotto 200,00 € (premio < 20000 centesimi), come dice la regola alla lettera | |
| 4 | 2026-10-15 | 1 | Per quanti giorni vale un invito a entrare nel team di un'agenzia o di un broker? Le specifiche non lo dicono; è un nuovo parametro, `team.inviteValidityDays`. | 7 giorni | |
