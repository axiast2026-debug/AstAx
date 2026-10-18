-- Phase 7: requests about personal data (copy, correction, erasure), handled
-- by the back office within the legal term.

CREATE TYPE "DataSubjectRequestKind" AS ENUM ('ACCESS', 'RECTIFICATION', 'ERASURE');
CREATE TYPE "DataSubjectRequestStatus" AS ENUM ('OPEN', 'DONE', 'REJECTED');

CREATE TABLE "DataSubjectRequest" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "kind" "DataSubjectRequestKind" NOT NULL,
  "status" "DataSubjectRequestStatus" NOT NULL DEFAULT 'OPEN',
  "description" TEXT NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL,
  "dueAt" TIMESTAMPTZ(3) NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "outcome" TEXT,
  "closedByUserId" UUID,
  "closedAt" TIMESTAMPTZ(3),
  CONSTRAINT "DataSubjectRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DataSubjectRequest_customerId_idx" ON "DataSubjectRequest" ("customerId");
CREATE INDEX "DataSubjectRequest_status_dueAt_idx" ON "DataSubjectRequest" ("status", "dueAt");

ALTER TABLE "DataSubjectRequest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY data_subject_request_select ON "DataSubjectRequest" FOR SELECT USING (app_is_privileged());
CREATE POLICY data_subject_request_write ON "DataSubjectRequest" FOR ALL
  USING (app_is_privileged()) WITH CHECK (app_is_privileged());
