-- Question 1 (docs/piano-decorrenza.md): three ways to set the start of cover.
CREATE TYPE "StartMode" AS ENUM ('DATE', 'ON_ISSUANCE', 'MIDNIGHT_AFTER_DEADLINE');

ALTER TABLE "QuoteRequest" ADD COLUMN "startMode" "StartMode" NOT NULL DEFAULT 'DATE';

ALTER TABLE "Policy" ADD COLUMN "startsAt" TIMESTAMPTZ(3);
