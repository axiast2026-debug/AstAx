# 0019 — Link magico nell'email del codice di accesso dei privati

- **Data:** 2026-10-23
- **Stato:** accettata (revisione UX del 2026-10-23, proposta B1; Dan, domanda 28: «sì, con le stesse regole del codice»)
- **Riferimenti:** ADR 0002; SIC-05, SIC-06; `docs/ux-review/2026-10-23/rapporto.md`; regola 8 di CLAUDE.md

## Contesto

Il privato entra senza password: scrive l'email, riceve un codice di sei cifre e lo copia nella pagina di accesso (ADR 0002). Sul telefono vuol dire passare dall'app della posta al browser e ricopiare sei cifre: la revisione UX ha misurato tre schermate e due campi prima di cominciare. La proposta B1 aggiunge nella stessa email un link che fa entrare con un tocco. Dan ha chiesto che valga con le stesse regole del codice: una volta sola e per pochi minuti.

## Decisione

1. **Un token monouso accanto al codice.** Quando l'estensione Keycloak `astax-email-code` manda il codice, genera anche un token di 32 byte casuali (base64url) e lo salva nel deposito a scadenza di Keycloak (`SingleUseObjectProvider`, condiviso tra i nodi) sotto l'**hash** del token, con l'indirizzo email e l'ora di scadenza. Il token non viene mai salvato in chiaro (SIC-06).
2. **Stessa scadenza, stessi limiti.** Il token scade con il codice (`otp.validityMinutes`); viaggia nella stessa email, quindi vale lo stesso limite di invii per indirizzo (`security.emailCodesPerAddressPerHour`) e di tre email per tentativo di accesso. Nessun numero nuovo e nessun parametro nuovo: tutto dai parametri già in uso (regola 7).
3. **Una volta sola.** Il token si consuma con una rimozione atomica dal deposito: il secondo tocco non trova nulla e vede «Il link non vale più». La scadenza si controlla anche in codice, non solo con la scadenza del deposito. Se il cliente scrive il codice invece di toccare il link, o riparte con un altro indirizzo, il token viene revocato.
4. **Pagina di arrivo nel sito**, `/accedi/link?t=<token>`: nell'URL c'è solo il token, nessun dato personale (regola 8). La pagina manda il token con un POST a `/auth/link`, da sola appena carica (script con il nonce della CSP) o con il pulsante «Entra in AstAx» per chi non ha gli script. Il POST avvia il normale accesso OIDC dei privati con il parametro aggiuntivo `astax_link`; Keycloak lo conserva come nota del client (`client_request_param_astax_link`) e l'estensione lo legge all'inizio del flusso, lo cancella e consuma il token. Un link aperto da un'altra app o un altro browser funziona lo stesso: non dipende dalla sessione di chi ha chiesto il codice.
5. **Perché un POST e non un GET.** Molti filtri antispam aprono i link delle email prima del destinatario: con un GET brucerebbero il token. La pagina di arrivo non consuma nulla; il token si spende solo con l'invio del modulo. La pagina dichiara `referrer: no-referrer` e non è indicizzabile.
6. **Il resto non cambia.** L'account del privato nasce solo da un codice o da un link verificati, mai prima; gli indirizzi di professionisti e personale non ricevono l'email, quindi nemmeno il link; l'accesso riuscito torna a `/auth/callback` e finisce nel registro come oggi (regola 4). Il codice resta come alternativa nella stessa pagina.
7. **L'origine del link** viene dal `redirect_uri` della richiesta di accesso, che Keycloak ha già controllato contro quelli registrati per il client: nessun indirizzo scritto nel codice.

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| Action token di Keycloak (`login-actions/action-token`) | Legato al browser che ha chiesto il codice: aprendo il link dall'app della posta Keycloak chiede una conferma in più, cioè una schermata in più |
| Link che consuma il token con un GET sulla pagina di arrivo | I filtri antispam che aprono i link lo renderebbero inutile prima che il cliente lo tocchi |
| Token senza scadenza propria, solo quella del deposito | Un deposito che scade in ritardo accetterebbe un link vecchio: la scadenza si controlla in entrambi i posti |
| Un parametro nuovo per la durata del link | Dan ha chiesto le stesse regole del codice: un numero in più sarebbe solo da tenere allineato |

## Conseguenze

- I test delle classi pure dell'estensione (`MagicLinkTokensTest`, `SendLimitsTest`: usato due volte, scaduto, limiti) girano con Maven dentro la build dell'immagine Docker: se falliscono l'immagine non si costruisce. Dopo il pull: `docker compose --env-file .env -f infra/docker-compose.yml build keycloak` e riavvio del servizio.
- Il codice e il link della stessa email valgono entrambi finché uno dei due viene usato nella stessa sessione di accesso; un link usato da un altro browser non annulla il codice rimasto nel primo, che comunque scade con i suoi minuti.
- Il link è un segreto per pochi minuti: chi legge la posta del cliente può entrare, come già oggi con il codice. La protezione resta la casella di posta del cliente.
