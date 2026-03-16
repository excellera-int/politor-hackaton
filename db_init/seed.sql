-- =============================================================
-- Politor — Database Initialisation Script
-- Table creation order respects foreign key dependencies:
-- 1. organizations (no FK)
-- 2. users (references organizations)
-- 3. sessions (standalone — mirrors CSV schema)
-- =============================================================

-- 1. Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Users
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  name          VARCHAR(255),
  company_id    INT REFERENCES organizations(id),
  role          VARCHAR(50) DEFAULT 'Member',
  password_hash VARCHAR(255),
  created_at    TIMESTAMP DEFAULT NOW()
);

-- 3. Sessions (Council of Ministers — mirrors CSV schema)
CREATE TABLE IF NOT EXISTS sessions (
  id         SERIAL PRIMARY KEY,
  number     VARCHAR(50),
  branch     VARCHAR(100),
  type       VARCHAR(100),
  status     VARCHAR(50),
  date       TIMESTAMP,
  info       JSONB,
  data       JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Full-text search index on data and info JSONB fields
CREATE INDEX IF NOT EXISTS idx_sessions_data  ON sessions USING GIN (data);
CREATE INDEX IF NOT EXISTS idx_sessions_info  ON sessions USING GIN (info);
CREATE INDEX IF NOT EXISTS idx_sessions_date  ON sessions (date);

-- =============================================================
-- Seed data
-- =============================================================

INSERT INTO organizations (name) VALUES ('Excellera Advisory Group')
  ON CONFLICT DO NOTHING;

-- TODO: Replace placeholder password_hash with a real bcrypt hash before production
INSERT INTO users (email, name, company_id, role, password_hash)
VALUES (
  'admin@politor.local',
  'Politor Admin',
  (SELECT id FROM organizations WHERE name = 'Excellera Advisory Group' LIMIT 1),
  'Admin',
  '$2b$12$PLACEHOLDER_HASH_REPLACE_BEFORE_PRODUCTION'
) ON CONFLICT (email) DO NOTHING;

-- =============================================================
-- Restricted application user
-- Grants only DML — no DDL, no superuser
-- =============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user WITH LOGIN PASSWORD 'placeholder_replaced_by_env';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE politor_db TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Ensure future tables are also accessible
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
