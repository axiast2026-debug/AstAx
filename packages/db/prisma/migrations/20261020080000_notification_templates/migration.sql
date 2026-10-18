-- Phase 7: the texts of the notifications in the database, with versions;
-- each user's choices per event and channel; Web Push subscriptions; and a
-- record of what was sent, so the same event never reaches a user twice.

CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'PUSH');

CREATE TABLE "NotificationTemplate" (
  "id" UUID NOT NULL,
  "eventKey" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "recipients" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "channels" "NotificationChannel"[] NOT NULL,
  "mandatory" BOOLEAN NOT NULL DEFAULT false,
  "forcePush" BOOLEAN NOT NULL DEFAULT false,
  "variables" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "content" JSONB NOT NULL,
  "reason" TEXT,
  "changedByUserId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationTemplate_eventKey_version_key" ON "NotificationTemplate" ("eventKey", "version");

CREATE TABLE "NotificationPreference" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "eventKey" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationPreference_userId_eventKey_channel_key" ON "NotificationPreference" ("userId", "eventKey", "channel");

CREATE TABLE "PushSubscription" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "endpointHash" TEXT NOT NULL,
  "subscriptionEnc" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMPTZ(3),
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PushSubscription_endpointHash_key" ON "PushSubscription" ("endpointHash");
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription" ("userId");

CREATE TABLE "NotificationDispatch" (
  "id" UUID NOT NULL,
  "eventKey" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "userId" UUID,
  "address" TEXT,
  "channel" "NotificationChannel" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationDispatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationDispatch_once_key" ON "NotificationDispatch" ("eventKey", "dedupeKey", "channel", "userId", "address") NULLS NOT DISTINCT;

ALTER TABLE "NotificationTemplate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_template_read ON "NotificationTemplate" FOR SELECT USING (true);
CREATE POLICY notification_template_write ON "NotificationTemplate" FOR INSERT WITH CHECK (app_is_system());
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "NotificationTemplate" FROM astax_app;

ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_preference_own ON "NotificationPreference" FOR ALL
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "PushSubscription" ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_subscription_own ON "PushSubscription" FOR ALL
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

ALTER TABLE "NotificationDispatch" ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_dispatch_system ON "NotificationDispatch" FOR ALL
  USING (app_is_system()) WITH CHECK (app_is_system());
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "NotificationDispatch" FROM astax_app;
