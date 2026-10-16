-- PRES-02, VIS-04, rule 3: the PDF quotes of the offers belong to the request
-- but are not the requester's to read: the presented ones reach the requester
-- with the offers (phase 5). Second line after the API's filters.
CREATE POLICY document_offer_quote_hidden ON "Document" AS RESTRICTIVE FOR SELECT
  USING ("kind" <> 'OFFER_QUOTE' OR app_is_privileged());
