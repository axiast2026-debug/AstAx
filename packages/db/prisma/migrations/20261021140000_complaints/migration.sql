-- Phase 7: the complaints register (protocol, 45 days, reminder, answer, IVASS export).

CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'ANSWERED');
CREATE TYPE "ComplaintOutcome" AS ENUM ('ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED');

CREATE TABLE "Complaint" (
  "id" UUID NOT NULL,
  "number" SERIAL NOT NULL,
  "protocol" TEXT NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL,
  "dueAt" TIMESTAMPTZ(3) NOT NULL,
  "channel" TEXT NOT NULL,
  "complainantUserId" UUID,
  "complainantName" TEXT NOT NULL,
  "complainantEmailEnc" TEXT,
  "complainantLocale" "Locale" NOT NULL DEFAULT 'it',
  "customerId" UUID,
  "quoteRequestId" UUID,
  "organizationId" UUID,
  "subject" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
  "responseText" TEXT,
  "outcome" "ComplaintOutcome",
  "answeredAt" TIMESTAMPTZ(3),
  "answeredByUserId" UUID,
  "reminderSentAt" TIMESTAMPTZ(3),
  "createdByUserId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Complaint_number_key" ON "Complaint" ("number");
CREATE UNIQUE INDEX "Complaint_protocol_key" ON "Complaint" ("protocol");
CREATE INDEX "Complaint_status_dueAt_idx" ON "Complaint" ("status", "dueAt");
CREATE INDEX "Complaint_complainantUserId_idx" ON "Complaint" ("complainantUserId");

-- The complainant reads the own complaints (and the answer); AstAx staff all.
ALTER TABLE "Complaint" ENABLE ROW LEVEL SECURITY;
CREATE POLICY complaint_select ON "Complaint" FOR SELECT
  USING (app_is_privileged() OR "complainantUserId" = app_current_user_id());
CREATE POLICY complaint_write ON "Complaint" FOR ALL
  USING (app_is_privileged()) WITH CHECK (app_is_privileged());
