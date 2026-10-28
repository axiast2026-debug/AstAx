-- Dan, 2026-10-28: the request held by one operator, the five checks and the ANIA record.
ALTER TABLE "Verification"
  ADD COLUMN "assignedAt" TIMESTAMPTZ(3),
  ADD COLUMN "checks" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "aniaEnc" TEXT,
  ADD COLUMN "aniaReadAt" TIMESTAMPTZ(3);

UPDATE "Verification" SET "assignedAt" = "updatedAt" WHERE "assignedToUserId" IS NOT NULL;
