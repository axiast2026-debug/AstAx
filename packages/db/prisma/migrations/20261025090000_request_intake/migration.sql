-- ADR 0013: the private request in two stages.
ALTER TYPE "QuoteDataSource" ADD VALUE 'BACK_OFFICE_COMPLETION';
ALTER TYPE "DocumentKind" ADD VALUE 'IDENTITY_DOCUMENT';
ALTER TABLE "Verification" ALTER COLUMN "quoteDataVersion" DROP NOT NULL;
