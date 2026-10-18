-- Phase 8: where a periodic job of the worker has got to (e.g. the time of the
-- last Keycloak login event copied into the audit log). Only the system writes.
CREATE TABLE "JobCursor" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "JobCursor_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "JobCursor" ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_cursor_select ON "JobCursor" FOR SELECT USING (app_is_privileged());
CREATE POLICY job_cursor_write ON "JobCursor" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
