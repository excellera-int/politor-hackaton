# Claude Code Prompt — Politor Chat AI Prototype

> Copy and paste this entire prompt into Claude Code to scaffold the application.

---

## CONTEXT & OBJECTIVE

You are building a **prototype AI-powered chat application** called **Politor** using the WSC Agentic Framework. The app allows users to ask questions in natural language to an AI agent that navigates and reasons over a **Neo4j graph database** containing Italian government Council of Ministers sessions (`sessions` data).

The data source is a CSV with the following schema:

```
id | number | branch | type | status | date | info (JSON) | data (JSON) | created_at | updated_at
```

Each row represents a government session (e.g., `branch: government`, `type: council`, `status: finished`) with rich structured JSON in the `data` field containing the meeting transcript, convening notice, and URLs. The `data.meeting.content` field contains full HTML transcripts of each session.

**Your goal in this task:** Scaffold the entire application. Do NOT populate the Neo4j graph with data yet — only set up the graph connection health check. A separate prompt will handle the data ingestion pipeline.

---

## MANDATORY PRE-FLIGHT RULES

Before writing a single file, internalize these constraints. Violating any of them is not acceptable:

1. **English-only code.** ALL code, variable names, database field names, GraphQL schema types, code comments, and log messages MUST be in English. No Italian, no Spanish, no other language — regardless of what appears in this prompt.

2. **Strict dependency pinning.** NEVER use `^`, `~`, `*`, or `latest` in any `package.json`. Every dependency must be pinned to an exact version (e.g., `"express": "4.18.2"`).

3. **No hardcoded URLs.** Zero `localhost` hardcodes in source files. All URLs resolve from environment variables. The only acceptable fallback is a `|| 'http://localhost:PORT'` default in a config file, never as the primary value.

4. **No `version:` attribute in `docker-compose.yml`.** It is obsolete in Compose v2 and pollutes output.

5. **Anti-silent-crash protocol.** Every backend entry point must wrap startup logic in `try...catch` with explicit `console.error("[FATAL STARTUP ERROR]:", error); process.exit(1);`.

6. **Port binding security.** In `docker-compose.yml`, ALL ports must be bound to `127.0.0.1` (e.g., `"127.0.0.1:4040:4040"`), never as bare `"4040:4040"`.

7. **No frontend volume mounts in production.** Only persist `node_modules` via anonymous volume, never mount the host `./frontend` directory into the container.

8. **Vite variables only in `frontend/.env`.** The `frontend/.env` file must contain ONLY `VITE_*` prefixed variables. Never place backend secrets there.

9. **Seed table order.** In `seed.sql`, tables with foreign key dependencies must be created AFTER the tables they reference.

10. **Strong passwords.** Never use default credentials (`postgres`, `password`, `neo4j/neo4j`). Generate strong values using `openssl rand -base64 24` and place them in `.env`.

---

## PHASE 1 — Infrastructure (Start Here)

### Step 1.1 — Create `docker-compose.yml`

Orchestrate the following five services:

| Service | Image | Internal Port | Notes |
|---|---|---|---|
| `postgres` | `postgres:15.3` | 5432 | Mounts `./db_init/seed.sql` to `/docker-entrypoint-initdb.d/` |
| `neo4j` | `neo4j:5.10.0` | 7474, 7687 | Set `NEO4J_AUTH` from env vars |
| `backend` | Build from `./backend` | 4040 | Depends on `postgres` and `neo4j` |
| `frontend` | Build from `./frontend` | 5173 | Depends on `backend` |

All services must:
- Have `restart: unless-stopped`
- Bind ports to `127.0.0.1` only
- Include memory and CPU limits (backend: 512M / 0.5 CPU; postgres: 256M / 0.5 CPU; neo4j: 512M / 0.5 CPU; frontend: 256M / 0.5 CPU)
- Source all credentials from the root `.env` via variable interpolation

Create `.env.example` with all required variable names and placeholder values. Create `.env` with actual strong generated values (clearly commented as local dev only).

---

## PHASE 2 — Backend

### Step 2.1 — Create `backend/Dockerfile`

- Base: `node:18.17.0-alpine`
- Working directory: `/app`
- Copy `package.json` and `package-lock.json` first, then `npm ci --only=production`, then copy source
- Expose port `4040`
- CMD: `["node", "server.js"]`

### Step 2.2 — Create `backend/package.json`

Pin these exact versions (do not deviate):

```json
{
  "dependencies": {
    "@apollo/server": "4.13.0",
    "express": "4.18.2",
    "graphql": "16.8.0",
    "pg": "8.11.0",
    "neo4j-driver": "5.10.0",
    "cors": "2.8.5",
    "dotenv": "16.3.1",
    "@anthropic-ai/sdk": "0.24.0"
  }
}
```

### Step 2.3 — Create `backend/config/db.js`

PostgreSQL connection pool using `pg`. Read all credentials from `process.env`. Export a `query(text, params)` helper and a `testConnection()` function that logs success or throws on failure.

### Step 2.4 — Create `backend/config/graph.js`

Neo4j driver using `neo4j-driver`. Read `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` from `process.env`. Export the driver and a `testConnection()` function that runs `RETURN 1 AS health` and logs the result. This is the ONLY Neo4j interaction in this phase — do NOT define any data schema or run any ingestion queries.

### Step 2.5 — Create `backend/graphql/typeDefs.js`

Define the base GraphQL schema with:

**Types:**
- `SystemHealth` → `{ postgres: String!, neo4j: String!, timestamp: String! }`
- `User` → `{ id: ID!, email: String!, name: String, role: String!, company_id: Int }`
- `Session` → `{ id: ID!, number: String!, branch: String!, type: String!, status: String!, date: String!, info: String, data: String, created_at: String, updated_at: String }`
- `ChatMessage` → `{ role: String!, content: String!, timestamp: String }`
- `ChatResponse` → `{ message: ChatMessage!, context_used: [Session] }`

**Queries:**
- `systemHealth: SystemHealth`
- `sessions(limit: Int, offset: Int, branch: String, type: String, status: String): [Session!]!`
- `session(id: ID!): Session`
- `me: User`

**Mutations:**
- `chat(message: String!, conversation_history: [ChatInputMessage]): ChatResponse!`
- `login(email: String!, password: String!): String` (returns a token stub for now)

**Input type:**
- `ChatInputMessage` → `{ role: String!, content: String! }`

### Step 2.6 — Create `backend/graphql/resolvers.js`

Implement the following resolvers:

- `Query.systemHealth` → calls `testConnection()` on both DB and graph, returns status strings
- `Query.sessions` → queries `sessions` table in PostgreSQL with optional filters and pagination
- `Query.session` → fetches a single session by `id`
- `Query.me` → returns a stub user (RBAC scaffolding, not yet authenticated)
- `Mutation.login` → stub that returns a placeholder JWT string with a TODO comment
- `Mutation.chat` → **this is the core resolver**. It must:
  1. Accept the user's natural language `message`
  2. Query PostgreSQL to retrieve relevant sessions (for now use a simple keyword search on `data::text ILIKE '%keyword%'`, extracting the first significant word from the message)
  3. Format those sessions as context for the AI
  4. Call the Anthropic API (`claude-sonnet-4-20250514`) using `@anthropic-ai/sdk` with a system prompt that instructs the model to act as a political analyst assistant answering questions about Italian government Council of Ministers sessions
  5. Pass `conversation_history` to maintain multi-turn context
  6. Return a `ChatResponse` with the AI's reply and the sessions used as context

The system prompt for the AI must include:
```
You are a political analyst assistant for the Politor platform. 
You have access to records of Italian Council of Ministers sessions.
Answer questions accurately based on the session data provided as context.
When referencing sessions, cite the session number and date.
Always respond in the same language the user is using.
```

### Step 2.7 — Create `backend/mcp_tools/agent_registry.js`

Scaffold an MCP-compatible tool registry that exports an array of tool definitions. For now, define two placeholder tools:
- `search_sessions` — description: "Search Council of Ministers sessions by keyword, date range, or topic"
- `get_session_detail` — description: "Get full transcript and details of a specific session by ID"

These are stubs — no implementation yet. Add a `TODO` comment referencing that these will be wired to the GraphQL resolvers in a future phase.

### Step 2.8 — Create `backend/server.js`

Initialize Express + Apollo Server. Must:
- Wrap all startup in `try...catch` with `process.exit(1)` on failure
- Call `testConnection()` for both Postgres and Neo4j on startup
- Apply CORS reading allowed origins from `process.env.CORS_ORIGIN`
- Mount Apollo at `/graphql`
- Add a `/health` REST endpoint returning `{ status: 'ok' }`

---

## PHASE 3 — Database

### Step 3.1 — Create `db_init/seed.sql`

Create tables in strict dependency order:

```sql
-- 1. organizations (no foreign keys)
CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. users (references organizations)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  company_id INT REFERENCES organizations(id),
  role VARCHAR(50) DEFAULT 'Member',
  password_hash VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. sessions (standalone — mirrors the CSV source data)
CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  number VARCHAR(50),
  branch VARCHAR(100),
  type VARCHAR(100),
  status VARCHAR(50),
  date TIMESTAMP,
  info JSONB,
  data JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

Then seed one organization and one `Hero` role user (password_hash as a placeholder string with a TODO to hash it properly).

Also create a limited `app_user` and grant it only `SELECT, INSERT, UPDATE, DELETE` on public tables — never use the superuser at runtime.

---

## PHASE 4 — Frontend

### Step 4.1 — Create `frontend/Dockerfile`

Two-stage build:
- Stage 1 (`builder`): `node:18.17.0-alpine`, run `npm ci`, run `npm run build`
- Stage 2: `nginx:1.25.1-alpine`, copy `/app/dist` to `/usr/share/nginx/html`
- Expose port `80`

### Step 4.2 — Create `frontend/package.json`

Pin these exact versions:

```json
{
  "dependencies": {
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "react-router-dom": "6.14.0",
    "@apollo/client": "3.8.0",
    "graphql": "16.8.0"
  },
  "devDependencies": {
    "vite": "4.4.0",
    "@vitejs/plugin-react": "4.0.3",
    "tailwindcss": "3.3.3",
    "autoprefixer": "10.4.14",
    "postcss": "8.4.27"
  }
}
```

### Step 4.3 — Create `frontend/vite.config.js`

Standard Vite + React config. Set `server.port` to `5173`. No hardcoded proxy URLs — read from env.

### Step 4.4 — Create `frontend/src/apollo/client.js`

```javascript
// CORRECT pattern — read from env, never hardcode
const client = new ApolloClient({
  uri: import.meta.env.VITE_API_URL || 'http://localhost:4040/graphql',
  cache: new InMemoryCache(),
});
```

### Step 4.5 — Create `frontend/src/App.jsx`

React Router setup with three routes:
- `/login` → `<Login />`
- `/` → `<Dashboard />` (protected, redirect to `/login` if not authenticated)
- `/chat` → `<ChatPage />` (protected)

### Step 4.6 — Create `frontend/src/components/TopNav.jsx` and `Sidebar.jsx`

Standard scaffolding. `Sidebar` must include navigation links to Dashboard and Chat. Style with Tailwind. Use the application name **Politor** in the header.

### Step 4.7 — Create `frontend/src/pages/Login.jsx`

Simple email/password form. On submit, call the `login` GraphQL mutation, store the returned token in `localStorage`, and redirect to `/`.

### Step 4.8 — Create `frontend/src/pages/Dashboard.jsx`

Display:
- A system health card (calls `systemHealth` query, shows Postgres + Neo4j status)
- A summary table of the most recent 10 sessions (calls `sessions(limit: 10)` query), showing columns: Number, Branch, Type, Status, Date

### Step 4.9 — Create `frontend/src/pages/ChatPage.jsx`

This is the **core UI**. Build a full-page chat interface that:
- Displays a scrollable message history with clearly differentiated user vs. assistant bubbles
- Has a fixed bottom input bar with a text field and a Send button
- On send, calls the `chat` GraphQL mutation with the message and the full `conversation_history`
- While waiting for the response, shows a typing indicator
- When the response arrives, renders the AI message and — if `context_used` sessions are returned — shows a collapsible "Sources" section below the message listing the session number, date, and a truncated title extracted from `data`
- Maintains the full conversation history in local React state for multi-turn context
- Has a "New Conversation" button that clears the history

Style everything with Tailwind. The chat UI should feel clean and professional — think a minimal political intelligence tool, not a consumer chatbot.

---

## PHASE 5 — Final Files

### Step 5.1 — Create `frontend/.env`

```
VITE_API_URL=http://localhost:4040/graphql
```

### Step 5.2 — Create `backend/.env`

```
PORT=4040
POSTGRES_URI=postgresql://app_user:<password>@postgres:5432/politor_db
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=<strong_password>
ANTHROPIC_API_KEY=<to_be_filled>
CORS_ORIGIN=http://localhost:5173
```

### Step 5.3 — Create root `.env`

```
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<strong_password>
POSTGRES_DB=politor_db
NEO4J_USER=neo4j
NEO4J_PASSWORD=<strong_password>
APP_USER_PASSWORD=<strong_password>
```

### Step 5.4 — Create `README.md`

Include:
1. Project overview (Politor — AI-powered government session explorer)
2. Prerequisites (Docker Compose v2, `docker-compose-plugin`, NOT the legacy Python package)
3. Setup instructions: copy `.env.example` → `.env`, fill in `ANTHROPIC_API_KEY`, then `docker compose up -d`
4. How to verify: `docker compose logs -f backend` to confirm Postgres + Neo4j health checks pass
5. A section titled **"Next Steps"** with two TODO items:
   - "Run the data ingestion script to load `sessions_202603161033.csv` into PostgreSQL and build the Neo4j graph"
   - "Wire `mcp_tools/agent_registry.js` tool implementations to GraphQL resolvers"

---

## VERIFICATION CHECKLIST

After generating all files, verify:

- [ ] `docker compose up -d` starts all 5 containers without errors
- [ ] `docker compose logs backend` shows `[DB] PostgreSQL connected` and `[NEO4J] Graph driver healthy`
- [ ] GraphQL playground at `http://localhost:4040/graphql` is accessible
- [ ] `systemHealth` query returns `{ postgres: "ok", neo4j: "ok" }`
- [ ] `sessions` query returns an empty array (no data yet — correct)
- [ ] Frontend loads at `http://localhost:5173`
- [ ] Chat page renders and the `chat` mutation returns an AI response (even with no session context yet)
- [ ] No `localhost` hardcodes exist in any source file (only env-driven with fallback defaults)
- [ ] No `^` or `~` version prefixes exist in any `package.json`
