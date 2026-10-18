-- Phase 7: notes of the back office on agencies and brokers, and the exclusion
-- proposals the administrator decides.

CREATE TYPE "OrganizationNoteKind" AS ENUM ('NOTE', 'EXCLUSION_PROPOSAL');

CREATE TABLE "OrganizationNote" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "kind" "OrganizationNoteKind" NOT NULL,
  "text" TEXT NOT NULL,
  "authorUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "decision" TEXT,
  "decisionReason" TEXT,
  "decidedByUserId" UUID,
  "decidedAt" TIMESTAMPTZ(3),
  CONSTRAINT "OrganizationNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrganizationNote_organizationId_idx" ON "OrganizationNote" ("organizationId");

-- Internal notes: AstAx staff only, never the organization itself.
ALTER TABLE "OrganizationNote" ENABLE ROW LEVEL SECURITY;
CREATE POLICY organization_note_select ON "OrganizationNote" FOR SELECT USING (app_is_privileged());
CREATE POLICY organization_note_write ON "OrganizationNote" FOR ALL
  USING (app_is_privileged()) WITH CHECK (app_is_privileged());
