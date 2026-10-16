-- Independent review of phase 2 (ADR 0007, SIC-03).
--   1. The fields read from documents (names, fiscal codes, licence numbers)
--      are stored encrypted; the plaintext column goes away. Development
--      data had only synthetic values: they are dropped, not migrated.
--   2. The VAT number is stored encrypted with a blind index.
--   3. Row rules: a requester cannot change the status of a request outside
--      the transitions of the wizard, nor insert a verification round that
--      already carries a decision.

-- AlterTable
ALTER TABLE "Document" DROP COLUMN "extraction",
ADD COLUMN     "extractionEnc" TEXT;

-- AlterTable
ALTER TABLE "Person" DROP COLUMN "vatNumber",
ADD COLUMN     "vatNumberEnc" TEXT,
ADD COLUMN     "vatNumberHash" TEXT;

-- CreateIndex
CREATE INDEX "Person_vatNumberHash_idx" ON "Person"("vatNumberHash");

-- ---------------------------------------------------------------------------
-- Security (hand written)
-- ---------------------------------------------------------------------------

-- Requester transitions: submission (DRAFT or INTEGRATION_REQUESTED to
-- IN_VERIFICATION) and cancellation. Every other change of status, and any
-- change of the automatic outcome outside a submission, belongs to the back
-- office and the system jobs.
CREATE FUNCTION quote_request_guard_status() RETURNS trigger
  LANGUAGE plpgsql AS
$$ BEGIN
  IF app_is_privileged() THEN RETURN NEW; END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NOT (
      (OLD."status" IN ('DRAFT', 'INTEGRATION_REQUESTED') AND NEW."status" = 'IN_VERIFICATION')
      OR NEW."status" = 'CANCELLED'
    ) THEN
      RAISE EXCEPTION 'Status change reserved to the back office' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  IF NEW."autoOutcome" IS DISTINCT FROM OLD."autoOutcome" AND NEW."status" <> 'IN_VERIFICATION' THEN
    RAISE EXCEPTION 'Automatic outcome set only on submission' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER quote_request_guard_status BEFORE UPDATE ON "QuoteRequest"
  FOR EACH ROW EXECUTE FUNCTION quote_request_guard_status();

DROP POLICY verification_insert ON "Verification";
CREATE POLICY verification_insert ON "Verification" FOR INSERT
  WITH CHECK (
    app_owns_row("ownerUserId", "ownerOrganizationId")
    AND (app_is_privileged() OR ("decision" IS NULL AND "decidedByUserId" IS NULL))
  );
