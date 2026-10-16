-- ADR 0005: every use of a KMS key, the stand-in for CloudTrail (BC-03).

-- CreateTable
CREATE TABLE "KmsEvent" (
    "seq" BIGSERIAL NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "keyId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "process" TEXT NOT NULL,

    CONSTRAINT "KmsEvent_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE INDEX "KmsEvent_keyId_at_idx" ON "KmsEvent"("keyId", "at");

-- ---------------------------------------------------------------------------
-- Security (hand written)
-- ---------------------------------------------------------------------------

-- Rows are only added, by the processes that use the keys (system context);
-- AstAx staff reads them, for the proof towards the agencies.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "KmsEvent" FROM astax_app;
GRANT USAGE, SELECT ON SEQUENCE "KmsEvent_seq_seq" TO astax_app;
ALTER TABLE "KmsEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY kms_event_insert ON "KmsEvent" FOR INSERT WITH CHECK (app_is_system());
CREATE POLICY kms_event_select ON "KmsEvent" FOR SELECT USING (app_is_privileged());
