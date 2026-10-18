-- The private link of an entry, encrypted, to send it again (rejection email).
ALTER TABLE "OnboardingApplication" ADD COLUMN "tokenEnc" TEXT NOT NULL;
