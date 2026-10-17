-- OFF-09, decision 16: the check of each offer's PDF quote after the closing.
CREATE TYPE "QuoteCheckResult" AS ENUM ('MATCH', 'MISMATCH', 'UNREADABLE');
CREATE TYPE "QuoteCheckDecision" AS ENUM ('EXCLUDED', 'KEPT');

CREATE TABLE "OfferQuoteCheck" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "quoteRequestId" UUID NOT NULL,
    "checkedAt" TIMESTAMPTZ(3) NOT NULL,
    "result" "QuoteCheckResult" NOT NULL,
    "differences" JSONB NOT NULL DEFAULT '[]',
    "readerModel" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "decision" "QuoteCheckDecision",
    "decidedAt" TIMESTAMPTZ(3),
    "decidedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferQuoteCheck_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OfferQuoteCheck_offerId_key" ON "OfferQuoteCheck"("offerId");
CREATE INDEX "OfferQuoteCheck_result_decision_idx" ON "OfferQuoteCheck"("result", "decision");
ALTER TABLE "OfferQuoteCheck" ADD CONSTRAINT "OfferQuoteCheck_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only AstAx reads and writes the checks (the worker as a system step, the
-- back office after the closing); agencies and requesters never see them.
ALTER TABLE "OfferQuoteCheck" ENABLE ROW LEVEL SECURITY;
CREATE POLICY offer_quote_check_all ON "OfferQuoteCheck" FOR ALL
  USING (app_is_privileged()) WITH CHECK (app_is_privileged());
REVOKE DELETE, TRUNCATE ON TABLE "OfferQuoteCheck" FROM astax_app;
