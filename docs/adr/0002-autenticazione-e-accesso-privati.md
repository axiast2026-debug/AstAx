# 0002 — Autenticazione e accesso dei privati

- **Data:** 2026-10-15
- **Stato:** proposta
- **Fase:** 1

## Contesto

SIC-05 e la decisione aggiunta 37 chiedono: password e TOTP obbligatorio per le utenze professionali e il personale di AstAx; accesso senza password con un codice via email o SMS per i privati; durate di sessione diverse per privati (30 giorni), professionisti (8 ore di inattività) e personale (1 ora), prese dai parametri. Keycloak 26.8 non ha un accesso con codice via email: lo confermano le note di rilascio fino alla 26.8 e il forum ufficiale. Dan ha approvato un'estensione Java (dubbio 3 della prima sessione).

## Decisione

1. **Immagine Keycloak di AstAx** (`infra/keycloak/Dockerfile`): Keycloak ufficiale 26.8.1, più l'estensione `astax-email-code` e il tema `astax`. L'estensione si compila dentro Docker con Maven: sul computer di sviluppo non serve Java.
2. **Estensione «codice via email»**:
   - il privato scrive l'email e riceve un codice di 6 cifre;
   - il codice è salvato solo come hash nella sessione di autenticazione;
   - validità e tentativi vengono dai parametri `otp.validityMinutes` e `otp.maxAttempts`;
   - l'account si crea con il ruolo `astax-private` solo quando il codice è verificato, mai prima: nessuno può «prenotare» l'indirizzo di un altro;
   - un indirizzo di un professionista, del personale o di un account disattivato vede la stessa pagina del codice, ma non riceve nessuna email e nessun codice è valido: dal modulo non si capisce quali indirizzi siano di professionisti;
   - al massimo 3 codici per tentativo di accesso (limite tecnico contro l'invio massivo di email).
3. **Tipo di utente come ruolo di realm**: `astax-private`, `astax-professional`, `astax-staff`. Un utente non può assegnarsi un ruolo da solo, mentre un attributo richiederebbe di configurare il profilo utente di Keycloak.
4. **Tre client pubblici con PKCE**, ognuno con il suo flusso di accesso:

   | Client | Flusso | Durata della sessione |
   | --- | --- | --- |
   | `astax-web-private` | Codice via email | 30 giorni dal login |
   | `astax-web-pro` | Password e TOTP obbligatorio | 8 ore di inattività |
   | `astax-admin` | Password e TOTP obbligatorio | 1 ora di inattività |

   I flussi non usano il cookie di sessione condivisa: un accesso fatto come privato non apre la parte professionale, e viceversa.
5. **Durate dai parametri**: l'API scrive le durate su realm e client con l'API di amministrazione di Keycloak a ogni avvio e quando l'amministratore cambia un parametro `session.*` o `otp.*`. Questi parametri cambiano solo con effetto immediato, mai con una data futura, perché vanno applicati a Keycloak nel momento in cui si salvano. Il realm prende il valore più lungo, perché i client possono solo accorciarlo. I valori nel file del realm sono solo il punto di partenza.
6. **Un indirizzo, un tipo di utente**: Keycloak non ammette due account con la stessa email. Un indirizzo già usato da un cliente privato non può essere invitato in un team (risposta 409, domanda aperta 5).
7. **Controllo nell'API**:
   - ogni token deve avere emittente e audience `astax-api`;
   - il client di provenienza (`azp`) deve corrispondere al ruolo: privati solo da `astax-web-private`, professionisti solo da `astax-web-pro`, personale solo da `astax-admin`;
   - l'emittente è fisso grazie a `KC_HOSTNAME`.
8. **Utenti di prova**: `pnpm keycloak:sync` crea in Keycloak gli utenti del seed. Professionisti e personale hanno la password `DEV_USERS_PASSWORD` di `.env` e configurano il TOTP al primo accesso; i privati non hanno password.

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| Estensioni di terzi per l'OTP via email | Da verificare per ogni versione di Keycloak; codice non nostro in un punto critico per la sicurezza |
| L'API invia il codice e poi chiede i token a Keycloak (token exchange con impersonificazione) | Funzione in anteprima in Keycloak; dà all'API il potere di impersonare chiunque |
| Passkey per i privati | Già incluse in Keycloak, ma non sono ciò che chiedono le specifiche; restano un'opzione per il futuro |
| Attributo `astax_kind` invece dei ruoli | Va dichiarato nel profilo utente di Keycloak, altrimenti è modificabile o invisibile |

## Conseguenze

- Il codice via **SMS** non è ancora fatto: arriva con il fornitore SMS in fase 8 (debito tecnico). Il criterio della fase 1 («email o SMS») è soddisfatto dall'email.
- L'estensione usa un'interfaccia interna di Keycloak, e Keycloak lo segnala con un avviso. A ogni aggiornamento di Keycloak va ricompilata e riprovata con i test dei flussi.
- Un account privato nasce solo da un codice ricevuto e scritto: un indirizzo sbagliato non crea nulla.
- Il limite di 3 codici vale per tentativo di accesso: un limite di frequenza per indirizzo e per rete arriva in fase 8 (debito tecnico).
- Le pagine di accesso di Keycloak sono solo in italiano; il back office in albanese riguarda `apps/admin`.
