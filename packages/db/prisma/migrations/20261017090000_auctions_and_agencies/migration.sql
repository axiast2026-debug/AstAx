-- Phase 3: companies, mandates, filters and capacity of the agencies; auctions,
-- invitations, claims, sealed offers and rankings (docs/modello-dati.md,
-- docs/busta-chiusa.md).

-- CreateEnum
CREATE TYPE "MandateSource" AS ENUM ('RUI', 'MANUAL');

-- CreateEnum
CREATE TYPE "RequestDistribution" AS ENUM ('ALL_USERS', 'BY_MEMBER_FILTERS');

-- CreateEnum
CREATE TYPE "AuctionKind" AS ENUM ('MAIN', 'REOPEN', 'RECONFIRMATION');

-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('OPEN', 'CLOSING', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvitationSource" AS ENUM ('AUTO', 'TOP_UP', 'BACK_OFFICE', 'RENEWAL', 'REOPEN', 'RECONFIRMATION');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('INVITED', 'VIEWED', 'CLAIMED', 'OFFERED', 'DECLINED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('SUBMITTED', 'WITHDRAWN', 'EXCLUDED', 'AWAITING_CUSTOMER', 'WINNING', 'ISSUED', 'NOT_CHOSEN', 'EXPIRED', 'MISSED_ISSUANCE');

-- CreateTable
CREATE TABLE "InsuranceCompany" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ivassCode" TEXT,
    "group" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsuranceCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyMandate" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "source" "MandateSource" NOT NULL,
    "verifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyMandate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceProduct" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsuranceProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyFilter" (
    "organizationId" UUID NOT NULL,
    "criteria" JSONB NOT NULL,
    "updatedByUserId" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyFilter_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "MemberFilter" (
    "membershipId" UUID NOT NULL,
    "criteria" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberFilter_pkey" PRIMARY KEY ("membershipId")
);

-- CreateTable
CREATE TABLE "AgencyCapacity" (
    "organizationId" UUID NOT NULL,
    "dailyMax" INTEGER,
    "receptionHours" JSONB NOT NULL,
    "pausedUntil" TIMESTAMPTZ(3),
    "distribution" "RequestDistribution" NOT NULL DEFAULT 'ALL_USERS',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyCapacity_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "Auction" (
    "id" UUID NOT NULL,
    "quoteRequestId" UUID NOT NULL,
    "ownerUserId" UUID,
    "ownerOrganizationId" UUID,
    "kind" "AuctionKind" NOT NULL,
    "round" INTEGER NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMPTZ(3) NOT NULL,
    "scheduledCloseAt" TIMESTAMPTZ(3) NOT NULL,
    "originalCloseAt" TIMESTAMPTZ(3) NOT NULL,
    "closedAt" TIMESTAMPTZ(3),
    "minGuaranteeDate" DATE NOT NULL,
    "durationHours" INTEGER NOT NULL,
    "settingsSnapshot" JSONB NOT NULL,
    "publicKey" TEXT NOT NULL,
    "wrappedPrivateKey" TEXT NOT NULL,
    "kmsKeyRef" TEXT NOT NULL,
    "extensions" JSONB NOT NULL DEFAULT '[]',
    "cancelReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "auctionId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "source" "InvitationSource" NOT NULL,
    "invitedAt" TIMESTAMPTZ(3) NOT NULL,
    "invitedByUserId" UUID,
    "firstViewedAt" TIMESTAMPTZ(3),
    "status" "InvitationStatus" NOT NULL DEFAULT 'INVITED',
    "declineReason" TEXT,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvitationExclusion" (
    "id" UUID NOT NULL,
    "quoteRequestId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "byUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvitationExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" UUID NOT NULL,
    "auctionId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "claimedAt" TIMESTAMPTZ(3) NOT NULL,
    "releasedAt" TIMESTAMPTZ(3),
    "releasedByUserId" UUID,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" UUID NOT NULL,
    "auctionId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMPTZ(3) NOT NULL,
    "lastChangedAt" TIMESTAMPTZ(3) NOT NULL,
    "withdrawnAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "sealedPayload" TEXT NOT NULL,
    "sealedPdfKey" TEXT,
    "sealedPdfDataKey" TEXT,
    "ownerCopy" TEXT NOT NULL,
    "annualGrossPremiumCents" INTEGER,
    "companyId" UUID,
    "productId" UUID,
    "coverage" JSONB,
    "guaranteeUntil" DATE,
    "notes" TEXT,
    "pdfDocumentId" UUID,
    "exclusionReason" TEXT,
    "reviewFlags" JSONB,
    "rank" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferVersion" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "sealedPayload" TEXT NOT NULL,
    "sealedPdfKey" TEXT,
    "sealedPdfDataKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ranking" (
    "id" UUID NOT NULL,
    "quoteRequestId" UUID NOT NULL,
    "auctionId" UUID NOT NULL,
    "entries" JSONB NOT NULL,
    "validCount" INTEGER NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ranking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceCompany_name_key" ON "InsuranceCompany"("name");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceCompany_ivassCode_key" ON "InsuranceCompany"("ivassCode");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyMandate_organizationId_companyId_key" ON "AgencyMandate"("organizationId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceProduct_organizationId_companyId_name_version_key" ON "InsuranceProduct"("organizationId", "companyId", "name", "version");

-- CreateIndex
CREATE INDEX "Auction_status_scheduledCloseAt_idx" ON "Auction"("status", "scheduledCloseAt");

-- CreateIndex
CREATE UNIQUE INDEX "Auction_quoteRequestId_round_key" ON "Auction"("quoteRequestId", "round");

-- CreateIndex
CREATE INDEX "Invitation_organizationId_invitedAt_idx" ON "Invitation"("organizationId", "invitedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_auctionId_organizationId_key" ON "Invitation"("auctionId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "InvitationExclusion_quoteRequestId_organizationId_key" ON "InvitationExclusion"("quoteRequestId", "organizationId");

-- CreateIndex
CREATE INDEX "Claim_auctionId_idx" ON "Claim"("auctionId");

-- CreateIndex
CREATE INDEX "Offer_auctionId_idx" ON "Offer"("auctionId");

-- CreateIndex
CREATE INDEX "Offer_organizationId_status_idx" ON "Offer"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OfferVersion_offerId_version_key" ON "OfferVersion"("offerId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Ranking_auctionId_key" ON "Ranking"("auctionId");

-- AddForeignKey
ALTER TABLE "AgencyMandate" ADD CONSTRAINT "AgencyMandate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "InsuranceCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceProduct" ADD CONSTRAINT "InsuranceProduct_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "InsuranceCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferVersion" ADD CONSTRAINT "OfferVersion_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Security (hand written)
-- ---------------------------------------------------------------------------

-- OFF-01, OFF-02, OFF-03: one active claim and one active offer per agency
-- and per natural person (one user) in each round.
CREATE UNIQUE INDEX claim_one_active_per_agency ON "Claim" ("auctionId", "organizationId")
  WHERE "releasedAt" IS NULL;
CREATE UNIQUE INDEX claim_one_active_per_person ON "Claim" ("auctionId", "userId")
  WHERE "releasedAt" IS NULL;
CREATE UNIQUE INDEX offer_one_per_agency ON "Offer" ("auctionId", "organizationId")
  WHERE "status" <> 'WITHDRAWN';
CREATE UNIQUE INDEX offer_one_per_person ON "Offer" ("auctionId", "userId")
  WHERE "status" <> 'WITHDRAWN';
CREATE INDEX agency_filter_criteria ON "AgencyFilter" USING GIN ("criteria");

CREATE TRIGGER set_updated_at BEFORE UPDATE ON "InsuranceCompany" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "AgencyFilter" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "MemberFilter" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "AgencyCapacity" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "Auction" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "Offer" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Sealed versions and rankings are only added.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "OfferVersion" FROM astax_app;
REVOKE DELETE, TRUNCATE ON TABLE "Offer" FROM astax_app;
REVOKE DELETE, TRUNCATE ON TABLE "Auction" FROM astax_app;
REVOKE DELETE, TRUNCATE ON TABLE "Invitation" FROM astax_app;

-- Companies: readable by everyone, changed by the administrator.
ALTER TABLE "InsuranceCompany" ENABLE ROW LEVEL SECURITY;
CREATE POLICY insurance_company_select ON "InsuranceCompany" FOR SELECT USING (true);
CREATE POLICY insurance_company_write ON "InsuranceCompany" FOR ALL
  USING (app_is_admin()) WITH CHECK (app_is_admin());

-- Mandates are verified by AstAx (RUI or by hand); the agency reads its own.
ALTER TABLE "AgencyMandate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY agency_mandate_select ON "AgencyMandate" FOR SELECT
  USING (app_is_privileged() OR "organizationId" = app_current_org_id());
CREATE POLICY agency_mandate_write ON "AgencyMandate" FOR ALL
  USING (app_is_privileged()) WITH CHECK (app_is_privileged());

-- Products, filters and capacity: the agency's own, and AstAx.
ALTER TABLE "InsuranceProduct" ENABLE ROW LEVEL SECURITY;
CREATE POLICY insurance_product_all ON "InsuranceProduct" FOR ALL
  USING (app_is_privileged() OR "organizationId" = app_current_org_id())
  WITH CHECK (app_is_privileged() OR "organizationId" = app_current_org_id());

ALTER TABLE "AgencyFilter" ENABLE ROW LEVEL SECURITY;
CREATE POLICY agency_filter_all ON "AgencyFilter" FOR ALL
  USING (app_is_privileged() OR "organizationId" = app_current_org_id())
  WITH CHECK (app_is_privileged() OR "organizationId" = app_current_org_id());

ALTER TABLE "AgencyCapacity" ENABLE ROW LEVEL SECURITY;
CREATE POLICY agency_capacity_all ON "AgencyCapacity" FOR ALL
  USING (app_is_privileged() OR "organizationId" = app_current_org_id())
  WITH CHECK (app_is_privileged() OR "organizationId" = app_current_org_id());

ALTER TABLE "MemberFilter" ENABLE ROW LEVEL SECURITY;
CREATE POLICY member_filter_all ON "MemberFilter" FOR ALL
  USING (app_is_privileged() OR EXISTS (
    SELECT 1 FROM "Membership" m
    WHERE m."id" = "MemberFilter"."membershipId" AND m."organizationId" = app_current_org_id()))
  WITH CHECK (app_is_privileged() OR EXISTS (
    SELECT 1 FROM "Membership" m
    WHERE m."id" = "MemberFilter"."membershipId" AND m."organizationId" = app_current_org_id()));

-- Auctions and invitations are opened, changed and closed only by the worker
-- (system context). The requester sees their auctions; an agency the auctions
-- it is invited to; AstAx all of them.
ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitation_select ON "Invitation" FOR SELECT
  USING (app_is_privileged() OR "organizationId" = app_current_org_id());
CREATE POLICY invitation_insert ON "Invitation" FOR INSERT WITH CHECK (app_is_system());
CREATE POLICY invitation_update ON "Invitation" FOR UPDATE
  USING (app_is_system() OR "organizationId" = app_current_org_id())
  WITH CHECK (app_is_system() OR "organizationId" = app_current_org_id());

-- The agency changes only how it handles the invitation.
CREATE FUNCTION invitation_guard_update() RETURNS trigger
  LANGUAGE plpgsql AS
$$ BEGIN
  IF app_is_system() THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW) - 'status' - 'firstViewedAt' - 'declineReason')
     IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'firstViewedAt' - 'declineReason') THEN
    RAISE EXCEPTION 'Invitation changed only by the system' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invitation_guard_update BEFORE UPDATE ON "Invitation"
  FOR EACH ROW EXECUTE FUNCTION invitation_guard_update();

ALTER TABLE "Auction" ENABLE ROW LEVEL SECURITY;
CREATE POLICY auction_select ON "Auction" FOR SELECT USING (
  app_owns_row("ownerUserId", "ownerOrganizationId")
  OR EXISTS (
    SELECT 1 FROM "Invitation" i
    WHERE i."auctionId" = "Auction"."id" AND i."organizationId" = app_current_org_id())
);
CREATE POLICY auction_insert ON "Auction" FOR INSERT WITH CHECK (app_is_system());
CREATE POLICY auction_update ON "Auction" FOR UPDATE
  USING (app_is_system()) WITH CHECK (app_is_system());

ALTER TABLE "InvitationExclusion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitation_exclusion_all ON "InvitationExclusion" FOR ALL
  USING (app_is_privileged()) WITH CHECK (app_is_privileged());

-- Claims: by a user for their own agency (OFF-03).
ALTER TABLE "Claim" ENABLE ROW LEVEL SECURITY;
CREATE POLICY claim_select ON "Claim" FOR SELECT
  USING (app_is_privileged() OR "organizationId" = app_current_org_id());
CREATE POLICY claim_insert ON "Claim" FOR INSERT WITH CHECK (
  app_is_system()
  OR ("organizationId" = app_current_org_id() AND "userId" = app_current_user_id())
);
CREATE POLICY claim_update ON "Claim" FOR UPDATE
  USING (app_is_system() OR "organizationId" = app_current_org_id())
  WITH CHECK (app_is_system() OR "organizationId" = app_current_org_id());

-- Offers (BC-01, BC-02, BC-05): a user of the agency writes only sealed values,
-- for its own agency and only while the auction is open; the plain values are
-- written by the closing activity of the worker. AstAx staff never writes one.
ALTER TABLE "Offer" ENABLE ROW LEVEL SECURITY;
CREATE POLICY offer_select ON "Offer" FOR SELECT
  USING (app_is_system() OR "organizationId" = app_current_org_id()
         OR (app_is_privileged() AND "status" <> 'SUBMITTED'));
CREATE POLICY offer_insert ON "Offer" FOR INSERT WITH CHECK (
  app_is_system()
  OR ("organizationId" = app_current_org_id() AND "userId" = app_current_user_id()
      AND NOT app_is_privileged())
);
CREATE POLICY offer_update ON "Offer" FOR UPDATE
  USING (app_is_system() OR ("organizationId" = app_current_org_id() AND NOT app_is_privileged()))
  WITH CHECK (app_is_system() OR ("organizationId" = app_current_org_id() AND NOT app_is_privileged()));

CREATE FUNCTION offer_guard() RETURNS trigger
  LANGUAGE plpgsql AS
$$ BEGIN
  IF app_is_system() THEN RETURN NEW; END IF;
  IF NEW."annualGrossPremiumCents" IS NOT NULL OR NEW."companyId" IS NOT NULL
     OR NEW."productId" IS NOT NULL OR NEW."coverage" IS NOT NULL
     OR NEW."guaranteeUntil" IS NOT NULL OR NEW."notes" IS NOT NULL
     OR NEW."pdfDocumentId" IS NOT NULL OR NEW."rank" IS NOT NULL THEN
    RAISE EXCEPTION 'Plain offer values are written only at the closing (BC-02)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."status" NOT IN ('SUBMITTED', 'WITHDRAWN') THEN
    RAISE EXCEPTION 'Offer status reserved to the system' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Auction" a WHERE a."id" = NEW."auctionId" AND a."status" = 'OPEN') THEN
    RAISE EXCEPTION 'The auction is not open (BC-05)' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER offer_guard BEFORE INSERT OR UPDATE ON "Offer"
  FOR EACH ROW EXECUTE FUNCTION offer_guard();

ALTER TABLE "OfferVersion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY offer_version_select ON "OfferVersion" FOR SELECT
  USING (app_is_system() OR "organizationId" = app_current_org_id());
CREATE POLICY offer_version_insert ON "OfferVersion" FOR INSERT WITH CHECK (
  app_is_system() OR ("organizationId" = app_current_org_id() AND NOT app_is_privileged())
);

-- Rankings: written at the closing, published to the agencies by CLA-02 (phase 5).
ALTER TABLE "Ranking" ENABLE ROW LEVEL SECURITY;
CREATE POLICY ranking_all ON "Ranking" FOR ALL
  USING (app_is_privileged()) WITH CHECK (app_is_system());
