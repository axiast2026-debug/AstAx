-- Phase 7: a dispatch blocks the same event only for a short window (the
-- retries of a step, a webhook received twice), not a legitimate repetition
-- (a second request for documents on the same request).
DROP INDEX "NotificationDispatch_once_key";
CREATE INDEX "NotificationDispatch_lookup_idx" ON "NotificationDispatch" ("eventKey", "dedupeKey", "channel", "userId", "createdAt");
