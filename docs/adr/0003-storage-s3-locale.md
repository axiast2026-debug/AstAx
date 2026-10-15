# 0003 — Storage S3 locale: SeaweedFS invece di MinIO

- **Data:** 2026-10-15
- **Stato:** proposta
- **Fase:** 1

## Contesto

`CLAUDE.md` e `docs/architettura-codice.md` prevedono MinIO come object storage compatibile S3 in locale. Le immagini Docker ufficiali di MinIO non vengono più pubblicate: `minio/minio` non c'è più su Docker Hub e `quay.io/minio/minio:latest` non ha un'immagine. Restano solo ricompilazioni di terzi.

In produzione lo storage è S3 su AWS `eu-south-1`: quello locale serve solo a sviluppare e a provare il codice con la stessa API.

## Decisione

In locale si usa **SeaweedFS** (`chrislusf/seaweedfs:4.48`, licenza Apache 2.0, immagine ufficiale del progetto) con il gateway S3 sulla porta 8333. Le credenziali S3 locali si generano in `.env` (`pnpm env:init`) e il container le scrive nella sua configurazione all'avvio. Il codice usa solo l'SDK S3 di AWS dietro una porta in `packages/adapters`: cambiare lo storage locale non tocca il resto.

## Alternative considerate

| Alternativa | Perché no |
| --- | --- |
| Ricompilazioni di MinIO di terzi (`pgsty/minio`) | Binari non ufficiali: un rischio per la catena di fornitura |
| Compilare MinIO da sorgente | Lavoro e manutenzione in più solo per lo sviluppo |
| RustFS | Progetto giovane, API S3 meno collaudata |
| LocalStack | Più pesante in memoria (il PC di sviluppo ha 8 GB) e alcune funzioni sono a pagamento |

## Conseguenze

- I test di contratto dello storage girano su SeaweedFS in locale e su S3 vero in fase 8.
- Object Lock (copie del registro non modificabili) si prova solo su S3 vero, in fase 8: è già tra i debiti tecnici.
- Nei documenti, «MinIO» va letto come «storage S3 locale».
