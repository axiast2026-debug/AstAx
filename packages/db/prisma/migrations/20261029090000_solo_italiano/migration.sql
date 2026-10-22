-- ADR 0017 (Dan, 2026-10-22): AstAx speaks only Italian, the back office too.
-- The Albanian labels and the language of users, tickets and complaints go.
ALTER TABLE "User" DROP COLUMN "locale";
ALTER TABLE "SupportTicket" DROP COLUMN "locale";
ALTER TABLE "Complaint" DROP COLUMN "complainantLocale";
ALTER TABLE "ListValue" DROP COLUMN "labelSq";
ALTER TABLE "ExclusionRule" DROP COLUMN "messageSq";
ALTER TABLE "ExclusionRuleVersion" DROP COLUMN "messageSq";
ALTER TABLE "CoveragePackageVersion" DROP COLUMN "customerTextSq";
ALTER TABLE "Holiday" DROP COLUMN "nameSq";
DROP TYPE "Locale";
-- The Albanian versions kept inside the notification texts go too.
UPDATE "NotificationTemplate" SET "content" = "content" - 'sq' WHERE "content" ? 'sq';
