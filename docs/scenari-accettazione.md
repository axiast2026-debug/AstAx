# Scenari di accettazione

Dieci scenari che devono passare come test end-to-end (Playwright, con API e worker veri e adattatori finti), in `tests/e2e/scenari/`. Un collaudatore deve poterli ripetere a mano nell'ambiente di collaudo. Usano solo dati sintetici: persone, targhe e compagnie inventate.

Gli orari sono di Roma e le date sono reali (novembre 2026), così i calcoli delle ore lavorative si controllano a mano. I test usano un orologio controllabile e l'ambiente di Temporal a tempo accelerato.

## Dati comuni

| Elemento | Valore |
| --- | --- |
| Compagnie | Compagnia Alfa, Compagnia Beta, Compagnia Gamma, Compagnia Delta |
| Agenzie | Agenzia Uno (mandati Alfa, Beta), Agenzia Due (Alfa), Agenzia Tre (Beta, Gamma), Agenzia Quattro (Gamma), Agenzia Cinque (Beta, Delta), più Agenzie Sei-Dieci per i test sugli inviti |
| Sub-agente | Marco Rossi: operatore in Agenzia Uno e in Agenzia Tre |
| Broker | Broker Demo Srl: titolare Laura Bianchi, operatore Paolo Verdi |
| Privati | Giulia Neri, Sara Conti, Davide Galli, Elena Sala, Luca Ferri |
| Parametri | Quelli di `seed/parametri.json` |

---

## S01 — Privato con confronto AI

**Fase:** fino al pagamento in fase 5, completo in fase 6. **Test:** `S01-privato-con-ai.spec.ts`. **Regole:** ASTA-01, ASTA-02, PRES-01…08, FEE-01, CLA-01…03, PAG-02, EMI-01, EMI-02, CONT-01, CONT-03.

**Dato che** Giulia Neri chiede un preventivo per un'autovettura, pacchetto Base, durata 2 ore, validità minima 15 giorni, decorrenza 20/11/2026, premio attuale 680,00 €,
**e** il back office approva lunedì 16/11/2026 alle 10:00,
**allora** l'asta chiude alle 12:00 e la garanzia minima è il 01/12/2026.

Offerte inviate:

| Agenzia | Compagnia | Premio | Garantito fino al | Invio |
| --- | --- | --- | --- | --- |
| Uno | Alfa | 520,00 € | 05/12/2026 | 10:20 |
| Due | Alfa | 540,00 € | 01/12/2026 | 10:40 |
| Tre | Beta | 505,00 € | 03/12/2026 | 11:05 |
| Cinque | Beta | 505,00 € | 06/12/2026 | 11:30 |
| Quattro | Gamma | 610,00 € | 10/12/2026 | 11:50 |

**Quando** l'asta chiude,
**allora**:
- durante l'asta Giulia ha visto solo il conto alla rovescia e il numero di offerte (fino a 5);
- Giulia vede 3 righe: Beta 505,00 € (offerta di Cinque, garantita fino al 06/12), Alfa 520,00 €, Gamma 610,00 €; Beta ha l'etichetta «Più conveniente» e il risparmio è 175,00 €; nessun nome di agenzia;
- ogni agenzia vede solo lo stato della propria offerta.

**Quando** Giulia preme «Confronta con AI»,
**allora** vede che il fee passa da 30,00 € a 35,00 € e conferma; compare un suggerimento con l'etichetta «Suggerimento generato con AI»; il database contiene `AiSuggestion` con pesi, punteggi, modello e testo.

**Quando** Giulia sceglie Alfa 520,00 € (non la più bassa), legge i documenti e firma con il codice,
**allora** la classifica viene pubblicata: Agenzia Uno vede prima 505,00 €, seconda 505,00 €, la propria 520,00 €, 3ª su 5, +2,97% dalla prima; Agenzia Cinque è 1ª su 5.

**Quando** Giulia paga 555,00 € con carta alle 12:30,
**allora** la richiesta è «In emissione»; Agenzia Uno riceve i contatti e il termine 16:30; le altre offerte sono «Non scelta».

**Quando** Agenzia Uno carica polizza, quietanza e certificato alle 15:00,
**allora** la richiesta è «Emessa»; Giulia riceve la notifica e trova i documenti; viene emessa la fattura P di 35,00 € esente IVA, senza bollo; lunedì 23/11 la rimessa ad Agenzia Uno è 505,00 € (520,00 − 15,00) con la fattura A di 15,00 €.

---

## S02 — Broker: il cliente compra dopo 10 giorni

**Fase:** 6. **Test:** `S02-broker-acquisto-dopo-10-giorni.spec.ts`. **Regole:** GAR-01, GAR-02, GAR-04, FEE-03, PRES-06, CONT-03, CONT-05.

**Dato che** Paolo Verdi (Broker Demo Srl) crea una richiesta per la cliente Anna Riva, pacchetto Plus, durata 5 ore, validità 15 giorni, decorrenza 15/12/2026, e il consenso arriva con il link firmato da Anna,
**e** l'asta apre martedì 17/11/2026 alle 09:00,
**allora** chiude alle 14:00 e la garanzia minima è il 02/12/2026.

Offerte: Agenzia Due, Alfa, 610,00 €, garantita fino al 04/12/2026; Agenzia Tre, Beta, 640,00 €, garantita fino al 02/12/2026.

**Allora** Paolo vede le due offerte e non vede il pulsante «Confronta con AI».

**Quando** il 27/11/2026 Paolo sceglie l'offerta Alfa con «Scegli e acquista» e paga 610,00 € (ADR 0027),
**e** poi inserisce l'email di Anna, che riceve il link, conferma l'identità con il codice, legge i documenti e firma,
**allora** non si apre nessuna nuova asta; l'offerta era ancora garantita; Anna non paga niente e il broker non paga fee al momento; Agenzia Due emette; la fattura mensile al broker di inizio dicembre contiene 30,00 € per questa polizza; l'estratto conto del broker la mostra come dovuta.

---

## S03 — Garanzie scadute e riconferma

**Fase:** 4. **Test:** `S03-riconferma.spec.ts`. **Regole:** GAR-06, GAR-07, BC-06, PRES-02.

**Dato che** l'asta di Sara Conti (pacchetto Base, validità 7 giorni) chiude mercoledì 18/11/2026 alle 11:00 con:

| Agenzia | Compagnia | Premio | Garantito fino al |
| --- | --- | --- | --- |
| Uno | Alfa | 450,00 € | 25/11/2026 |
| Due | Alfa | 470,00 € | 26/11/2026 |
| Quattro | Gamma | 480,00 € | 25/11/2026 |

**Quando** Sara non accetta nulla,
**allora** dal 27/11/2026 alle 00:00 la richiesta è «Scaduta» e Sara riceve l'avviso.

**Quando** venerdì 27/11/2026 alle 10:00 Sara preme «Chiedi riconferma»,
**allora** le tre agenzie ricevono la richiesta, con termine martedì 01/12/2026 alle 10:00 (24 ore lavorative); la nuova garanzia minima è l'08/12/2026; durante il giro nessun ruolo vede le risposte.

**Quando** Uno conferma 450,00 € fino all'08/12, Due aggiorna a 445,00 € fino al 10/12 e Quattro rinuncia,
**allora** alle 10:00 del 01/12 la richiesta torna «Offerte disponibili»; Sara vede una riga (Alfa 445,00 €, garantita fino al 10/12): Gamma non compare perché nell'ultimo giro non ha offerte; il contatore delle riconferme è 1.

---

## S04 — Asta deserta

**Fase:** 3. **Test:** `S04-asta-deserta.spec.ts`. **Regole:** ASTA-04, ASTA-07, ASTA-08.

**Dato che** Davide Galli chiede un preventivo per un motociclo, pacchetto Completo, durata 1 ora,
**e** sono compatibili Agenzie Uno, Tre, Quattro e Nove, ma Nove è in pausa fino alle 18:15 di giovedì 19/11/2026,
**e** il back office approva giovedì 19/11/2026 alle 17:30,
**allora** sono invitate Uno, Tre e Quattro; l'asta chiude alle 18:30; il promemoria parte a metà asta (18:00).

**Quando** a metà asta non ci sono offerte,
**allora** il rabbocco non trova altre agenzie disponibili.

**Quando** alle 18:30 non c'è nessuna offerta valida,
**allora** parte la riapertura: è invitata Agenzia Nove, la nuova chiusura è venerdì 20/11/2026 alle 10:30, Davide riceve l'avviso.

**Quando** anche la riapertura chiude senza offerte,
**allora** la richiesta è «Deserta»; ricevono l'avviso Davide e il back office; il back office può aprire una nuova asta o chiudere la richiesta.

Variante: se alla prima chiusura non ci sono agenzie compatibili non ancora invitate, la richiesta passa subito a «Deserta».

---

## S05 — Mancata emissione per colpa dell'agenzia

**Fase:** 6. **Test:** `S05-mancata-emissione.spec.ts`. **Regole:** EMI-01, EMI-03, EMI-04, EMI-05, PAG-04.

**Dato che** Elena Sala ha accettato l'offerta di Agenzia Uno (Alfa, 500,00 €), con decorrenza giovedì 26/11/2026,
**e** le altre offerte ancora garantite sono Agenzia Due (Alfa, 520,00 €) e Agenzia Tre (Beta, 530,00 €),
**e** il pagamento di 530,00 € (premio + fee 30,00 €) è confermato lunedì 23/11/2026 alle 17:00,
**allora** il termine di emissione è martedì 24/11/2026 alle 11:00.

**Quando** alle 10:00 la polizza non è emessa, **allora** Agenzia Uno e back office ricevono l'avviso.
**Quando** alle 11:00 non è emessa, **allora** è proposta la penale di 25,00 € per ritardo.
**Quando** alle 15:00 Agenzia Uno segnala «impossibile emettere» e il back office decide che la colpa è dell'agenzia,
**allora** la penale proposta diventa 100,00 € (quella da 25,00 € è annullata); l'offerta di Uno è «Mancata emissione»; a Elena viene proposta l'offerta di Agenzia Due, 520,00 €, con una differenza di 20,00 € da pagare e il fee invariato; ha 24 ore per confermare.

**Quando** Elena conferma alle 16:00 e paga 20,00 €,
**allora** Agenzia Due vince, riceve i contatti, deve emettere entro mercoledì 25/11/2026 alle 10:00 ed emette.

**Quando** il supervisore applica la penale,
**allora** Agenzia Uno riceve l'avviso, può contestarla entro 10 giorni e la penale si trattiene dalla rimessa di lunedì 30/11 (o dalle successive, se non basta).

Variante: se Elena rifiuta, riceve il rimborso di 530,00 €, fee compreso; la richiesta è «Annullata»; non c'è nessuna fattura da stornare.

---

## S06 — Due offerte allo stesso prezzo

**Fase:** 3 (funzione di dominio) e 4 (end-to-end). **Test:** `S06-parita.spec.ts`. **Regole:** PRES-01, CLA-01.

**Dato che** nello scenario S01 Agenzia Tre e Agenzia Cinque offrono entrambe Beta a 505,00 €, garantite fino al 03/12 e al 06/12,
**allora** Cinque è prima in classifica e la riga Beta mostrata a Giulia è quella di Cinque.

Variante: stessa data di garanzia, **allora** vince l'invio più vecchio secondo il server (Tre alle 11:05 batte Cinque alle 11:30).

---

## S07 — Tentativo di leggere le offerte prima della chiusura

**Fase:** 3. **Test:** `S07-busta-chiusa.spec.ts`. **Regole:** BC-01…BC-05, SIC-04.

**Dato che** un'asta è aperta con tre offerte,
**quando** provano a leggere offerte, prezzi, PDF o esportazioni l'amministratore, i quattro ruoli del back office, il richiedente, il broker, un utente di un'altra agenzia invitata e un operatore della stessa agenzia senza `canSeeColleagueOffers`,
**allora** ogni tentativo riceve 403 (o una risposta senza campi di offerta, per le liste) e il registro contiene `SEALED_BID_ACCESS_DENIED` con utente, ora e risorsa;
**e** una copia del database non contiene il premio in centesimi né il nome della compagnia nelle tabelle delle offerte;
**e** l'adattatore KMS non registra decifrature della chiave dell'asta prima dell'ora di chiusura;
**e** l'agenzia che ha fatto l'offerta la rilegge, e la lettura è registrata.

---

## S08 — Recesso nei termini

**Fase:** 6. **Test:** `S08-recesso.spec.ts`. **Regole:** PAG-04, PAG-05, CONT-01.

**Dato che** la polizza di Giulia Neri (S01: Agenzia Uno, Alfa, 520,00 €, fee 35,00 €) è emessa il 16/11/2026 e già inclusa nella rimessa del 23/11,
**quando** il 25/11/2026 Giulia chiede il recesso,
**e** Agenzia Uno indica un premio rimborsabile di 497,00 € secondo le condizioni della compagnia,
**e** il supervisore del back office approva,
**allora** Giulia riceve 497,00 €; il fee di 35,00 € resta e non ci sono note di credito; la polizza è «Receduta» e la richiesta «Annullata»; la rimessa di Agenzia Uno del 30/11 contiene una voce di −497,00 €.

**Con la risposta 18 di Dan (2026-10-18)** il cliente non recede più dall'app: con il parametro `withdrawal.onPlatform` spento (valore iniziale) la pagina della polizza indica di rivolgersi all'agenzia, e la richiesta di Giulia (o del back office per lei) riceve 409. Lo scenario sopra resta provato nei test di integrazione con il parametro acceso; il test E2E prova la pagina con il parametro spento.

---

## S09 — Premio sotto i 200 €

**Fase:** 6 (calcolo del fee già in fase 5). **Test:** `S09-premio-basso.spec.ts`. **Regole:** FEE-01, FEE-02, FEE-03.

**Dato che** Luca Ferri chiede un preventivo per un ciclomotore e riceve Alfa 180,00 € e Beta 195,00 €,
**quando** acquista Alfa senza confronto AI, **allora** paga 195,00 € (fee 15,00 €).
**Quando** acquista Alfa dopo aver usato il confronto AI, **allora** paga 200,00 € (fee 20,00 €).
**Quando** il premio è esattamente 200,00 €, **allora** il fee è ancora quello ridotto (15,00 € o 20,00 €; domanda 3, Dan 2026-10-18).
**Quando** la stessa offerta passa da un broker, **allora** il cliente paga 180,00 € e il broker deve 30,00 €.

---

## S10 — Sub-agente di due agenzie invitate alla stessa asta

**Fase:** 4. **Test:** `S10-sub-agente-due-agenzie.spec.ts`. **Regole:** OFF-01, OFF-02, OFF-03, VIS-06.

**Dato che** Agenzia Uno e Agenzia Tre sono invitate alla stessa richiesta e Marco Rossi lavora per entrambe,
**quando** Marco, nel contesto di Agenzia Uno, prende in carico la richiesta,
**allora** nel contesto di Agenzia Tre la richiesta mostra «Hai già preso in carico questa richiesta per Agenzia Uno» e presa in carico e offerta sono bloccate;
**e** Sofia, collega di Agenzia Tre, può prendere in carico e offrire per Agenzia Tre.

**Quando** Marco rilascia la presa in carico in Agenzia Uno senza aver offerto, **allora** può prenderla in carico per Agenzia Tre.
**Quando** Marco ha già offerto per Agenzia Uno, **allora** non può offrire per Agenzia Tre, nemmeno dopo aver rilasciato.
**Quando** due utenti della stessa agenzia prendono in carico nello stesso istante, **allora** uno solo ci riesce.
