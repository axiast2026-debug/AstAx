-- Phase 7 (spec 07 «Pacchetti e casi esclusi», «Elenchi e festività»):
-- excluded cases with versions, package versions with reason, author and the
-- Albanian text, holidays with the Albanian name.

ALTER TABLE "ExclusionRule" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "ExclusionRuleVersion" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "condition" JSONB,
  "blockingInWizard" BOOLEAN NOT NULL,
  "messageIt" TEXT NOT NULL,
  "messageSq" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL,
  "reason" TEXT,
  "changedByUserId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExclusionRuleVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExclusionRuleVersion_code_version_key" ON "ExclusionRuleVersion" ("code", "version");

-- The first version of the cases already there.
INSERT INTO "ExclusionRuleVersion" ("id", "code", "version", "condition", "blockingInWizard", "messageIt", "messageSq", "active", "createdAt")
SELECT gen_random_uuid(), "code", 1, "condition", "blockingInWizard", "messageIt", "messageSq", "active", "createdAt"
FROM "ExclusionRule";

ALTER TABLE "ExclusionRuleVersion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY exclusion_rule_version_select ON "ExclusionRuleVersion" FOR SELECT USING (true);
CREATE POLICY exclusion_rule_version_insert ON "ExclusionRuleVersion" FOR INSERT
  WITH CHECK (app_is_privileged());

ALTER TABLE "CoveragePackageVersion" ADD COLUMN "customerTextSq" TEXT;
ALTER TABLE "CoveragePackageVersion" ADD COLUMN "reason" TEXT;
ALTER TABLE "CoveragePackageVersion" ADD COLUMN "changedByUserId" UUID;

ALTER TABLE "Holiday" ADD COLUMN "nameSq" TEXT;
