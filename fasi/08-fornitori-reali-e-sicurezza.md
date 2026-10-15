# Fase 8 — Fornitori reali e sicurezza

**Obiettivo.** AstAx gira su AWS Milano con i fornitori veri in sandbox, regge il carico previsto e supera i test di sicurezza. È pronta per il collaudo finale e per il lancio, che dipende anche dall'iscrizione al RUI.

**Si chiude quando:** tutti gli scenari sono superati in collaudo con i fornitori veri.

## Prima di iniziare

- Fase 7 chiusa in `docs/stato.md`.
- Da leggere: `docs/specifiche/08-architettura-tecnica.md` (integrazioni, sicurezza), `09-decisioni-e-valori-predefiniti.md` (§6), `docs/adattatori.md`, `docs/busta-chiusa.md` (controlli e prove), `docs/punti-aperti.md`.
- Serve da Dan, in quest'ordine:
  1. account AWS aziendale di AstAx e accesso per la pipeline (OIDC da GitHub);
  2. domini (`astax.it` e varianti) e caselle per i mittenti;
  3. sandbox e credenziali: Openapi (Automotive e SDI), Namirial, Fabrick, provider SMS, accesso a Claude su Amazon Bedrock nella regione UE;
  4. i documenti anonimi per misurare la lettura AI: 20 libretti, 20 patenti, 20 attestati, 20 PDF di preventivi di almeno 5 compagnie, raccolti con il consenso degli interessati;
  5. una società esterna per il test di sicurezza.
  Le credenziali vanno in AWS Secrets Manager, mai nel repository né in chat.

## Cosa comprende

- **Infrastruttura con Terraform** (`eu-south-1`): rete; servizi ECS Fargate per web, admin, api, worker e Keycloak; RDS PostgreSQL (Multi-AZ in produzione); Redis gestito; S3 per i documenti (SSE-KMS) e per l'archivio del registro (Object Lock); chiavi KMS e politiche IAM come in `docs/busta-chiusa.md`; Secrets Manager; bilanciatore con WAF; SES con DKIM; CloudTrail con allarmi; backup. Ambienti collaudo e produzione separati; rilascio con GitHub Actions e approvazione manuale per la produzione.
- **Temporal:** decisione con ADR tra Temporal Cloud in UE e installazione propria; nessun dato personale nei payload; cifratura dei payload facoltativa.
- **Adattatori veri** con test di contratto sulle sandbox: Openapi Automotive, lettura documenti e spiegazione AI con Claude su Bedrock (profilo di inferenza UE), Namirial, Fabrick (con la divisione premio/fee), Openapi SDI, SES, provider SMS, import degli elenchi RUI reali, AWS KMS.
- **Misura della lettura AI** sugli 80 documenti anonimi: rapporto per campo, revisione dei prompt, soglia di confidenza confermata o cambiata.
- **Osservabilità:** Sentry (UE), OpenTelemetry e Grafana; allarmi su errori dei workflow, ritardi di chiusura, errori dei webhook, termini di emissione, decifrature anomale.
- **Sicurezza:** lista di controllo OWASP ASVS livello 2; limiti di frequenza; intestazioni di sicurezza e CSP; controllo delle dipendenze e dei segreti; Semgrep in CI; scansione OWASP ZAP sul collaudo; test di sicurezza esterno con correzione di tutti i problemi alti e critici; prova di ripristino dai backup; documenti di supporto per la valutazione d'impatto (mappa dei dati, elenco dei responsabili, registro dei fornitori ICT); procedura per gli incidenti.
- **Prova di carico (k6):** 200 aste contemporanee, 1.000 utenti di agenzia, 50 offerte nell'ultimo minuto della stessa asta.
- **Collaudo:** S01-S10 automatici in collaudo e ripetuti a mano dal gruppo di Dan.
- **`docs/go-live.md`:** lista di controllo per il lancio (iscrizione RUI, conto separato o fideiussione, contratti con i fornitori, testi legali validati, accordi sul trattamento dei dati, rapporto del test di sicurezza, monitoraggio, reperibilità).

## Criteri di accettazione

- [ ] S01-S10 passano in collaudo con le sandbox vere; il rapporto è in `docs/collaudo/`.
- [ ] I test di contratto passano per ogni adattatore vero.
- [ ] In AWS il ruolo dell'API non può decifrare la chiave delle buste (test IAM); il controllo notturno su CloudTrail gira e un'anomalia simulata produce l'allarme.
- [ ] Il test di sicurezza esterno non lascia problemi alti o critici aperti; la scansione ZAP è pulita o ogni avviso ha una motivazione scritta.
- [ ] Prova di carico: la chiusura avviene entro 5 secondi dall'ora prevista; p95 delle API sotto 300 ms al carico nominale; nessun errore.
- [ ] Il ripristino dai backup è provato; tempi di ripristino e perdita massima di dati sono scritti.
- [ ] La lettura AI raggiunge almeno il 95% di campi corretti tra quelli sopra soglia (proposta da confermare con Dan); gli altri vanno al back office.
- [ ] La pipeline di produzione si ferma se un testo legale in uso non è validato (LEG-03) o se gli strumenti di sviluppo sono accesi.

## Test richiesti

- Contratto per ogni adattatore, su finto e sandbox.
- Infrastruttura: piano Terraform senza differenze dopo l'applicazione; test delle politiche IAM.
- Carico, sicurezza, ripristino, come sopra.

## Demo per Dan

Lo scenario S01 in collaudo con il telefono vero: targa letta dal fornitore, documenti letti da Claude, firma con OTP vero, pagamento in sandbox, fattura nella sandbox SDI, email e SMS reali.
