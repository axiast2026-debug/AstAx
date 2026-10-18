-- Phase 8: the emails, SMS and pushes are written in the same transaction as
-- the change that causes them, then sent; the worker sends again what was left
-- behind (a process stopped in between, a provider down). The content (address,
-- number, text) is encrypted and emptied once sent (rule 8).
CREATE TYPE "MessageChannel" AS ENUM ('EMAIL', 'SMS', 'PUSH');
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "MessageOutbox" (
  "id" UUID NOT NULL,
  "channel" "MessageChannel" NOT NULL,
  "eventKey" TEXT NOT NULL,
  "ids" JSONB NOT NULL DEFAULT '{}',
  "contentEnc" TEXT NOT NULL,
  "status" "MessageStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL,
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL,
  "sentAt" TIMESTAMPTZ(3),
  CONSTRAINT "MessageOutbox_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MessageOutbox_status_nextAttemptAt_idx" ON "MessageOutbox" ("status", "nextAttemptAt");

ALTER TABLE "MessageOutbox" ENABLE ROW LEVEL SECURITY;
CREATE POLICY message_outbox_select ON "MessageOutbox" FOR SELECT USING (app_is_privileged());
CREATE POLICY message_outbox_write ON "MessageOutbox" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
