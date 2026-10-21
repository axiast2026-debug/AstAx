-- ADR 0014 (Dan, 2026-10-21, docs/piano-broker.md C-E): the broker's lots from
-- an Excel file; each row is a request scheduled before the policy's expiry.
CREATE TABLE "RequestBatch" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "ownerOrganizationId" UUID NOT NULL,
  "requesterUserId" UUID NOT NULL,
  "requesterMembershipId" UUID NOT NULL,
  "fileName" TEXT NOT NULL,
  "rows" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequestBatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RequestBatch_code_key" ON "RequestBatch" ("code");
CREATE INDEX "RequestBatch_ownerOrganizationId_createdAt_idx" ON "RequestBatch" ("ownerOrganizationId", "createdAt");

ALTER TABLE "RequestBatch" ENABLE ROW LEVEL SECURITY;
CREATE POLICY request_batch_owner ON "RequestBatch" FOR ALL
  USING (app_owns_row(NULL, "ownerOrganizationId"))
  WITH CHECK (app_owns_row(NULL, "ownerOrganizationId"));

ALTER TABLE "QuoteRequest"
  ADD COLUMN "batchId" UUID,
  ADD COLUMN "batchLine" INTEGER,
  ADD COLUMN "policyExpiryDate" DATE,
  ADD COLUMN "scheduledSubmitAt" TIMESTAMPTZ(3),
  ADD COLUMN "documentsDueAt" TIMESTAMPTZ(3),
  ADD COLUMN "documentsNotifiedAt" TIMESTAMPTZ(3),
  ADD COLUMN "withoutDocuments" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "RequestBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "QuoteRequest_batchId_idx" ON "QuoteRequest" ("batchId");
CREATE INDEX "QuoteRequest_status_scheduledSubmitAt_idx" ON "QuoteRequest" ("status", "scheduledSubmitAt");

-- LT-2026-000001: one sequence, like the request codes.
CREATE SEQUENCE request_batch_number_seq AS bigint START 1;
GRANT USAGE, SELECT ON SEQUENCE request_batch_number_seq TO astax_app;
