#!/usr/bin/env bash
# Ingests data/sessions.csv into the PostgreSQL sessions table.
# Idempotent: safe to re-run, skips rows that already exist.
# Requires: Docker running with the postgres service up.
# Usage: bash scripts/ingest-sessions.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CSV_PATH="$PROJECT_ROOT/data/sessions.csv"

# Load .env
if [ ! -f "$PROJECT_ROOT/.env" ]; then
  echo "ERROR: .env file not found. Copy .env.example to .env and fill in values."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "$PROJECT_ROOT/.env"
set +a

CONTAINER="politor-hackaton-postgres-1"
REMOTE_CSV="/tmp/sessions_import.csv"

# Verify CSV exists
if [ ! -f "$CSV_PATH" ]; then
  echo "ERROR: CSV not found at $CSV_PATH"
  exit 1
fi

# Verify container is running
if ! docker inspect --format '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  echo "ERROR: Container '$CONTAINER' is not running."
  echo "Start it with: docker compose up -d postgres"
  exit 1
fi

echo "Copying CSV into container..."
docker cp "$CSV_PATH" "$CONTAINER:$REMOTE_CSV"

echo "Running COPY import via temp table (idempotent)..."
docker exec -i "$CONTAINER" psql \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  <<'SQL'
BEGIN;

CREATE TEMP TABLE sessions_staging (LIKE sessions INCLUDING ALL);

COPY sessions_staging (id, number, branch, type, status, date, info, data, created_at, updated_at) FROM '/tmp/sessions_import.csv' WITH (FORMAT CSV, HEADER TRUE);

INSERT INTO sessions
  SELECT * FROM sessions_staging
  ON CONFLICT (id) DO NOTHING;

DROP TABLE sessions_staging;

COMMIT;
SQL

echo "Cleaning up temporary file..."
docker exec "$CONTAINER" rm "$REMOTE_CSV"

echo "Verifying row count..."
docker exec -i "$CONTAINER" psql \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -c "SELECT COUNT(*) AS sessions_loaded FROM sessions;"

echo "Done."
