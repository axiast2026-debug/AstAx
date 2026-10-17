-- Decision 24: the policies billed by the invoices B issued before the column
-- existed (one per broker and month, then): the policies of that broker issued
-- in that month, in Rome.
UPDATE "Policy" p
SET "brokerInvoiceId" = i."id"
FROM "Invoice" i
WHERE i."series" = 'B'
  AND i."creditedInvoiceId" IS NULL
  AND i."period" IS NOT NULL
  AND p."ownerOrganizationId" = i."ownerOrganizationId"
  AND p."brokerInvoiceId" IS NULL
  AND to_char(p."issuedAt" AT TIME ZONE 'Europe/Rome', 'YYYY-MM') = i."period";

ALTER TABLE "Policy" ADD CONSTRAINT "Policy_brokerInvoiceId_fkey"
  FOREIGN KEY ("brokerInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
