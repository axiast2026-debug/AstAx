-- The signing page and the payment page, as the providers give them.
ALTER TABLE "SignatureEnvelope" ADD COLUMN "signingUrl" TEXT NOT NULL;
ALTER TABLE "Payment" ADD COLUMN "redirectUrl" TEXT;
