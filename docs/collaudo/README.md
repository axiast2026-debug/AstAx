# Collaudo (fase 8, parte B)

Qui vanno i rapporti delle prove in collaudo: scenari S01-S10 con le sandbox vere, test di contratto, scansione ZAP, test di sicurezza esterno, prova di carico, prova di ripristino, misura della lettura AI.

## Misura della lettura AI (80 documenti anonimi)

1. Dan raccoglie i documenti con il consenso degli interessati: 20 libretti, 20 patenti, 20 attestati, 20 preventivi in PDF di almeno 5 compagnie. **Non entrano mai nel repository** (è pubblico): restano in una cartella di Dan.
2. Una sottocartella per tipo (`REGISTRATION_CERTIFICATE`, `DRIVING_LICENCE`, `RISK_CERTIFICATE`, `FISCAL_CODE_CARD`, `QUOTE_PDF`) e in essa una per documento, con le immagini o il PDF e `expected.json`, i valori giusti scritti a mano con i nomi dei campi di `packages/adapters/src/document-reader/fields.ts`.
3. Con l'accesso a Bedrock: `AI_PROVIDER=bedrock BEDROCK_MODEL_ID=<profilo UE> pnpm --filter @astax/adapters measure:reading <cartella> --threshold 0.9 --out docs/collaudo/lettura-ai-<data>.md`.
4. Il rapporto mostra, per ogni campo, quanti sono sopra soglia, quanti di questi sono giusti e quanti vanno al back office; contiene solo i nomi dei casi, mai i valori letti. Criterio: almeno 95% di corretti sopra soglia (proposta E); se non si raggiunge si rivedono i prompt (`packages/adapters/prompts/`, nuova versione) o la soglia (`documents.confidenceThreshold`).
