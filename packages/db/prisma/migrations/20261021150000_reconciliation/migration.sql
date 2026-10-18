-- Phase 7: reconciliation of the separate account with the bank statement
-- (CSV or camt.053), the queue of the lines without a match.

CREATE TYPE "StatementLineStatus" AS ENUM ('MATCHED', 'UNMATCHED', 'IGNORED');

CREATE TABLE "BankStatement" (
  "id" UUID NOT NULL,
  "format" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "lineCount" INTEGER NOT NULL,
  "importedByUserId" UUID NOT NULL,
  "importedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BankStatement_sha256_key" ON "BankStatement" ("sha256");

CREATE TABLE "BankStatementLine" (
  "id" UUID NOT NULL,
  "statementId" UUID NOT NULL,
  "bookingDate" DATE NOT NULL,
  "valueDate" DATE,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "counterparty" TEXT,
  "description" TEXT NOT NULL,
  "reference" TEXT,
  "status" "StatementLineStatus" NOT NULL DEFAULT 'UNMATCHED',
  "paymentId" UUID,
  "matchedBy" TEXT,
  "decidedByUserId" UUID,
  "note" TEXT,
  "decidedAt" TIMESTAMPTZ(3),
  CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BankStatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BankStatementLine_paymentId_key" ON "BankStatementLine" ("paymentId");
CREATE INDEX "BankStatementLine_status_idx" ON "BankStatementLine" ("status");
CREATE INDEX "BankStatementLine_bookingDate_idx" ON "BankStatementLine" ("bookingDate");

-- The company's account: AstAx staff only.
ALTER TABLE "BankStatement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY bank_statement_select ON "BankStatement" FOR SELECT USING (app_is_privileged());
CREATE POLICY bank_statement_insert ON "BankStatement" FOR INSERT WITH CHECK (app_is_privileged());
ALTER TABLE "BankStatementLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY bank_statement_line_select ON "BankStatementLine" FOR SELECT USING (app_is_privileged());
CREATE POLICY bank_statement_line_write ON "BankStatementLine" FOR ALL
  USING (app_is_privileged()) WITH CHECK (app_is_privileged());
