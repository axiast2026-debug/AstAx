#!/bin/sh
# Runs once, when the local PostgreSQL volume is created.
# astax_owner owns the schema and runs migrations; astax_app is what API and
# worker use: not owner and without BYPASSRLS, so row level security applies (SIC-02).
set -eu

psql -v ON_ERROR_STOP=1 --username postgres \
  -v owner_pw="$ASTAX_DB_OWNER_PASSWORD" \
  -v app_pw="$ASTAX_DB_APP_PASSWORD" \
  -v kc_pw="$KEYCLOAK_DB_PASSWORD" <<'SQL'
CREATE ROLE astax_owner LOGIN PASSWORD :'owner_pw' NOSUPERUSER NOCREATEROLE CREATEDB;
CREATE ROLE astax_app LOGIN PASSWORD :'app_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE keycloak LOGIN PASSWORD :'kc_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;

CREATE DATABASE astax OWNER astax_owner;
CREATE DATABASE keycloak OWNER keycloak;

\connect astax
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO astax_owner;
GRANT USAGE ON SCHEMA public TO astax_app;
SQL
