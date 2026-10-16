-- Second round of the phase 2 independent review.
--   1. One-time codes keep the time they were sent, read from Clock (rule 6).
--   2. Requester row rules, tighter: cancellation only from the states where
--      it is allowed; the outcome, the version of the data and the derived
--      columns change only with a submission.

-- AlterTable
ALTER TABLE "OtpChallenge" ADD COLUMN "issuedAt" TIMESTAMPTZ(3);

CREATE OR REPLACE FUNCTION quote_request_guard_status() RETURNS trigger
  LANGUAGE plpgsql AS
$$ DECLARE
  submission boolean := OLD."status" IN ('DRAFT', 'INTEGRATION_REQUESTED') AND NEW."status" = 'IN_VERIFICATION';
  cancellation boolean := NEW."status" = 'CANCELLED' AND OLD."status" IN
    ('DRAFT', 'IN_VERIFICATION', 'INTEGRATION_REQUESTED', 'OFFERS_AVAILABLE', 'DESERTED', 'EXPIRED');
BEGIN
  IF app_is_privileged() THEN RETURN NEW; END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (submission OR cancellation) THEN
    RAISE EXCEPTION 'Status change reserved to the back office' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT submission AND (
    NEW."autoOutcome" IS DISTINCT FROM OLD."autoOutcome"
    OR NEW."quoteDataVersion" IS DISTINCT FROM OLD."quoteDataVersion"
    OR NEW."submittedAt" IS DISTINCT FROM OLD."submittedAt"
    OR NEW."vehicleType" IS DISTINCT FROM OLD."vehicleType"
    OR NEW."province" IS DISTINCT FROM OLD."province"
    OR NEW."cuClass" IS DISTINCT FROM OLD."cuClass"
    OR NEW."claimsLast5y" IS DISTINCT FROM OLD."claimsLast5y"
    OR NEW."youngestDriverAge" IS DISTINCT FROM OLD."youngestDriverAge"
    OR NEW."packageCode" IS DISTINCT FROM OLD."packageCode"
    OR NEW."startDate" IS DISTINCT FROM OLD."startDate"
    OR NEW."minValidityDays" IS DISTINCT FROM OLD."minValidityDays"
    OR NEW."auctionDurationHours" IS DISTINCT FROM OLD."auctionDurationHours"
  ) THEN
    RAISE EXCEPTION 'Automatic outcome and data version change only on submission'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
