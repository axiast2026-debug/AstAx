-- ADR 0027: the offer bought by the intermediary (acceptedByUserId) is signed
-- by the customer on a link (customerLinkId): both are set. Every other
-- acceptance keeps exactly one author, the private user or the broker's link.
ALTER TABLE "Acceptance" DROP CONSTRAINT acceptance_one_author;
ALTER TABLE "Acceptance" ADD CONSTRAINT acceptance_one_author
  CHECK (
    ("acceptedByUserId" IS NULL) <> ("customerLinkId" IS NULL)
    OR ("intermediaryPurchase" AND "acceptedByUserId" IS NOT NULL)
  );
