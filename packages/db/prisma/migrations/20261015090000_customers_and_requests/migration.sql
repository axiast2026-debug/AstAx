-- CreateEnum
CREATE TYPE "PersonKind" AS ENUM ('PERSON', 'COMPANY');

-- CreateEnum
CREATE TYPE "RequestChannel" AS ENUM ('PRIVATE', 'BROKER');

-- CreateEnum
CREATE TYPE "QuoteRequestStatus" AS ENUM ('DRAFT', 'IN_VERIFICATION', 'INTEGRATION_REQUESTED', 'EXCLUDED', 'AUCTION_OPEN', 'OFFERS_AVAILABLE', 'DESERTED', 'ACCEPTED', 'IN_ISSUANCE', 'ISSUED', 'EXPIRED', 'IN_RECONFIRMATION', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CheckOutcome" AS ENUM ('GREEN', 'YELLOW', 'RED');

-- CreateEnum
CREATE TYPE "QuoteDataSource" AS ENUM ('SUBMISSION', 'INTEGRATION', 'BACK_OFFICE_CORRECTION');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('DATA_SHARING_AGENCIES');

-- CreateEnum
CREATE TYPE "ConsentMethod" AS ENUM ('OTP_PRIVATE', 'OTP_LINK', 'UPLOADED_BY_BROKER');

-- CreateEnum
CREATE TYPE "ConsentLinkStatus" AS ENUM ('SENT', 'COMPLETED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('PRIVATE_CONSENT', 'LINK_CONSENT');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('REGISTRATION_CERTIFICATE', 'DRIVING_LICENCE', 'RISK_CERTIFICATE', 'FISCAL_CODE_CARD', 'CONSENT_FORM', 'OTHER');

-- CreateEnum
CREATE TYPE "VerificationDecision" AS ENUM ('APPROVED', 'INTEGRATION_REQUESTED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ');

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID,
    "ownerOrganizationId" UUID,
    "ownerMembershipId" UUID,
    "personId" UUID NOT NULL,
    "emailEnc" TEXT,
    "emailHash" TEXT,
    "phoneEnc" TEXT,
    "phoneHash" TEXT,
    "contactsVerifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID,
    "ownerOrganizationId" UUID,
    "kind" "PersonKind" NOT NULL,
    "surname" TEXT,
    "givenName" TEXT,
    "companyName" TEXT,
    "fiscalCodeEnc" TEXT,
    "fiscalCodeHash" TEXT,
    "vatNumber" TEXT,
    "birthDate" DATE,
    "birthPlace" TEXT,
    "sex" TEXT,
    "residence" JSONB,
    "profession" TEXT,
    "maritalStatus" TEXT,
    "children" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID,
    "ownerOrganizationId" UUID,
    "customerId" UUID NOT NULL,
    "plate" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteRequest" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "channel" "RequestChannel" NOT NULL,
    "ownerUserId" UUID,
    "ownerOrganizationId" UUID,
    "requesterUserId" UUID NOT NULL,
    "requesterMembershipId" UUID,
    "customerId" UUID,
    "status" "QuoteRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "draftEnc" TEXT,
    "quoteDataVersion" INTEGER,
    "plate" TEXT,
    "vehicleType" TEXT,
    "province" TEXT,
    "cuClass" INTEGER,
    "claimsLast5y" INTEGER,
    "youngestDriverAge" INTEGER,
    "packageCode" TEXT,
    "startDate" DATE,
    "minValidityDays" INTEGER,
    "auctionDurationHours" INTEGER,
    "autoOutcome" "CheckOutcome",
    "aiComparisonUsed" BOOLEAN NOT NULL DEFAULT false,
    "reconfirmationsUsed" INTEGER NOT NULL DEFAULT 0,
    "renewalOfPolicyId" UUID,
    "submittedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteDataVersion" (
    "id" UUID NOT NULL,
    "quoteRequestId" UUID NOT NULL,
    "ownerUserId" UUID,
    "ownerOrganizationId" UUID,
    "version" INTEGER NOT NULL,
    "dataEnc" TEXT NOT NULL,
    "dataSha256" TEXT NOT NULL,
    "source" "QuoteDataSource" NOT NULL,
    "changedFields" JSONB NOT NULL DEFAULT '[]',
    "reason" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteDataVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "ownerUserId" UUID,
    "ownerOrganizationId" UUID,
    "quoteRequestId" UUID,
    "type" "ConsentType" NOT NULL,
    "legalVersionId" UUID,
    "method" "ConsentMethod" NOT NULL,
    "evidence" JSONB NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentLink" (
    "id" UUID NOT NULL,
    "quoteRequestId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "ownerOrganizationId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "ConsentLinkStatus" NOT NULL DEFAULT 'SENT',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "sentByUserId" UUID NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" UUID NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "subjectId" UUID NOT NULL,
    "ownerUserId" UUID,
    "ownerOrganizationId" UUID,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "ownerUserId" UUID,
    "ownerOrganizationId" UUID,
    "quoteRequestId" UUID,
    "customerId" UUID,
    "driverIndex" INTEGER,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "encryption" TEXT NOT NULL DEFAULT 'SSE_KMS',
    "uploadedByUserId" UUID NOT NULL,
    "extraction" JSONB,
    "extractedAt" TIMESTAMPTZ(3),
    "retainUntil" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" UUID NOT NULL,
    "quoteRequestId" UUID NOT NULL,
    "ownerUserId" UUID,
    "ownerOrganizationId" UUID,
    "round" INTEGER NOT NULL,
    "quoteDataVersion" INTEGER NOT NULL,
    "autoOutcome" "CheckOutcome" NOT NULL,
    "checklist" JSONB NOT NULL,
    "assignedToUserId" UUID,
    "decision" "VerificationDecision",
    "reasonCodes" JSONB NOT NULL DEFAULT '[]',
    "message" TEXT,
    "decidedByUserId" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "excludedAgencies" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteRequestEvent" (
    "id" UUID NOT NULL,
    "quoteRequestId" UUID NOT NULL,
    "ownerUserId" UUID,
    "ownerOrganizationId" UUID,
    "type" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorUserId" UUID,
    "details" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteRequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "eventKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_ownerUserId_idx" ON "Customer"("ownerUserId");

-- CreateIndex
CREATE INDEX "Customer_ownerOrganizationId_idx" ON "Customer"("ownerOrganizationId");

-- CreateIndex
CREATE INDEX "Customer_emailHash_idx" ON "Customer"("emailHash");

-- CreateIndex
CREATE INDEX "Customer_phoneHash_idx" ON "Customer"("phoneHash");

-- CreateIndex
CREATE INDEX "Person_fiscalCodeHash_idx" ON "Person"("fiscalCodeHash");

-- CreateIndex
CREATE INDEX "Person_ownerOrganizationId_idx" ON "Person"("ownerOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_customerId_plate_key" ON "Vehicle"("customerId", "plate");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRequest_code_key" ON "QuoteRequest"("code");

-- CreateIndex
CREATE INDEX "QuoteRequest_ownerUserId_status_idx" ON "QuoteRequest"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "QuoteRequest_ownerOrganizationId_status_idx" ON "QuoteRequest"("ownerOrganizationId", "status");

-- CreateIndex
CREATE INDEX "QuoteRequest_status_submittedAt_idx" ON "QuoteRequest"("status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteDataVersion_quoteRequestId_version_key" ON "QuoteDataVersion"("quoteRequestId", "version");

-- CreateIndex
CREATE INDEX "Consent_customerId_type_idx" ON "Consent"("customerId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentLink_tokenHash_key" ON "ConsentLink"("tokenHash");

-- CreateIndex
CREATE INDEX "OtpChallenge_subjectId_purpose_idx" ON "OtpChallenge"("subjectId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_quoteRequestId_idx" ON "Document"("quoteRequestId");

-- CreateIndex
CREATE INDEX "Verification_decision_createdAt_idx" ON "Verification"("decision", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Verification_quoteRequestId_round_key" ON "Verification"("quoteRequestId", "round");

-- CreateIndex
CREATE INDEX "QuoteRequestEvent_quoteRequestId_at_idx" ON "QuoteRequestEvent"("quoteRequestId", "at");

-- CreateIndex
CREATE INDEX "Notification_userId_status_createdAt_idx" ON "Notification"("userId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteDataVersion" ADD CONSTRAINT "QuoteDataVersion_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentLink" ADD CONSTRAINT "ConsentLink_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequestEvent" ADD CONSTRAINT "QuoteRequestEvent_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Security (hand written, ADR 0007)
-- ---------------------------------------------------------------------------

-- Number of the request code (AX-2026-000001): one sequence, never reused.
CREATE SEQUENCE quote_request_number_seq AS bigint START 1;
GRANT USAGE, SELECT ON SEQUENCE quote_request_number_seq TO astax_app;

-- Owner of a customer or request row: the private user (with no professional
-- context active), the organization of the active context, or AstAx staff and
-- system jobs. Agencies are added in phase 3 through their invitations.
CREATE FUNCTION app_owns_row(owner_user uuid, owner_org uuid) RETURNS boolean
  LANGUAGE sql STABLE AS
$$ SELECT app_is_privileged()
     OR (owner_org IS NOT NULL AND owner_org = app_current_org_id())
     OR (owner_org IS NULL AND owner_user IS NOT NULL
         AND owner_user = app_current_user_id() AND app_current_org_id() IS NULL) $$;

-- A row must have exactly one kind of owner.
ALTER TABLE "Customer" ADD CONSTRAINT customer_one_owner
  CHECK (("ownerUserId" IS NULL) <> ("ownerOrganizationId" IS NULL));
ALTER TABLE "Person" ADD CONSTRAINT person_one_owner
  CHECK (("ownerUserId" IS NULL) <> ("ownerOrganizationId" IS NULL));
ALTER TABLE "Vehicle" ADD CONSTRAINT vehicle_one_owner
  CHECK (("ownerUserId" IS NULL) <> ("ownerOrganizationId" IS NULL));
ALTER TABLE "QuoteRequest" ADD CONSTRAINT quote_request_one_owner
  CHECK (("ownerUserId" IS NULL) <> ("ownerOrganizationId" IS NULL));
ALTER TABLE "QuoteRequest" ADD CONSTRAINT quote_request_channel_owner
  CHECK (("channel" = 'PRIVATE') = ("ownerUserId" IS NOT NULL));

-- History tables: rows are only ever added.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "QuoteDataVersion" FROM astax_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "QuoteRequestEvent" FROM astax_app;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON "Customer" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "Person" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "Vehicle" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "QuoteRequest" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "ConsentLink" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "OtpChallenge" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "Document" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "Verification" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "Notification" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_owner ON "Customer" FOR ALL
  USING (app_owns_row("ownerUserId", "ownerOrganizationId"))
  WITH CHECK (app_owns_row("ownerUserId", "ownerOrganizationId"));

ALTER TABLE "Person" ENABLE ROW LEVEL SECURITY;
CREATE POLICY person_owner ON "Person" FOR ALL
  USING (app_owns_row("ownerUserId", "ownerOrganizationId"))
  WITH CHECK (app_owns_row("ownerUserId", "ownerOrganizationId"));

ALTER TABLE "Vehicle" ENABLE ROW LEVEL SECURITY;
CREATE POLICY vehicle_owner ON "Vehicle" FOR ALL
  USING (app_owns_row("ownerUserId", "ownerOrganizationId"))
  WITH CHECK (app_owns_row("ownerUserId", "ownerOrganizationId"));

ALTER TABLE "QuoteRequest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY quote_request_owner ON "QuoteRequest" FOR ALL
  USING (app_owns_row("ownerUserId", "ownerOrganizationId"))
  WITH CHECK (app_owns_row("ownerUserId", "ownerOrganizationId"));

ALTER TABLE "QuoteDataVersion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY quote_data_version_select ON "QuoteDataVersion" FOR SELECT
  USING (app_owns_row("ownerUserId", "ownerOrganizationId"));
CREATE POLICY quote_data_version_insert ON "QuoteDataVersion" FOR INSERT
  WITH CHECK (app_owns_row("ownerUserId", "ownerOrganizationId"));

ALTER TABLE "Consent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY consent_owner ON "Consent" FOR ALL
  USING (app_owns_row("ownerUserId", "ownerOrganizationId"))
  WITH CHECK (app_owns_row("ownerUserId", "ownerOrganizationId"));

-- The customer opening a consent link has no account: the API serves the link
-- in a system context, after checking the token.
ALTER TABLE "ConsentLink" ENABLE ROW LEVEL SECURITY;
CREATE POLICY consent_link_owner ON "ConsentLink" FOR ALL
  USING (app_owns_row(NULL, "ownerOrganizationId"))
  WITH CHECK (app_owns_row(NULL, "ownerOrganizationId"));

ALTER TABLE "OtpChallenge" ENABLE ROW LEVEL SECURITY;
CREATE POLICY otp_challenge_owner ON "OtpChallenge" FOR ALL
  USING (app_owns_row("ownerUserId", "ownerOrganizationId"))
  WITH CHECK (app_owns_row("ownerUserId", "ownerOrganizationId"));

ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_owner ON "Document" FOR ALL
  USING (app_owns_row("ownerUserId", "ownerOrganizationId"))
  WITH CHECK (app_owns_row("ownerUserId", "ownerOrganizationId"));

-- The requester's submission creates the round with the automatic check; only
-- the back office records the decision.
ALTER TABLE "Verification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY verification_select ON "Verification" FOR SELECT
  USING (app_owns_row("ownerUserId", "ownerOrganizationId"));
CREATE POLICY verification_insert ON "Verification" FOR INSERT
  WITH CHECK (app_owns_row("ownerUserId", "ownerOrganizationId"));
CREATE POLICY verification_update ON "Verification" FOR UPDATE
  USING (app_is_privileged()) WITH CHECK (app_is_privileged());

ALTER TABLE "QuoteRequestEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY quote_request_event_select ON "QuoteRequestEvent" FOR SELECT
  USING (app_owns_row("ownerUserId", "ownerOrganizationId"));
CREATE POLICY quote_request_event_insert ON "QuoteRequestEvent" FOR INSERT
  WITH CHECK (app_owns_row("ownerUserId", "ownerOrganizationId"));

-- Notifications: each user reads their own; any use case may create one (for
-- example the requester's submission notifies the back office).
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_insert ON "Notification" FOR INSERT WITH CHECK (true);
CREATE POLICY notification_select ON "Notification" FOR SELECT
  USING (app_is_system() OR "userId" = app_current_user_id());
CREATE POLICY notification_update ON "Notification" FOR UPDATE
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
