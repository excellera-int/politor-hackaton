#!/bin/bash
set -e

# Create the restricted app_user with the password injected from the environment.
# This script runs before 02-schema.sql because Docker init files execute alphabetically.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_USER}') THEN
      CREATE ROLE "${APP_USER}" WITH LOGIN PASSWORD '${APP_USER_PASSWORD}';
    ELSE
      ALTER ROLE "${APP_USER}" WITH PASSWORD '${APP_USER_PASSWORD}';
    END IF;
  END
  \$\$;

  GRANT CONNECT ON DATABASE "${POSTGRES_DB}" TO "${APP_USER}";
  GRANT USAGE ON SCHEMA public TO "${APP_USER}";
EOSQL
