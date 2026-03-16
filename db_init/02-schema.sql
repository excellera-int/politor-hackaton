-- =============================================================
-- Politor — Schema & Seed
-- Table creation order respects foreign key dependencies:
-- 1. organizations (no FK)
-- 2. users (references organizations)
-- 3. sessions (standalone — mirrors CSV schema)
-- app_user role is created by 01-create-user.sh (runs first)
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

-- 3. Sessions (Council of Ministers — mirrors source schema exactly)
CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER NOT NULL,
  number     VARCHAR(255) NOT NULL,
  branch     VARCHAR(255) NOT NULL,
  type       VARCHAR(255) NOT NULL,
  status     VARCHAR(255) NOT NULL,
  date       TEXT DEFAULT NULL,
  info       TEXT DEFAULT NULL,
  data       TEXT DEFAULT NULL,
  created_at TEXT DEFAULT NULL,
  updated_at TEXT DEFAULT NULL,
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_number_branch_type_unique
  ON sessions (number, branch, type);

CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions (date);

-- =============================================================
-- Seed data
-- =============================================================

INSERT INTO organizations (name) VALUES ('Excellera Advisory Group')
  ON CONFLICT DO NOTHING;

-- TODO: Replace placeholder password_hash values with real bcrypt hashes before production
-- User 1 — Admin: full access including service dashboard
INSERT INTO users (email, name, company_id, role, password_hash)
VALUES (
  'admin@politor.local',
  'Politor Admin',
  (SELECT id FROM organizations WHERE name = 'Excellera Advisory Group' LIMIT 1),
  'Admin',
  '$2b$12$PLACEHOLDER_HASH_REPLACE_BEFORE_PRODUCTION'
) ON CONFLICT (email) DO NOTHING;

-- User 2 — Analyst: standard access, chat and session browsing only
INSERT INTO users (email, name, company_id, role, password_hash)
VALUES (
  'analyst@politor.local',
  'Politor Analyst',
  (SELECT id FROM organizations WHERE name = 'Excellera Advisory Group' LIMIT 1),
  'Member',
  '$2b$12$PLACEHOLDER_HASH_REPLACE_BEFORE_PRODUCTION'
) ON CONFLICT (email) DO NOTHING;

-- =============================================================
-- DML grants for app_user (role created by 01-create-user.sh)
-- =============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
