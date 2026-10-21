-- Dan, 2026-10-21 (docs/piano-flusso-semplificato.md): package CUSTOM, the
-- coverages chosen one by one by the private customer.
ALTER TABLE "QuoteRequest" ADD COLUMN "chosenCoverages" TEXT[] DEFAULT ARRAY[]::TEXT[];
