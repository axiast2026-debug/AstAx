-- Phase 5: acceptance, signature, payment, AI suggestions, the broker's customer
-- links and the complaints index (docs/modello-dati.md, «Accettazione, pagamenti»).

-- CreateEnum
CREATE TYPE "AcceptanceStatus" AS ENUM ('PENDING_SIGNATURE', 'SIGNED', 'PAID', 'VOIDED');

-- CreateEnum
CREATE TYPE "SignatureStatus" AS ENUM ('PENDING', 'SIGNED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'INSTANT_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- AlterEnum
ALTER TYPE "OtpPurpose" ADD VALUE 'CUSTOMER_LINK';

-- CreateTable
CREATE TABLE "CompanyComplaintsIndex" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyComplaintsIndex_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSuggestion" (
    "id" UUID NOT NULL,
    "quoteRequestId" UUID NOT NULL,
    "ownerUserId" UUID,
    "ownerOrganizationId" UUID,
    "offerIds" JSONB NOT NULL,
    "weights" JSONB NOT NULL,
    "inputs" JSONB NOT NULL,
    "scores" JSONB NOT NULL,
    "recommendedOfferId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "textSource" TEXT NOT NULL,
    "textProblems" JSONB NOT NULL DEFAULT '[]',
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "shownAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerLink" (
    "id" UUID NOT NULL,
    "quoteRequestId" UUID NOT NULL,
    "ownerOrganizationId" UUID NOT NULL,
    "offerIds" JSONB NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "otpVerifiedAt" TIMESTAMPTZ(3),
    "sentByUserId" UUID NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Acceptance" (
    "id" UUID NOT NULL,
    "quoteRequestId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "ownerUserId" UUID,
    "ownerOrganizationId" UUID,
    "acceptedByUserId" UUID,
    "customerLinkId" UUID,
    "premiumCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "feeRule" TEXT NOT NULL,
    "brokerFeeCents" INTEGER NOT NULL DEFAULT 0,
    "aiUsed" BOOLEAN NOT NULL,
    "status" "AcceptanceStatus" NOT NULL DEFAULT 'PENDING_SIGNATURE',
    "signedAt" TIMESTAMPTZ(3),
    "paidAt" TIMESTAMPTZ(3),
    "issuanceDeadlineAt" TIMESTAMPTZ(3),
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Acceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureEnvelope" (
    "id" UUID NOT NULL,
    "acceptanceId" UUID NOT NULL,
    "ownerUserId" UUID,
    "ownerOrganizationId" UUID,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT NOT NULL,
    "status" "SignatureStatus" NOT NULL DEFAULT 'PENDING',
    "documentIds" JSONB NOT NULL,
    "signedDocumentIds" JSONB NOT NULL DEFAULT '[]',
    "evidenceDocumentId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignatureEnvelope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "acceptanceId" UUID NOT NULL,
    "ownerUserId" UUID,
    "ownerOrganizationId" UUID,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "method" "PaymentMethod",
    "premiumCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "capturedAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderEvent" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyComplaintsIndex_companyId_year_key" ON "CompanyComplaintsIndex"("companyId", "year");

-- CreateIndex
CREATE INDEX "AiSuggestion_quoteRequestId_idx" ON "AiSuggestion"("quoteRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLink_tokenHash_key" ON "CustomerLink"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerLink_quoteRequestId_idx" ON "CustomerLink"("quoteRequestId");

-- CreateIndex
CREATE INDEX "Acceptance_quoteRequestId_status_idx" ON "Acceptance"("quoteRequestId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SignatureEnvelope_acceptanceId_key" ON "SignatureEnvelope"("acceptanceId");

-- CreateIndex
CREATE UNIQUE INDEX "SignatureEnvelope_providerRef_key" ON "SignatureEnvelope"("providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerRef_key" ON "Payment"("providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_acceptanceId_idx" ON "Payment"("acceptanceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderEvent_provider_eventId_key" ON "ProviderEvent"("provider", "eventId");

-- AddForeignKey
ALTER TABLE "CompanyComplaintsIndex" ADD CONSTRAINT "CompanyComplaintsIndex_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "InsuranceCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSuggestion" ADD CONSTRAINT "AiSuggestion_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLink" ADD CONSTRAINT "CustomerLink_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acceptance" ADD CONSTRAINT "Acceptance_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acceptance" ADD CONSTRAINT "Acceptance_customerLinkId_fkey" FOREIGN KEY ("customerLinkId") REFERENCES "CustomerLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureEnvelope" ADD CONSTRAINT "SignatureEnvelope_acceptanceId_fkey" FOREIGN KEY ("acceptanceId") REFERENCES "Acceptance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_acceptanceId_fkey" FOREIGN KEY ("acceptanceId") REFERENCES "Acceptance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE TRIGGER set_updated_at BEFORE UPDATE ON "CompanyComplaintsIndex" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "CustomerLink" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "Acceptance" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "SignatureEnvelope" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- FEE-07: whole cents, never negative.
ALTER TABLE "Acceptance" ADD CONSTRAINT acceptance_amounts
  CHECK ("premiumCents" > 0 AND "feeCents" >= 0 AND "brokerFeeCents" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT payment_amounts
  CHECK ("premiumCents" > 0 AND "feeCents" >= 0);
-- An acceptance is made by the private user or on the broker's link.
ALTER TABLE "Acceptance" ADD CONSTRAINT acceptance_one_author
  CHECK (("acceptedByUserId" IS NULL) <> ("customerLinkId" IS NULL));
-- One live acceptance per request (decision 22: a new one voids the previous).
CREATE UNIQUE INDEX acceptance_one_live ON "Acceptance" ("quoteRequestId")
  WHERE "status" <> 'VOIDED';

-- Row level security, second line after the API's checks (rule 3).
-- The complaints index: read by everybody signed in, written by AstAx.
ALTER TABLE "CompanyComplaintsIndex" ENABLE ROW LEVEL SECURITY;
CREATE POLICY complaints_read ON "CompanyComplaintsIndex" FOR SELECT USING (true);
CREATE POLICY complaints_write ON "CompanyComplaintsIndex" FOR ALL
  USING (app_is_privileged()) WITH CHECK (app_is_privileged());

-- The requester's own rows (and AstAx); only the system writes them, after the
-- API's checks or from the providers' webhooks.
ALTER TABLE "AiSuggestion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_suggestion_read ON "AiSuggestion" FOR SELECT
  USING (app_owns_row("ownerUserId", "ownerOrganizationId"));
CREATE POLICY ai_suggestion_write ON "AiSuggestion" FOR INSERT WITH CHECK (app_is_system());
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "AiSuggestion" FROM astax_app;

ALTER TABLE "Acceptance" ENABLE ROW LEVEL SECURITY;
CREATE POLICY acceptance_read ON "Acceptance" FOR SELECT
  USING (app_owns_row("ownerUserId", "ownerOrganizationId"));
CREATE POLICY acceptance_write ON "Acceptance" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
REVOKE DELETE, TRUNCATE ON TABLE "Acceptance" FROM astax_app;

ALTER TABLE "SignatureEnvelope" ENABLE ROW LEVEL SECURITY;
CREATE POLICY signature_read ON "SignatureEnvelope" FOR SELECT
  USING (app_owns_row("ownerUserId", "ownerOrganizationId"));
CREATE POLICY signature_write ON "SignatureEnvelope" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
REVOKE DELETE, TRUNCATE ON TABLE "SignatureEnvelope" FROM astax_app;

ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_read ON "Payment" FOR SELECT
  USING (app_owns_row("ownerUserId", "ownerOrganizationId"));
CREATE POLICY payment_write ON "Payment" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
REVOKE DELETE, TRUNCATE ON TABLE "Payment" FROM astax_app;

-- The broker's links: the broker and AstAx read them; the customer reaches
-- them only through the API, by the token.
ALTER TABLE "CustomerLink" ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_link_read ON "CustomerLink" FOR SELECT
  USING (app_owns_row(NULL, "ownerOrganizationId"));
CREATE POLICY customer_link_write ON "CustomerLink" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
REVOKE DELETE, TRUNCATE ON TABLE "CustomerLink" FROM astax_app;

ALTER TABLE "ProviderEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY provider_event_all ON "ProviderEvent" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "ProviderEvent" FROM astax_app;
