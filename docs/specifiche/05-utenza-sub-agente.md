# Operatore dell'agenzia (dipendente)

> **Dal 2026-10-30** ([ADR 0026](../adr/0026-sezione-e-come-il-titolare-senza-team.md)) il **sub-agente** (sez. E) si iscrive da sé ed è titolare di una propria organizzazione: ha le schermate e i poteri dell'agente (spec 04), tranne creare un team. Questa scheda descrive l'**operatore**, cioè il dipendente che l'agente aggiunge al suo team.

L'operatore usa le stesse schermate dell'agenzia, ridotte ai propri dati e ai permessi che gli dà il titolare.

## Menu

1. Dashboard personale
2. Richieste in arrivo
3. Le mie offerte
4. Da emettere (se abilitato)
5. I miei risultati
6. I miei filtri

## Cosa cambia rispetto all'agenzia

- **Dashboard:** solo i propri numeri (richieste in target, offerte, vittorie, emissioni).
- **Richieste in arrivo:** tutte le aste aperte, come l'agenzia; i propri filtri, dentro quelli dell'agenzia, decidono solo le email che riceve (Dan, 2026-10-30, D3). Vede se un collega ha già preso in carico una richiesta, e in quel caso non può rinunciare all'asta per l'agenzia.
- **Offerte:** partono sempre a nome dell'agenzia. Nelle sue viste compaiono solo le proprie, salvo permesso del titolare.
- **Da emettere:** solo se il titolare gli dà il permesso di emissione.
- **Risultati:** per le sole aste a cui ha partecipato, le prime due offerte anonime, la posizione della sua e le statistiche.
- **I miei filtri:** può restringere quelli dell'agenzia, mai allargarli.
- **Rinnovi e Polizze emesse:** i rinnovi dei propri clienti; le polizze emesse, se ha il permesso di emissione.
- **Clienti:** solo i propri, salvo il permesso «vede tutti i clienti» del titolare.
- **Nessun accesso** a contabilità, team, contratti e dati dell'agenzia. Le provvigioni restano un accordo interno con l'agenzia.

## Più agenzie

Se collabora con più agenzie, ha un'unica utenza con un contesto per ciascuna e passa dall'una all'altra con il selettore in alto. Dati, filtri e richieste restano separati: un'offerta parte sempre dall'agenzia selezionata.

Se la stessa richiesta arriva a due sue agenzie, può offrire per una sola: altrimenti la stessa persona farebbe due offerte nella stessa asta.

## Profilo

Numero RUI sez. E, agenzie collegate, permessi ricevuti, autenticazione a due fattori, preferenze di notifica.
