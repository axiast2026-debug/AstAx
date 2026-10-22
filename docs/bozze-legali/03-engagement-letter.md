# Lettera di incarico ad AstAx

**Bozza n. 1 del 22/10/2026 — [DA VALIDARE — LEGALE]**

| | |
| --- | --- |
| Chiave del documento | `engagement-letter` |
| Chi la firma | Il privato, con firma elettronica avanzata (FEA) |
| Quando | All'accettazione dell'offerta, prima del pagamento (LEG-05) |
| Fonti | `docs/specifiche/00` (Ruolo 2, Processi 3 e 4), `03`, `09` §7; `docs/regole-di-dominio.md` (GAR, PRES, FEE, PAG, EMI, LEG-05); `docs/decisioni-aggiunte.md` (17, 20-23, 26-28); `docs/punti-aperti.md`; `seed/parametri.json` (`fees.private.*`, `issuance.*`, `secondOffer.customerConfirmHours`, `refunds.*`) |

> Convenzioni: [MAIUSCOLO] = dato da fornire; {{campo}} = dato che la Piattaforma inserisce per la singola richiesta. Gli importi sono quelli in vigore all'apertura dell'asta.

---

**Il/la sottoscritto/a** {{nome e cognome del firmatario}}, codice fiscale {{codice fiscale}}, residente in {{residenza}} (di seguito «Cliente»), in relazione alla richiesta {{codice richiesta}} e al contraente {{contraente}},

**conferisce a** [RAGIONE SOCIALE], sede legale [SEDE LEGALE], P.IVA [P.IVA], broker iscritto al RUI sez. B n. [NUMERO RUI] («AstAx»), l'incarico descritto di seguito.

## Art. 1 — Oggetto dell'incarico

1.1 Il Cliente incarica AstAx, quale broker, di intermediare la conclusione del contratto di assicurazione RC auto corrispondente all'offerta scelta dal Cliente sulla Piattaforma:

| Voce | Valore |
| --- | --- |
| Compagnia | {{compagnia}} |
| Prodotto | {{prodotto}} |
| Agenzia emittente (RUI sez. A) | {{agenzia: ragione sociale, numero RUI}} |
| Veicolo | {{targa, marca e modello}} |
| Garanzie | {{garanzie, massimali, franchigie e scoperti}} |
| Premio lordo annuo (imposte e contributo SSN inclusi) | {{premio}} |
| Decorrenza | {{data, oppure «immediata dal pagamento» o «dalle 24:00 del giorno del pagamento»}} |
| Frazionamento | Annuale |
| Prezzo garantito fino al | {{data}} ore 23:59:59 |

1.2 Nell'ambito dell'incarico AstAx: ha raccolto e verificato i dati della richiesta e ha organizzato l'asta a busta chiusa tra le agenzie invitate; presenta l'offerta scelta all'agenzia emittente, che la emette in collaborazione con AstAx; incassa dal Cliente il premio e il proprio compenso; segue l'emissione nei tempi stabiliti; mette a disposizione del Cliente i documenti di polizza; gestisce i reclami relativi alla propria attività; propone, prima della scadenza, una nuova asta per il rinnovo.

1.3 Non rientrano nell'incarico la gestione dei sinistri, che spetta alla compagnia, né le operazioni sulla polizza dopo l'emissione (variazioni, recesso, annullamento), che il Cliente chiede all'agenzia emittente o alla compagnia.

> **Nota per il legale:** momento dell'incarico. AstAx svolge attività di intermediazione (raccolta dati, verifica, asta, presentazione delle offerte) già dalla richiesta, ma la lettera di incarico si firma solo all'accettazione (09, §7; LEG-05). Va valutato se l'incarico debba precedere l'attività (per esempio con una clausola di incarico nelle Condizioni d'uso accettate alla registrazione) e se questa lettera debba quindi solo confermarlo per la singola polizza.

> **Nota per il legale:** il canale degli intermediari. La lettera è prevista solo per il canale dei privati (`legal-placeholders.ts`, `channel: "PRIVATE"`); il cliente di un broker o di un'agenzia richiedente firma e paga dal link senza questa lettera (decisione 26). Va deciso quale documento di incarico firma quel cliente, e verso quale intermediario, insieme alla questione della collaborazione a tre intermediari (documento 08).

## Art. 2 — Modalità di svolgimento

2.1 AstAx ha invitato all'asta agenzie selezionate secondo criteri oggettivi (compatibilità con la richiesta, disponibilità, varietà di compagnie, rotazione). Nessuno, nemmeno AstAx, ha potuto conoscere le offerte prima della chiusura.

2.2 Il Cliente dichiara di aver visto tutte le offerte presentate e di aver scelto liberamente. {{Se il confronto AI è stato usato: «Il Cliente ha chiesto il confronto con AI; il suggerimento, identificato come generato con AI, si basa sui criteri indicati nella Piattaforma e non vincola la scelta.»}}

> **Nota per il legale:** se il confronto AI è qualificato come consulenza (`docs/punti-aperti.md`, «Confronto AI e consulenza IDD»), questa lettera deve contenere la raccomandazione personalizzata e la sua motivazione, oltre alla dichiarazione di coerenza con le richieste e le esigenze del Cliente (vedi MUP, documento 04). Oggi il codice conserva ogni suggerimento con dati e criteri (PRES-08).

## Art. 3 — Compenso di AstAx

3.1 Per l'incarico il Cliente paga ad AstAx un compenso fisso di {{importo}} €, determinato secondo i valori in vigore all'apertura dell'asta (oggi: 30 €; 35 € con il confronto AI; 15 € o 20 € con il confronto AI se il premio dell'offerta scelta non supera 200,00 €). Il compenso è dovuto solo con l'acquisto ed è esente da IVA ai sensi dell'art. 10, comma 1, n. 9, DPR 633/1972.

3.2 AstAx riceve inoltre dall'agenzia emittente un compenso fisso per ogni polizza emessa (oggi 15 €), trattenuto dal premio rimesso all'agenzia. L'agenzia percepisce dalla compagnia le provvigioni previste dal proprio mandato. Gli importi sono indicati nell'Informativa precontrattuale.

3.3 AstAx emette fattura del proprio compenso all'emissione della polizza.

## Art. 4 — Pagamento

4.1 Il Cliente paga ad AstAx, in un'unica operazione tramite [FORNITORE PAGAMENTI], il premio di {{premio}} € e il compenso di {{importo}} €, per un totale di {{totale}} €. Il premio è accreditato sul conto separato di AstAx (art. 117 CAP); il compenso sul conto operativo.

4.2 AstAx rimette il premio all'agenzia emittente secondo l'accordo di collaborazione con l'agenzia.

> **Nota per il legale:** effetto liberatorio (art. 118 CAP; `docs/punti-aperti.md`). Completare con la clausola che dice se e da quando il pagamento ad AstAx ha effetto liberatorio per il Cliente verso la compagnia. Collegato: la divisione del pagamento tra conto separato e conto operativo è da validare con legale e commercialista (decisione 21).

## Art. 5 — Emissione

5.1 Con il pagamento confermato l'agenzia emittente riceve i contatti del Cliente ed emette la polizza entro il termine in vigore (oggi 4 ore lavorative, dal lunedì al venerdì dalle 9 alle 19, esclusi i festivi) e comunque prima della decorrenza scelta. I documenti di polizza sono messi a disposizione nell'area del Cliente.

5.2 Se l'agenzia non emette per causa propria, AstAx propone al Cliente la migliore offerta ancora garantita di un'altra agenzia: il Cliente la conferma entro il termine in vigore (oggi 24 ore) pagando o ricevendo la differenza, oppure ottiene il rimborso integrale di quanto pagato. Se l'emissione non è possibile per dati non corretti forniti dal Cliente, l'agenzia ricalcola il premio e il Cliente accetta il nuovo prezzo o ottiene il rimborso.

## Art. 6 — Dichiarazioni del Cliente

6.1 Il Cliente dichiara che i dati della richiesta sono veri e completi e prende atto che il prezzo è garantito solo se la decorrenza e i dati del preventivo (conducenti, residenza, veicolo, sinistri) non cambiano.

6.2 Il Cliente dichiara di aver ricevuto, prima della firma, l'Informativa precontrattuale (MUP) e la documentazione del prodotto (DIP, DIP aggiuntivo, condizioni di assicurazione) caricata dall'agenzia per {{compagnia}} e {{prodotto}}.

## Art. 7 — Durata, revoca e rimborsi

7.1 L'incarico vale per la polizza indicata e per la sua durata annuale, ai fini dell'assistenza di AstAx e della proposta di rinnovo.

7.2 Il Cliente può revocare l'incarico prima dell'emissione: in tal caso ottiene il rimborso integrale, compenso compreso. Dopo l'emissione il compenso resta dovuto; recesso e annullamento della polizza si chiedono all'agenzia emittente o alla compagnia, secondo le condizioni di assicurazione.

> **Nota per il legale:** regole di rimborso del compenso e recesso a distanza (`docs/punti-aperti.md`; parametri `refunds.beforeIssuance` = tutto, compenso compreso; `refunds.afterIssuance` = compenso trattenuto; `withdrawal.onPlatform` spento). Vedi anche la nota all'art. 10 delle Condizioni d'uso (documento 01).

## Art. 8 — Reclami, legge e foro

8.1 Per i reclami valgono le modalità indicate nell'Informativa precontrattuale (risposta entro 45 giorni; ricorso all'IVASS). Si applica la legge italiana; foro del consumatore.

Firmato con FEA da {{nome e cognome}} il {{data e ora}} — versione del documento {{versione}}.
