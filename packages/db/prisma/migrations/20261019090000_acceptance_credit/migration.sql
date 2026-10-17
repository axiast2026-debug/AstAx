-- EMI-04: a second offer or a new price charges or refunds only the difference.
ALTER TABLE "Acceptance" ADD COLUMN "creditPremiumCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Acceptance" ADD COLUMN "creditFeeCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Acceptance" ADD CONSTRAINT acceptance_credit
  CHECK ("creditPremiumCents" >= 0 AND "creditFeeCents" >= 0);
