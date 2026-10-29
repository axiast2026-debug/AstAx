-- Dan, 2026-10-29: the IBAN is asked at the first offer, not at the entry.
ALTER TABLE "OnboardingApplication" ALTER COLUMN "ibanEnc" DROP NOT NULL;

-- The agency's IBAN is confirmed with a code at its first offer.
ALTER TYPE "OtpPurpose" ADD VALUE 'OFFER_IBAN';

-- ADR 0024: every agency may join an open auction from the list.
ALTER TYPE "InvitationSource" ADD VALUE 'OPEN_LIST';
