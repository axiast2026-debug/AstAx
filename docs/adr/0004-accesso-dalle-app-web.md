# 0004 — Accesso dalle app web: token solo sul server

- **Data:** 2026-10-15
- **Stato:** proposta
- **Fase:** 1

## Contesto

`apps/web` e `apps/admin` devono far entrare gli utenti con Keycloak (ADR 0002) e chiamare l'API con il loro token. Un token nel browser è esposto a qualunque script della pagina. `next-auth` è stabile solo nella versione 4; la 5, pensata per l'App Router di Next.js 16, è ancora in beta.

## Decisione

1. **Login sul server**: le route `/auth/login` e `/auth/callback` di ogni app fanno il flusso «authorization code» con PKCE tramite `openid-client` 6, dello stesso autore di `jose`, che usiamo già nell'API.
2. **Token solo sul server**: access, refresh e id token stanno in una sessione su Redis (prefisso `web:` o `admin:`), con scadenza uguale a quella del refresh token. Il browser riceve solo un cookie opaco e casuale, `httpOnly`, `SameSite=Lax`, `Secure` in produzione.
2b. **Indirizzo del browser**: per il registro e le accettazioni dei testi legali (LEG-01) le app passano all'API l'indirizzo IP e il browser dell'utente. L'intestazione X-Forwarded-For può essere scritta dal browser stesso, quindi si usa solo con `WEB_TRUSTED_PROXY=true` (in cloud, dietro il nostro proxy), e solo il suo ultimo valore, quello aggiunto dal proxy. In locale non si inoltra nulla e il registro mostra l'indirizzo dell'app web: vero, anche se meno utile. Ogni accesso riuscito viene registrato dalle app con `POST /me/logins`.
3. **Chiamate all'API dal server**: le pagine chiamano l'API dal server Next.js con il token dell'utente e `X-AstAx-Context`; il token si rinnova da solo 30 secondi prima della scadenza. Se Keycloak rifiuta il rinnovo (sessione revocata o scaduta, SIC-05), la sessione si cancella e si torna al login.
4. **Contesto attivo**: la scelta del selettore si salva nella sessione. L'API lo verifica comunque a ogni chiamata.
5. **Codice condiviso** in `packages/ui`: componenti, token di design e menu per ruolo nell'export principale; login e sessioni nell'export `@astax/ui/server`, da importare solo nel codice server.
6. **Menu**: i menu delle schede 02-07 sono dati filtrati con la stessa mappa dei permessi dell'API. Nascondere una voce non è un controllo: l'API controlla di nuovo.

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| `next-auth` 5 | Ancora in beta |
| `next-auth` 4 | Pensato per il Pages Router; rinnovo dei token da scrivere comunque a mano |
| Token nel browser (librerie OIDC lato client) | Esposti agli script della pagina; più difficile rispettare la durata delle sessioni |
| Sessione cifrata nel cookie | Access, refresh e id token insieme rischiano di superare i 4 KB del cookie |

## Conseguenze

- Redis diventa necessario anche per le app web, oltre che per l'API.
- Un utente che resta collegato in Keycloak con un altro account (computer condiviso senza «Esci») trova un messaggio di Keycloak; «Esci» chiude anche la sessione di Keycloak. Da migliorare con `prompt=login` (debito tecnico).
- Il client dell'API scritto da OpenAPI per i frontend arriva quando le schermate useranno davvero i dati (fase 2); in fase 1 le poche chiamate sono scritte a mano (debito tecnico).
