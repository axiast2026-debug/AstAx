-- Decision 24: each policy of a broker's customer is billed in one invoice B.
ALTER TABLE "Policy" ADD COLUMN "brokerInvoiceId" UUID;
CREATE INDEX "Policy_brokerInvoiceId_idx" ON "Policy" ("brokerInvoiceId");
