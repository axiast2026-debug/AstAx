-- Retention (LEG-06) empties the encrypted quoteData of a purged request:
-- the application may change that one column, and only as the system
-- (policy quote_data_version_purge). Every other column stays immutable.
GRANT UPDATE ("dataEnc") ON TABLE "QuoteDataVersion" TO astax_app;
