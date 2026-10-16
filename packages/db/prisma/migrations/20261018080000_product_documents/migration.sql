-- Decision 17, LEG-05: the information set of each product of the agency
-- library (DIP, additional DIP, conditions), stored as documents owned by the
-- agency. The latest document of each kind is the current one; older ones stay.
ALTER TYPE "DocumentKind" ADD VALUE 'PRODUCT_DIP';
ALTER TYPE "DocumentKind" ADD VALUE 'PRODUCT_DIP_ADDITIONAL';
ALTER TYPE "DocumentKind" ADD VALUE 'PRODUCT_CONDITIONS';

ALTER TABLE "Document" ADD COLUMN "productId" UUID;
CREATE INDEX "Document_productId_idx" ON "Document"("productId");
ALTER TABLE "Document" ADD CONSTRAINT "Document_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "InsuranceProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A product document belongs to an organization and to no request.
ALTER TABLE "Document" ADD CONSTRAINT document_product_owner
  CHECK ("productId" IS NULL OR ("ownerOrganizationId" IS NOT NULL AND "quoteRequestId" IS NULL));
