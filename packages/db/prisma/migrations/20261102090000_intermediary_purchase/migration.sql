-- Dan, 2026-10-30 (ADR 0027): the intermediary buys the offer, the customer signs afterwards.
ALTER TABLE "Acceptance" ADD COLUMN "intermediaryPurchase" BOOLEAN NOT NULL DEFAULT false;
