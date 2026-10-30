-- ADR 0028: the logo (S3 key under public/companies/) and the website of a company.
-- Both nullable, nothing else depends on them. To undo:
--   ALTER TABLE "InsuranceCompany" DROP COLUMN "logoKey", DROP COLUMN "website";
ALTER TABLE "InsuranceCompany" ADD COLUMN "logoKey" TEXT,
ADD COLUMN "website" TEXT;
