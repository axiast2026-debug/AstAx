-- Phase 7: entry of agencies and brokers from the site, with the local copy
-- of the RUI imported by the worker.

ALTER TYPE "OtpPurpose" ADD VALUE 'ONBOARDING_IBAN';

CREATE TABLE "RuiRecord" (
  "number" TEXT NOT NULL,
  "section" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "linkedNumber" TEXT,
  "companies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "importedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "RuiRecord_pkey" PRIMARY KEY ("number")
);

CREATE TABLE "RuiImport" (
  "id" UUID NOT NULL,
  "runDate" TEXT NOT NULL,
  "records" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMPTZ(3) NOT NULL,
  "finishedAt" TIMESTAMPTZ(3),
  CONSTRAINT "RuiImport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RuiImport_runDate_key" ON "RuiImport" ("runDate");

CREATE TYPE "OnboardingStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

CREATE TABLE "OnboardingApplication" (
  "id" UUID NOT NULL,
  "type" "OrganizationType" NOT NULL,
  "status" "OnboardingStatus" NOT NULL DEFAULT 'DRAFT',
  "tokenHash" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "vatNumber" TEXT NOT NULL,
  "fiscalCodeEnc" TEXT,
  "ruiNumber" TEXT NOT NULL,
  "pec" TEXT NOT NULL,
  "address" JSONB NOT NULL,
  "ibanEnc" TEXT NOT NULL,
  "ibanConfirmedAt" TIMESTAMPTZ(3),
  "ownerFirstName" TEXT NOT NULL,
  "ownerLastName" TEXT NOT NULL,
  "ownerEmailEnc" TEXT NOT NULL,
  "ownerEmailHash" TEXT NOT NULL,
  "ownerPhoneEnc" TEXT NOT NULL,
  "companyIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "profInsuranceKey" TEXT,
  "profInsuranceSha256" TEXT,
  "profInsuranceSize" INTEGER,
  "profInsuranceExpiresOn" DATE,
  "acceptedVersionIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "acceptedAt" TIMESTAMPTZ(3),
  "acceptedIp" TEXT,
  "acceptedUserAgent" TEXT,
  "ruiCheck" JSONB,
  "submittedAt" TIMESTAMPTZ(3),
  "decidedAt" TIMESTAMPTZ(3),
  "decidedByUserId" UUID,
  "decisionReason" TEXT,
  "organizationId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnboardingApplication_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OnboardingApplication_tokenHash_key" ON "OnboardingApplication" ("tokenHash");
CREATE INDEX "OnboardingApplication_status_idx" ON "OnboardingApplication" ("status");
CREATE INDEX "OnboardingApplication_ownerEmailHash_idx" ON "OnboardingApplication" ("ownerEmailHash");

-- Registry data: read by AstAx staff, written by the system (the import).
ALTER TABLE "RuiRecord" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rui_record_select ON "RuiRecord" FOR SELECT USING (app_is_privileged());
CREATE POLICY rui_record_write ON "RuiRecord" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());

ALTER TABLE "RuiImport" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rui_import_select ON "RuiImport" FOR SELECT USING (app_is_privileged());
CREATE POLICY rui_import_write ON "RuiImport" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());

-- The applicant has no account: the public steps run as the system after the
-- link is checked; the back office reads and decides.
ALTER TABLE "OnboardingApplication" ENABLE ROW LEVEL SECURITY;
CREATE POLICY onboarding_select ON "OnboardingApplication" FOR SELECT USING (app_is_privileged());
CREATE POLICY onboarding_write ON "OnboardingApplication" FOR ALL
  USING (app_is_privileged()) WITH CHECK (app_is_privileged());

CREATE TRIGGER set_updated_at BEFORE UPDATE ON "OnboardingApplication" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
