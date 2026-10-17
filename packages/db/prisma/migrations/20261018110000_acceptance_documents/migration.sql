-- LEG-05: the documents of the acceptance (MUP, letter of engagement), the
-- signed files and the signature evidence, owned by the requester.
ALTER TYPE "DocumentKind" ADD VALUE 'PRECONTRACTUAL_INFO';
ALTER TYPE "DocumentKind" ADD VALUE 'ENGAGEMENT_LETTER';
ALTER TYPE "DocumentKind" ADD VALUE 'SIGNED_DOCUMENT';
ALTER TYPE "DocumentKind" ADD VALUE 'SIGNATURE_EVIDENCE';
