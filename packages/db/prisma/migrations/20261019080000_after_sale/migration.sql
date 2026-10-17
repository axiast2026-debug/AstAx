-- Phase 6: after the purchase. Policies, issuance cases, second offers,
-- penalties, suspensions, remittances, invoices, refunds, withdrawals, the
-- broker's quota, the questionnaire and the flags (docs/modello-dati.md).

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('ACTIVE', 'EXPIRING', 'EXPIRED', 'WITHDRAWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IssuanceProblemType" AS ENUM ('DATA_MISMATCH', 'CANNOT_ISSUE', 'MISSED_DEADLINE');

-- CreateEnum
CREATE TYPE "IssuanceFault" AS ENUM ('AGENCY', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "IssuanceProblemStatus" AS ENUM ('OPEN', 'DECIDED');

-- CreateEnum
CREATE TYPE "NextOfferKind" AS ENUM ('SECOND_OFFER', 'REPRICE');

-- CreateEnum
CREATE TYPE "NextOfferStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REFUSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PenaltyType" AS ENUM ('LATE_ISSUANCE', 'MISSED_ISSUANCE', 'CIRCUMVENTION');

-- CreateEnum
CREATE TYPE "PenaltyStatus" AS ENUM ('PROPOSED', 'APPLIED', 'CONTESTED', 'UPHELD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RemittanceStatus" AS ENUM ('DRAFT', 'READY', 'FILE_GENERATED', 'EXECUTED');

-- CreateEnum
CREATE TYPE "RemittanceLineKind" AS ENUM ('POLICY', 'BROKER_SHARE', 'CARRIED_OVER', 'RECOVERY', 'PENALTY');

-- CreateEnum
CREATE TYPE "InvoiceSeries" AS ENUM ('P', 'A', 'B', 'N');

-- CreateEnum
CREATE TYPE "InvoiceRecipientType" AS ENUM ('PRIVATE', 'AGENCY', 'BROKER');

-- CreateEnum
CREATE TYPE "SdiStatus" AS ENUM ('TO_SEND', 'SENT', 'DELIVERED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RefundReason" AS ENUM ('BEFORE_ISSUANCE', 'WITHDRAWAL', 'SECOND_OFFER_DIFFERENCE', 'INVALID_ACCEPTANCE');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'EXECUTED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('REQUESTED', 'PRICED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BrokerCommissionStatus" AS ENUM ('ACCRUED', 'SETTLED');

-- CreateEnum
CREATE TYPE "FlagType" AS ENUM ('CIRCUMVENTION', 'FRAUD');

-- CreateEnum
CREATE TYPE "FlagStatus" AS ENUM ('OPEN', 'ARCHIVED', 'PENALTY_PROPOSED', 'SUSPENSION_PROPOSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentKind" ADD VALUE 'ISSUED_POLICY';
ALTER TYPE "DocumentKind" ADD VALUE 'POLICY_RECEIPT';
ALTER TYPE "DocumentKind" ADD VALUE 'INSURANCE_CERTIFICATE';
ALTER TYPE "DocumentKind" ADD VALUE 'INVOICE_PDF';

-- CreateTable
CREATE TABLE "Policy" (
    "id" UUID NOT NULL,
    "quoteRequestId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "acceptanceId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "ownerUserId" UUID,
    "ownerOrganizationId" UUID,
    "policyNumber" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "premiumCents" INTEGER NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL,
    "issuedByUserId" UUID NOT NULL,
    "status" "PolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "autoRenewal" BOOLEAN NOT NULL DEFAULT false,
    "renewalRequestId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssuanceProblem" (
    "id" UUID NOT NULL,
    "quoteRequestId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "IssuanceProblemType" NOT NULL,
    "description" TEXT,
    "openedByUserId" UUID,
    "openedAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "IssuanceProblemStatus" NOT NULL DEFAULT 'OPEN',
    "fault" "IssuanceFault",
    "decidedByUserId" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "decisionReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssuanceProblem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NextOfferProposal" (
    "id" UUID NOT NULL,
    "quoteRequestId" UUID NOT NULL,
    "ownerUserId" UUID,
    "ownerOrganizationId" UUID,
    "kind" "NextOfferKind" NOT NULL,
    "fromOfferId" UUID NOT NULL,
    "toOfferId" UUID NOT NULL,
    "premiumCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "differenceCents" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "NextOfferStatus" NOT NULL DEFAULT 'PROPOSED',
    "decidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NextOfferProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Penalty" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "PenaltyType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "quoteRequestId" UUID,
    "status" "PenaltyStatus" NOT NULL DEFAULT 'PROPOSED',
    "reason" TEXT NOT NULL,
    "proposedByUserId" UUID,
    "proposedAt" TIMESTAMPTZ(3) NOT NULL,
    "appliedByUserId" UUID,
    "appliedAt" TIMESTAMPTZ(3),
    "contestUntil" TIMESTAMPTZ(3),
    "contestText" TEXT,
    "contestedAt" TIMESTAMPTZ(3),
    "decision" TEXT,
    "decidedByUserId" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "replacesId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Penalty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencySuspension" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "confirmedByUserId" UUID,
    "confirmedAt" TIMESTAMPTZ(3),
    "revokedByUserId" UUID,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencySuspension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Remittance" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "runDate" DATE NOT NULL,
    "cutoffAt" TIMESTAMPTZ(3) NOT NULL,
    "grossCents" INTEGER NOT NULL,
    "feesCents" INTEGER NOT NULL,
    "heldCents" INTEGER NOT NULL,
    "netCents" INTEGER NOT NULL,
    "carriedCents" INTEGER NOT NULL,
    "status" "RemittanceStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewedByUserId" UUID,
    "sepaFileKey" TEXT,
    "executedAt" TIMESTAMPTZ(3),
    "executedByUserId" UUID,
    "invoiceId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Remittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemittanceLine" (
    "id" UUID NOT NULL,
    "remittanceId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "kind" "RemittanceLineKind" NOT NULL,
    "ref" UUID NOT NULL,
    "requestedCents" INTEGER NOT NULL,
    "appliedCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemittanceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "series" "InvoiceSeries" NOT NULL,
    "year" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "recipientType" "InvoiceRecipientType" NOT NULL,
    "ownerUserId" UUID,
    "ownerOrganizationId" UUID,
    "recipientEnc" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "exemptCents" INTEGER NOT NULL,
    "stampDutyCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "vatNature" TEXT NOT NULL,
    "legalReference" TEXT NOT NULL,
    "issuedOn" DATE NOT NULL,
    "dueOn" DATE,
    "quoteRequestId" UUID,
    "remittanceId" UUID,
    "period" TEXT,
    "creditedInvoiceId" UUID,
    "sdiStatus" "SdiStatus" NOT NULL DEFAULT 'TO_SEND',
    "sdiRef" TEXT,
    "xmlKey" TEXT,
    "pdfDocumentId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceCounter" (
    "series" "InvoiceSeries" NOT NULL,
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("series","year")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "quoteRequestId" UUID NOT NULL,
    "ownerUserId" UUID,
    "ownerOrganizationId" UUID,
    "reason" "RefundReason" NOT NULL,
    "premiumCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "recoverFromOrganizationId" UUID,
    "requestedByUserId" UUID,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL,
    "approvedByUserId" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "providerRef" TEXT,
    "executedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumerWithdrawal" (
    "id" UUID NOT NULL,
    "policyId" UUID NOT NULL,
    "quoteRequestId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "ownerUserId" UUID,
    "ownerOrganizationId" UUID,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "refundableCents" INTEGER,
    "pricedByUserId" UUID,
    "pricedAt" TIMESTAMPTZ(3),
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'REQUESTED',
    "decidedByUserId" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "refundId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumerWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerCommission" (
    "id" UUID NOT NULL,
    "policyId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "BrokerCommissionStatus" NOT NULL DEFAULT 'ACCRUED',
    "settledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokerCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostSaleSurvey" (
    "id" UUID NOT NULL,
    "policyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sentAt" TIMESTAMPTZ(3) NOT NULL,
    "answeredAt" TIMESTAMPTZ(3),
    "answers" JSONB,
    "contactedByOthers" BOOLEAN,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostSaleSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flag" (
    "id" UUID NOT NULL,
    "type" "FlagType" NOT NULL,
    "source" TEXT NOT NULL,
    "quoteRequestId" UUID,
    "organizationId" UUID,
    "status" "FlagStatus" NOT NULL DEFAULT 'OPEN',
    "outcome" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Policy_quoteRequestId_key" ON "Policy"("quoteRequestId");

-- CreateIndex
CREATE INDEX "Policy_organizationId_issuedAt_idx" ON "Policy"("organizationId", "issuedAt");

-- CreateIndex
CREATE INDEX "Policy_ownerOrganizationId_idx" ON "Policy"("ownerOrganizationId");

-- CreateIndex
CREATE INDEX "Policy_ownerUserId_idx" ON "Policy"("ownerUserId");

-- CreateIndex
CREATE INDEX "Policy_endDate_idx" ON "Policy"("endDate");

-- CreateIndex
CREATE INDEX "IssuanceProblem_quoteRequestId_idx" ON "IssuanceProblem"("quoteRequestId");

-- CreateIndex
CREATE INDEX "IssuanceProblem_status_idx" ON "IssuanceProblem"("status");

-- CreateIndex
CREATE INDEX "NextOfferProposal_quoteRequestId_idx" ON "NextOfferProposal"("quoteRequestId");

-- CreateIndex
CREATE INDEX "NextOfferProposal_status_expiresAt_idx" ON "NextOfferProposal"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Penalty_organizationId_status_idx" ON "Penalty"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Penalty_quoteRequestId_idx" ON "Penalty"("quoteRequestId");

-- CreateIndex
CREATE INDEX "AgencySuspension_organizationId_idx" ON "AgencySuspension"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Remittance_organizationId_runDate_key" ON "Remittance"("organizationId", "runDate");

-- CreateIndex
CREATE INDEX "RemittanceLine_remittanceId_idx" ON "RemittanceLine"("remittanceId");

-- CreateIndex
CREATE INDEX "RemittanceLine_kind_ref_idx" ON "RemittanceLine"("kind", "ref");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_code_key" ON "Invoice"("code");

-- CreateIndex
CREATE INDEX "Invoice_ownerOrganizationId_idx" ON "Invoice"("ownerOrganizationId");

-- CreateIndex
CREATE INDEX "Invoice_ownerUserId_idx" ON "Invoice"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_series_year_number_key" ON "Invoice"("series", "year", "number");

-- CreateIndex
CREATE INDEX "Refund_quoteRequestId_idx" ON "Refund"("quoteRequestId");

-- CreateIndex
CREATE INDEX "Refund_status_idx" ON "Refund"("status");

-- CreateIndex
CREATE INDEX "Refund_recoverFromOrganizationId_idx" ON "Refund"("recoverFromOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumerWithdrawal_policyId_key" ON "ConsumerWithdrawal"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerCommission_policyId_key" ON "BrokerCommission"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "PostSaleSurvey_policyId_key" ON "PostSaleSurvey"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "PostSaleSurvey_tokenHash_key" ON "PostSaleSurvey"("tokenHash");

-- CreateIndex
CREATE INDEX "Flag_status_idx" ON "Flag"("status");

-- AddForeignKey
ALTER TABLE "RemittanceLine" ADD CONSTRAINT "RemittanceLine_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "Remittance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE TRIGGER set_updated_at BEFORE UPDATE ON "Policy" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "IssuanceProblem" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "NextOfferProposal" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "Penalty" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "AgencySuspension" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "Remittance" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "Invoice" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "Refund" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "ConsumerWithdrawal" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "BrokerCommission" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "PostSaleSurvey" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "Flag" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Rule 5: whole cents, never negative (a difference may be negative by meaning).
ALTER TABLE "Policy" ADD CONSTRAINT policy_amounts CHECK ("premiumCents" > 0);
ALTER TABLE "Penalty" ADD CONSTRAINT penalty_amounts CHECK ("amountCents" > 0);
ALTER TABLE "Remittance" ADD CONSTRAINT remittance_amounts
  CHECK ("grossCents" >= 0 AND "feesCents" >= 0 AND "heldCents" >= 0
         AND "netCents" >= 0 AND "carriedCents" >= 0);
ALTER TABLE "RemittanceLine" ADD CONSTRAINT remittance_line_amounts
  CHECK ("requestedCents" >= 0 AND "appliedCents" >= 0);
ALTER TABLE "Invoice" ADD CONSTRAINT invoice_amounts
  CHECK ("exemptCents" >= 0 AND "stampDutyCents" >= 0 AND "totalCents" >= 0 AND "number" > 0);
ALTER TABLE "Refund" ADD CONSTRAINT refund_amounts
  CHECK ("premiumCents" >= 0 AND "feeCents" >= 0 AND "premiumCents" + "feeCents" > 0);
ALTER TABLE "NextOfferProposal" ADD CONSTRAINT next_offer_amounts
  CHECK ("premiumCents" > 0 AND "feeCents" >= 0);
ALTER TABLE "BrokerCommission" ADD CONSTRAINT broker_commission_amounts CHECK ("amountCents" >= 0);
ALTER TABLE "ConsumerWithdrawal" ADD CONSTRAINT withdrawal_amounts
  CHECK ("refundableCents" IS NULL OR "refundableCents" >= 0);
-- A credit note (series N) always points to the invoice it credits, and only then.
ALTER TABLE "Invoice" ADD CONSTRAINT invoice_credit_note
  CHECK (("series" = 'N') = ("creditedInvoiceId" IS NOT NULL));
-- One open proposal per request, one open case per request.
CREATE UNIQUE INDEX next_offer_one_open ON "NextOfferProposal" ("quoteRequestId")
  WHERE "status" = 'PROPOSED';
CREATE UNIQUE INDEX issuance_problem_one_open ON "IssuanceProblem" ("quoteRequestId")
  WHERE "status" = 'OPEN';
-- One suspension in force per agency.
CREATE UNIQUE INDEX agency_suspension_one_live ON "AgencySuspension" ("organizationId")
  WHERE "revokedAt" IS NULL;

-- Row level security, second line after the API's checks (rule 3). The system
-- writes; who reads is in each policy.

-- The requester (private user or broker) and the issuing agency.
ALTER TABLE "Policy" ENABLE ROW LEVEL SECURITY;
CREATE POLICY policy_read ON "Policy" FOR SELECT
  USING (app_owns_row("ownerUserId", "ownerOrganizationId") OR app_owns_row(NULL, "organizationId"));
CREATE POLICY policy_write ON "Policy" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
REVOKE DELETE, TRUNCATE ON TABLE "Policy" FROM astax_app;

ALTER TABLE "ConsumerWithdrawal" ENABLE ROW LEVEL SECURITY;
CREATE POLICY withdrawal_read ON "ConsumerWithdrawal" FOR SELECT
  USING (app_owns_row("ownerUserId", "ownerOrganizationId") OR app_owns_row(NULL, "organizationId"));
CREATE POLICY withdrawal_write ON "ConsumerWithdrawal" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
REVOKE DELETE, TRUNCATE ON TABLE "ConsumerWithdrawal" FROM astax_app;

-- The agency's own cases, penalties, suspensions and remittances; AstAx all.
ALTER TABLE "IssuanceProblem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY issuance_problem_read ON "IssuanceProblem" FOR SELECT
  USING (app_owns_row(NULL, "organizationId"));
CREATE POLICY issuance_problem_write ON "IssuanceProblem" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
REVOKE DELETE, TRUNCATE ON TABLE "IssuanceProblem" FROM astax_app;

ALTER TABLE "Penalty" ENABLE ROW LEVEL SECURITY;
CREATE POLICY penalty_read ON "Penalty" FOR SELECT
  USING (app_owns_row(NULL, "organizationId"));
CREATE POLICY penalty_write ON "Penalty" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
REVOKE DELETE, TRUNCATE ON TABLE "Penalty" FROM astax_app;

ALTER TABLE "AgencySuspension" ENABLE ROW LEVEL SECURITY;
CREATE POLICY agency_suspension_read ON "AgencySuspension" FOR SELECT
  USING (app_owns_row(NULL, "organizationId"));
CREATE POLICY agency_suspension_write ON "AgencySuspension" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
REVOKE DELETE, TRUNCATE ON TABLE "AgencySuspension" FROM astax_app;

ALTER TABLE "Remittance" ENABLE ROW LEVEL SECURITY;
CREATE POLICY remittance_read ON "Remittance" FOR SELECT
  USING (app_owns_row(NULL, "organizationId"));
CREATE POLICY remittance_write ON "Remittance" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
REVOKE DELETE, TRUNCATE ON TABLE "Remittance" FROM astax_app;

ALTER TABLE "RemittanceLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY remittance_line_read ON "RemittanceLine" FOR SELECT
  USING (app_owns_row(NULL, "organizationId"));
CREATE POLICY remittance_line_write ON "RemittanceLine" FOR INSERT WITH CHECK (app_is_system());
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "RemittanceLine" FROM astax_app;

-- The recipient of an invoice; the numbering only by the system.
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_read ON "Invoice" FOR SELECT
  USING (app_owns_row("ownerUserId", "ownerOrganizationId"));
CREATE POLICY invoice_write ON "Invoice" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
-- Invoices are never deleted (fiscal record); a credit note corrects them.
REVOKE DELETE, TRUNCATE ON TABLE "Invoice" FROM astax_app;

ALTER TABLE "InvoiceCounter" ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_counter_all ON "InvoiceCounter" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
REVOKE DELETE, TRUNCATE ON TABLE "InvoiceCounter" FROM astax_app;

-- The requester's own refunds and proposals.
ALTER TABLE "Refund" ENABLE ROW LEVEL SECURITY;
CREATE POLICY refund_read ON "Refund" FOR SELECT
  USING (app_owns_row("ownerUserId", "ownerOrganizationId"));
CREATE POLICY refund_write ON "Refund" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
REVOKE DELETE, TRUNCATE ON TABLE "Refund" FROM astax_app;

ALTER TABLE "NextOfferProposal" ENABLE ROW LEVEL SECURITY;
CREATE POLICY next_offer_read ON "NextOfferProposal" FOR SELECT
  USING (app_owns_row("ownerUserId", "ownerOrganizationId"));
CREATE POLICY next_offer_write ON "NextOfferProposal" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
REVOKE DELETE, TRUNCATE ON TABLE "NextOfferProposal" FROM astax_app;

-- The broker's own quotas.
ALTER TABLE "BrokerCommission" ENABLE ROW LEVEL SECURITY;
CREATE POLICY broker_commission_read ON "BrokerCommission" FOR SELECT
  USING (app_owns_row(NULL, "organizationId"));
CREATE POLICY broker_commission_write ON "BrokerCommission" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
REVOKE DELETE, TRUNCATE ON TABLE "BrokerCommission" FROM astax_app;

-- Only through the API (survey by its token) or the back office.
ALTER TABLE "PostSaleSurvey" ENABLE ROW LEVEL SECURITY;
CREATE POLICY survey_all ON "PostSaleSurvey" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
CREATE POLICY survey_staff_read ON "PostSaleSurvey" FOR SELECT USING (app_is_privileged());
REVOKE DELETE, TRUNCATE ON TABLE "PostSaleSurvey" FROM astax_app;

ALTER TABLE "Flag" ENABLE ROW LEVEL SECURITY;
CREATE POLICY flag_read ON "Flag" FOR SELECT USING (app_is_privileged());
CREATE POLICY flag_write ON "Flag" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
REVOKE DELETE, TRUNCATE ON TABLE "Flag" FROM astax_app;
