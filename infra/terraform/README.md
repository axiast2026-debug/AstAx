# Infrastruttura AWS (fase 8)

Terraform per AWS Milano (`eu-south-1`). **Scritta e controllata, non creata**: niente parte finché Dan non approva la stima dei costi (`docs/costi-aws.md`) e dice «crea» (proposta A del piano della fase 8).

## Cosa c'è

| Cartella | Cosa |
| --- | --- |
| `bootstrap/` | Una volta per account: bucket dello stato di Terraform e fornitore OIDC di GitHub |
| `modules/astax/` | Un ambiente intero: rete su 3 zone, chiavi KMS, S3 (documenti, copie del registro con Object Lock, CloudTrail, log del bilanciatore), PostgreSQL, Redis, Secrets Manager, ECR, ECS Fargate (web, admin, api, worker, Keycloak e il compito «tools»), bilanciatore HTTPS con WAF, SES con DKIM, CloudTrail, backup, allarmi |
| `envs/collaudo`, `envs/produzione` | I due ambienti, separati (produzione: database Multi-AZ, 3 NAT, protezione dalla cancellazione) |
| `modules/astax/tests/` | Prove con un AWS simulato: solo il worker decifra la busta chiusa (BC-03), il worker non usa la chiave delle copie delle agenzie (BC-04), copie del registro non modificabili (SIC-04), niente bucket pubblici, database e Redis cifrati, niente strumenti di sviluppo né fornitori finti nei container, produzione Multi-AZ |

La CI (`.github/workflows/ci.yml`, job «infra») controlla formato, validità e prove a ogni push. Il rilascio è `.github/workflows/deploy.yml`, a mano, con l'approvazione di Dan per la produzione.

## Le chiavi (docs/busta-chiusa.md)

- `sealed-bids`: la usa solo il ruolo del worker, e solo con il contesto `purpose=sealed-bid`. La radice dell'account può amministrarla ma non usarla, e un rifiuto esplicito copre ogni altro ruolo: nessuna politica IAM può dare all'API la chiave delle buste.
- `offer-owner`: la usa solo il ruolo dell'API (copie delle offerte per le agenzie, BC-04).
- `data`: tutto il resto a riposo (documenti, database, Redis, log, segreti, backup).

## Ordine delle operazioni (parte B)

1. **Account e stato.** Con un utente amministratore: `cd bootstrap && terraform init && terraform apply`. Annota `state_bucket` e `github_oidc_provider_arn`.
2. **Dominio e certificato.** Su ACM (`eu-south-1`) un certificato per `app.`, `admin.`, `api.`, `login.` del dominio dell'ambiente (`collaudo.astax.it`, `astax.it`), validato via DNS.
3. **Variabili.** In `envs/<ambiente>/terraform.tfvars` (mai nel repository, `.gitignore`): `certificate_arn`, `image_tag`, `alarm_email`, `github_oidc_provider_arn`, `bedrock_model_id`, `temporal_address`, `temporal_namespace`, `otlp_endpoint`.
4. **Creazione.** `terraform init -backend-config="bucket=<state_bucket>" && terraform apply`. Poi i record DNS: `load_balancer_dns` per i quattro nomi, i tre `ses_dkim_tokens` per DKIM.
5. **Segreti.** In Secrets Manager (`astax/<ambiente>/...`) i valori, a mano: chiavi di cifratura dei campi, URL del database per `astax_app` e `astax_owner`, password di Keycloak, chiavi VAPID, token di Openapi, chiave di Temporal Cloud, DSN di Sentry, intestazione di Grafana. Mai nella chat né nel repository.
6. **Ruoli del database.** Una volta, con l'utente amministratore di RDS (segreto gestito da RDS): gli stessi comandi di `infra/postgres/init/01-roles-and-databases.sh` (ruoli `astax_owner`, `astax_app` senza BYPASSRLS, `keycloak`; database `astax` e `keycloak`).
7. **GitHub.** Ambienti `collaudo` e `produzione` con le variabili `AWS_DEPLOY_ROLE_ARN`, `AWS_PRIVATE_SUBNETS`, `AWS_SERVICES_SECURITY_GROUP`; per `produzione` l'approvazione obbligatoria di Dan.
8. **Rilascio.** «Deploy» dalla scheda Actions: immagini, migrazioni, dati di riferimento (`pnpm db:seed:reference`, mai i dati sintetici), in produzione prima il blocco `pnpm release:check`, poi i servizi.
9. **Keycloak.** Import del realm `infra/keycloak/import/realm-astax.json` (con gli indirizzi dell'ambiente) e il segreto del client `astax-api-admin` messo in Secrets Manager.

## Prima della produzione, da provare in collaudo

- Prova di ripristino dai backup (RDS a un istante e da snapshot): tempi e dati persi da scrivere in `docs/go-live.md`.
- La prova IAM dal vivo: con il ruolo dell'API, `aws kms decrypt` di una chiave d'asta deve rispondere AccessDenied.
- La scansione OWASP ZAP sul collaudo e il test di sicurezza esterno.
