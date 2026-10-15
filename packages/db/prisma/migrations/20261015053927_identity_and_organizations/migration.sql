-- CreateEnum
CREATE TYPE "UserKind" AS ENUM ('PRIVATE', 'PROFESSIONAL', 'STAFF');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('it', 'sq');

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('AGENCY', 'BROKER', 'ASTAX');

-- CreateEnum
CREATE TYPE "RuiSection" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'SUPERVISOR', 'OPERATOR', 'BO_VERIFIER', 'BO_SUPPORT', 'BO_ACCOUNTING', 'BO_SUPERVISOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "LegalAudience" AS ENUM ('PRIVATE', 'BROKER', 'AGENCY', 'SUB_AGENT', 'STAFF', 'ALL');

-- CreateEnum
CREATE TYPE "LegalMoment" AS ENUM ('FIRST_ACCESS', 'REGISTRATION', 'ONBOARDING', 'BEFORE_REQUEST', 'ACCEPTANCE', 'FIRST_SIGNATURE');

-- CreateEnum
CREATE TYPE "LegalVersionStatus" AS ENUM ('DRAFT', 'VALIDATED');

-- CreateEnum
CREATE TYPE "LegalAcceptanceMethod" AS ENUM ('CLICK', 'OTP', 'FEA', 'UPLOAD_BY_BROKER');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "keycloakId" TEXT,
    "kind" "UserKind" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "emailEnc" TEXT,
    "emailHash" TEXT,
    "phoneEnc" TEXT,
    "phoneHash" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'it',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "personId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "type" "OrganizationType" NOT NULL,
    "legalName" TEXT NOT NULL,
    "vatNumber" TEXT,
    "fiscalCodeEnc" TEXT,
    "fiscalCodeHash" TEXT,
    "ruiNumber" TEXT,
    "ruiSection" "RuiSection",
    "pec" TEXT,
    "address" JSONB,
    "ibanEnc" TEXT,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'PENDING',
    "statusReason" TEXT,
    "profInsuranceExpiresOn" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "ruiNumberE" TEXT,
    "ruiVerifiedAt" TIMESTAMPTZ(3),
    "canIssue" BOOLEAN NOT NULL DEFAULT false,
    "canSeeColleagueOffers" BOOLEAN NOT NULL DEFAULT false,
    "canSeeAccounting" BOOLEAN NOT NULL DEFAULT false,
    "seesAllClients" BOOLEAN NOT NULL DEFAULT false,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamInvite" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "emailHash" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "canIssue" BOOLEAN NOT NULL DEFAULT false,
    "canSeeColleagueOffers" BOOLEAN NOT NULL DEFAULT false,
    "canSeeAccounting" BOOLEAN NOT NULL DEFAULT false,
    "seesAllClients" BOOLEAN NOT NULL DEFAULT false,
    "tokenHash" TEXT NOT NULL,
    "invitedByUserId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalDocument" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "audiences" "LegalAudience"[],
    "moment" "LegalMoment" NOT NULL,
    "channel" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalDocumentVersion" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "contentMd" TEXT NOT NULL,
    "status" "LegalVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "validatedByUserId" UUID,
    "validatedAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalAcceptance" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "customerId" UUID,
    "versionId" UUID NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "method" "LegalAcceptanceMethod" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "validFrom" TIMESTAMPTZ(3) NOT NULL,
    "changedByUserId" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListValue" (
    "id" UUID NOT NULL,
    "listKey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "labelIt" TEXT NOT NULL,
    "labelSq" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "seq" BIGSERIAL NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "actorUserId" UUID,
    "actorMembershipId" UUID,
    "actorOrganizationId" UUID,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "DomainEvent" (
    "id" UUID NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "actorUserId" UUID,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL,
    "lastErrorCode" TEXT,
    "deliveredAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_keycloakId_key" ON "User"("keycloakId");

-- CreateIndex
CREATE UNIQUE INDEX "User_emailHash_key" ON "User"("emailHash");

-- CreateIndex
CREATE INDEX "User_phoneHash_idx" ON "User"("phoneHash");

-- CreateIndex
CREATE INDEX "Organization_fiscalCodeHash_idx" ON "Organization"("fiscalCodeHash");

-- CreateIndex
CREATE INDEX "Organization_ruiNumber_idx" ON "Organization"("ruiNumber");

-- CreateIndex
CREATE INDEX "Membership_organizationId_idx" ON "Membership"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_organizationId_key" ON "Membership"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamInvite_tokenHash_key" ON "TeamInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "TeamInvite_organizationId_idx" ON "TeamInvite"("organizationId");

-- CreateIndex
CREATE INDEX "TeamInvite_emailHash_idx" ON "TeamInvite"("emailHash");

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocument_key_key" ON "LegalDocument"("key");

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocumentVersion_documentId_number_key" ON "LegalDocumentVersion"("documentId", "number");

-- CreateIndex
CREATE INDEX "LegalAcceptance_userId_idx" ON "LegalAcceptance"("userId");

-- CreateIndex
CREATE INDEX "LegalAcceptance_customerId_idx" ON "LegalAcceptance"("customerId");

-- CreateIndex
CREATE INDEX "LegalAcceptance_versionId_idx" ON "LegalAcceptance"("versionId");

-- CreateIndex
CREATE INDEX "Setting_key_validFrom_idx" ON "Setting"("key", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_version_key" ON "Setting"("key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ListValue_listKey_code_key" ON "ListValue"("listKey", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_prevHash_key" ON "AuditLog"("prevHash");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_hash_key" ON "AuditLog"("hash");

-- CreateIndex
CREATE INDEX "AuditLog_actorOrganizationId_at_idx" ON "AuditLog"("actorOrganizationId", "at");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_action_at_idx" ON "AuditLog"("action", "at");

-- CreateIndex
CREATE INDEX "DomainEvent_aggregateType_aggregateId_at_idx" ON "DomainEvent"("aggregateType", "aggregateId", "at");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_nextAttemptAt_idx" ON "OutboxEvent"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalDocumentVersion" ADD CONSTRAINT "LegalDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LegalDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LegalDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
