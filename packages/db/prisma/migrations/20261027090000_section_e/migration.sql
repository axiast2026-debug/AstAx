-- Dan, 2026-10-21 (docs/piano-broker.md, A): intermediaries of section E enter
-- as requesters, with the agency or broker they work for.
ALTER TABLE "OnboardingApplication" ADD COLUMN "principalRuiNumber" TEXT;
ALTER TABLE "Organization" ADD COLUMN "principalRuiNumber" TEXT;
ALTER TYPE "RuiSection" ADD VALUE 'E';
