# Test di contratto degli adattatori (fase 8)

Ogni porta ha una suite unica (`*.contract.ts`): le stesse prove girano sull'adattatore finto, su quello vero con un client AWS simulato e, quando ci sono le credenziali della sandbox, sul fornitore vero.

Le prove sulle sandbox partono solo se le variabili sono presenti (mai nel repository, regola 12):

| Porta                                        | Variabili                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| KMS                                          | `CONTRACT_AWS_REGION`, `CONTRACT_KMS_SEALED_KEY`, `CONTRACT_KMS_OWNER_KEY`                  |
| Email (SES)                                  | `CONTRACT_AWS_REGION`, `CONTRACT_SES_FROM`, `CONTRACT_SES_TO` (casella del simulatore SES)  |
| SMS                                          | `CONTRACT_AWS_REGION`, `CONTRACT_SMS_ORIGINATOR`, `CONTRACT_SMS_TO` (numero del simulatore) |
| Lettura documenti e spiegazione AI (Bedrock) | `CONTRACT_AWS_REGION`, `CONTRACT_BEDROCK_MODEL_ID`                                          |

Si lanciano con `pnpm --filter @astax/adapters test`; senza le variabili quelle parti risultano «skipped».
