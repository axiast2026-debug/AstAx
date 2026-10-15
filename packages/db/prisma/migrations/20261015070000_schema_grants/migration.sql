-- Schema privileges, repeated here because `prisma migrate reset` drops and
-- recreates the public schema, losing what the init script granted.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO astax_app;
