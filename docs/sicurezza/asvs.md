# Lista di controllo OWASP ASVS livello 2 (fase 8)

Stato al 2026-10-18. Per ogni capitolo di ASVS 4.0.3: cosa fa AstAx e dove si vede. «Da fare» indica quello che dipende dagli ambienti AWS o dal test di sicurezza esterno (parte B). La società esterna ricontrolla tutto in modo indipendente.

| Capitolo | Requisiti principali | AstAx | Prova | Stato |
| --- | --- | --- | --- | --- |
| V1 Architettura | Modello delle minacce, componenti separati, segreti fuori dal codice | Busta chiusa con chiavi per ruolo (`docs/busta-chiusa.md`), un ruolo IAM per servizio, segreti in Secrets Manager, ADR per ogni scelta | `infra/terraform/modules/astax/tests`, ADR 0005, 0011, 0012 | Fatto; modello delle minacce scritto da completare con la società esterna |
| V2 Autenticazione | Password robuste, secondo fattore, blocco dopo tentativi, codici monouso sicuri | Keycloak: password di 12 caratteri, TOTP obbligatorio per professionisti e staff, blocco dopo `security.loginMaxFailures` errori; privati con codice email a scadenza e tentativi massimi, limite per indirizzo | `session-settings.test.ts`, E2E `fase1-accessi`, estensione `email-code` | Fatto |
| V3 Sessioni | Durata per ruolo, uscita da tutti i dispositivi, cookie sicuri | Durate dai parametri `session.*`, «Disconnetti tutti i dispositivi», sessione lato server in Redis, cookie `HttpOnly`, `Secure`, `SameSite` | E2E `fase1-accessi`, `me.controller` | Fatto |
| V4 Controllo accessi | Negazione predefinita, permessi nel backend, seconda linea nel database | Unica porta dell'API (SIC-01), permessi a tabella, sicurezza a livello di riga di PostgreSQL | `permissions.int.test.ts` (2.642 prove), `rls.int.test.ts` | Fatto |
| V5 Validazione | Input validato, nessuna iniezione, uscita codificata | Zod su ogni ingresso, SQL solo con parametri (Semgrep `astax-no-raw-unsafe-sql`), niente `dangerouslySetInnerHTML`, CSV contro le formule | `.semgrep.yml`, `csv.ts` | Fatto |
| V6 Crittografia | Algoritmi moderni, chiavi gestite, casualità sicura | AES-256-GCM con lunghezza del tag fissata, HMAC per gli indici ciechi, KMS per le chiavi, `node:crypto` per tutti i segreti | `kms.test.ts`, `field-cipher.test.ts`, Semgrep `astax-no-math-random-for-secrets` | Fatto |
| V7 Errori e log | Nessun dato personale nei log, registro degli eventi di sicurezza | Log con soli identificativi (regola 8), registro attività a catena di hash, accessi e tentativi falliti da Keycloak, Sentry senza dati personali | `telemetry.test.ts`, Semgrep `astax-no-personal-data-in-logs`, `pnpm audit:verify` | Fatto |
| V8 Protezione dei dati | Minimizzazione, conservazione, cifratura dei dati sensibili | Campi sensibili cifrati (SIC-03), conservazione LEG-06, filigrane, contatti solo dopo il pagamento (VIS-02) | `retention.int.test.ts`, `agency.int.test.ts` | Fatto |
| V9 Comunicazioni | TLS ovunque | HTTPS con TLS 1.2/1.3 sul bilanciatore, HSTS, PostgreSQL con SSL obbligatorio, Redis con TLS, SES con TLS obbligatorio | `infra/terraform` (alb.tf, data.tf, ses.tf) | Da provare in collaudo |
| V10 Codice malevolo | Dipendenze controllate, niente segreti nel repository | `pnpm audit`, Gitleaks sulla storia, versioni fissate da almeno due settimane, ADR 0001 | Job CI «security» | Fatto |
| V11 Logica di business | Limiti contro gli abusi, passi nell'ordine giusto | Limiti di frequenza dai parametri `security.*`, transizioni di stato controllate, busta chiusa | `rate-limits.int.test.ts`, `status-transitions` | Fatto |
| V12 File | Tipi controllati, dimensioni, nessuna esecuzione | Controllo del tipo reale dei file, limiti di dimensione dai parametri, file mai serviti con link diretti alle agenzie | `requests.int.test.ts`, `looksLikePdf` | Fatto |
| V13 API | Autenticazione per ogni chiamata, tipi di contenuto, webhook firmati | Token Keycloak verificati, webhook con firma o segreto confrontato in tempo costante, limiti per IP sulle pagine pubbliche | `auth.int.test.ts`, `sdi-webhook.int.test.ts` | Fatto |
| V14 Configurazione | Intestazioni di sicurezza, nessuno strumento di sviluppo in produzione, componenti aggiornati | CSP con nonce, intestazioni di sicurezza, `pnpm release:check`, scansione ZAP | `security-headers.test.ts`, `release-gate.test.ts` | ZAP da fare in collaudo |

## Da fare nella parte B

- Scansione OWASP ZAP sul collaudo: risultato in `docs/collaudo/`, ogni avviso risolto o motivato per iscritto.
- Test di sicurezza della società esterna: nessun problema alto o critico aperto.
- Prova dal vivo della politica IAM (il ruolo dell'API riceve AccessDenied sulla chiave delle buste).
