# Stima dei costi mensili (fase 8, da approvare prima di creare)

**Stima indicativa**, fatta il 2026-10-18 sui listini pubblici, in dollari USA (AWS fattura in dollari). Va confermata con il calcolatore di AWS (calculator.aws) quando si crea l'account: i prezzi di Milano sono in genere un po' più alti di quelli di Irlanda e Francoforte. Non comprende IVA e i costi a consumo dei fornitori italiani (Openapi, Namirial, Fabrick), che dipendono dai contratti.

## Collaudo (`infra/terraform/envs/collaudo`)

| Voce | Cosa | Al mese (circa) |
| --- | --- | --- |
| Container (Fargate, ARM) | api, worker ×2, web, admin, Keycloak, 1 copia ciascuno | 100 – 130 $ |
| NAT | 1, per uscire verso fornitori e AWS | 40 – 50 $ |
| Bilanciatore | 1 HTTPS | 25 – 35 $ |
| PostgreSQL (RDS) | db.t4g.medium, una zona, 50 GB | 70 – 90 $ |
| Redis | cache.t4g.small, 1 nodo | 25 – 35 $ |
| WAF, KMS, segreti, CloudWatch, CloudTrail, S3, backup | | 50 – 80 $ |
| Temporal Cloud | piano base, un namespace | ~100 $ |
| Sentry, Grafana Cloud | piani piccoli o gratuiti | 0 – 30 $ |
| **Totale collaudo** | | **~400 – 550 $** |

Si può spendere meno: spegnere i container di notte e nel fine settimana (circa −40% su Fargate), o tenere il collaudo acceso solo nelle settimane di prova.

## Produzione, versione di partenza (`infra/terraform/envs/produzione`, scelta di Dan del 2026-10-18)

Come il collaudo, ma con la protezione dalla cancellazione e i backup della produzione. Se una zona di AWS si ferma, il servizio si ferma finché non riparte (o si ripristina dai backup): è il rischio accettato per partire spendendo meno.

| Voce | Cosa | Al mese (circa) |
| --- | --- | --- |
| Container (Fargate, ARM) | 1 copia di ogni servizio, il worker 2 | 100 – 130 $ |
| NAT | 1 | 40 – 50 $ |
| Bilanciatore | 1 HTTPS | 30 – 50 $ |
| PostgreSQL (RDS) | db.t4g.medium, una zona, 50 GB | 70 – 90 $ |
| Redis | 1 nodo | 25 – 35 $ |
| WAF, KMS, segreti, CloudWatch, CloudTrail, S3, backup | | 60 – 120 $ |
| Temporal Cloud | piano base | ~100 $ |
| Sentry, Grafana Cloud | piani piccoli | 0 – 50 $ |
| **Totale produzione di partenza, fisso** | | **~450 – 650 $** |

Si passa alla versione robusta (sotto) cambiando i valori scritti nel commento di `envs/produzione/main.tf`, senza rifare nulla.

## Produzione, versione robusta (più avanti)

| Voce | Cosa | Al mese (circa) |
| --- | --- | --- |
| Container (Fargate, ARM) | 2 copie di ogni servizio | 220 – 280 $ |
| NAT | 3, una per zona | 120 – 150 $ |
| Bilanciatore | 1 HTTPS | 30 – 50 $ |
| PostgreSQL (RDS) | db.m7g.large, Multi-AZ, 50 GB | 330 – 400 $ |
| Redis | 2 nodi con failover | 50 – 70 $ |
| WAF, KMS, segreti, CloudWatch, CloudTrail, S3, backup | | 80 – 150 $ |
| Temporal Cloud | | 100 – 200 $ |
| Sentry, Grafana Cloud | | 30 – 80 $ |
| **Totale produzione robusta, fisso** | | **~950 – 1.400 $** |

## A consumo (entrambi gli ambienti)

| Voce | Prezzo indicativo |
| --- | --- |
| Email (SES) | 0,10 $ ogni 1.000 email |
| SMS verso l'Italia (AWS) | 0,07 – 0,09 $ a SMS |
| Lettura documenti e spiegazione AI (Claude su Bedrock) | pochi centesimi a richiesta, secondo il modello scelto |
| Traffico in uscita | primi 100 GB gratuiti, poi ~0,09 $/GB |

## Cosa serve sapere da Dan

- Collaudo: Dan ha scelto di tenerlo acceso solo nelle settimane di prova (domanda 21).
- Il modello di Claude da usare (più capace e costoso, o più veloce ed economico): la misura sugli 80 documenti aiuta a scegliere.
