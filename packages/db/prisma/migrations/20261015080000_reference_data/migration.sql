-- CreateTable
CREATE TABLE "Municipality" (
    "istatCode" TEXT NOT NULL,
    "cadastralCode" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Municipality_pkey" PRIMARY KEY ("istatCode")
);

-- CreateTable
CREATE TABLE "ExclusionRule" (
    "code" TEXT NOT NULL,
    "condition" JSONB,
    "blockingInWizard" BOOLEAN NOT NULL,
    "messageIt" TEXT NOT NULL,
    "messageSq" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExclusionRule_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "CoveragePackage" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoveragePackage_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "CoveragePackageVersion" (
    "id" UUID NOT NULL,
    "packageCode" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "requirements" JSONB NOT NULL,
    "customerTextIt" TEXT NOT NULL,
    "validFrom" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoveragePackageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Municipality_cadastralCode_key" ON "Municipality"("cadastralCode");

-- CreateIndex
CREATE INDEX "Municipality_name_idx" ON "Municipality"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CoveragePackageVersion_packageCode_version_key" ON "CoveragePackageVersion"("packageCode", "version");

-- AddForeignKey
ALTER TABLE "CoveragePackageVersion" ADD CONSTRAINT "CoveragePackageVersion_packageCode_fkey" FOREIGN KEY ("packageCode") REFERENCES "CoveragePackage"("code") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Security (hand written): reference data readable by everyone, changed by
-- staff and jobs only, like ListValue. Package versions are only ever added.
-- ---------------------------------------------------------------------------

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "CoveragePackageVersion" FROM astax_app;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON "Municipality" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "ExclusionRule" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "CoveragePackage" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE "Municipality" ENABLE ROW LEVEL SECURITY;
CREATE POLICY municipality_select ON "Municipality" FOR SELECT USING (true);
CREATE POLICY municipality_write ON "Municipality" FOR ALL
  USING (app_is_privileged()) WITH CHECK (app_is_privileged());

ALTER TABLE "ExclusionRule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY exclusion_rule_select ON "ExclusionRule" FOR SELECT USING (true);
CREATE POLICY exclusion_rule_write ON "ExclusionRule" FOR ALL
  USING (app_is_privileged()) WITH CHECK (app_is_privileged());

ALTER TABLE "CoveragePackage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY coverage_package_select ON "CoveragePackage" FOR SELECT USING (true);
CREATE POLICY coverage_package_write ON "CoveragePackage" FOR ALL
  USING (app_is_privileged()) WITH CHECK (app_is_privileged());

ALTER TABLE "CoveragePackageVersion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY coverage_package_version_select ON "CoveragePackageVersion" FOR SELECT USING (true);
CREATE POLICY coverage_package_version_insert ON "CoveragePackageVersion" FOR INSERT
  WITH CHECK (app_is_privileged());
