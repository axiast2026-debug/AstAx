-- Phase 7 (LEG-06, proposal G): a request not concluded loses documents and
-- personal data after retention.incompleteRequestsMonths; code, dates and
-- the audit log stay.

ALTER TABLE "QuoteRequest" ADD COLUMN "purgedAt" TIMESTAMPTZ(3);
CREATE INDEX "QuoteRequest_status_updatedAt_idx" ON "QuoteRequest" ("status", "updatedAt");

-- The versions of quoteData are never changed, except by the system to empty
-- them for retention.
CREATE POLICY quote_data_version_purge ON "QuoteDataVersion" FOR UPDATE
  USING (app_is_system()) WITH CHECK (app_is_system());
