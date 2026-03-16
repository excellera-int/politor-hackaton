# Politor

AI-powered conversational interface for exploring Italian Council of Ministers sessions.

Analysts ask natural-language questions ("What did the Council decide about infrastructure in 2023?") and receive grounded answers with direct links back to the original session records — replacing the current text-only search.

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS + Apollo Client |
| Backend | Node.js + Express + Apollo Server (GraphQL) |
| AI | Anthropic Claude (claude-sonnet-4-20250514) |
| Relational DB | PostgreSQL 15 |
| Graph DB | Neo4j 5 |
| Container | Docker Compose v2 |

## Prerequisites

- **Docker Compose v2 plugin** (bundled with Docker Desktop >= 3.6 or `docker compose` on Linux)
  - Do NOT use the legacy Python package (`docker-compose` with a hyphen)
- An Anthropic API key

## Setup

1. Copy the example environment file and fill in your Anthropic key:
   ```bash
   cp .env.example .env
   # Edit .env and set ANTHROPIC_API_KEY=sk-ant-...
   ```

2. Start all services:
   ```bash
   docker compose up -d
   ```

3. Verify containers are healthy:
   ```bash
   docker compose logs backend
   # Should show:
   # [DB] PostgreSQL connected
   # [GRAPH] Neo4j connected
   # [POLITOR BACKEND] Server ready at http://localhost:4040/graphql
   ```

## Access

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| GraphQL API | http://localhost:4040/graphql |
| Neo4j Browser | http://localhost:7474 |

Login with: `admin@politor.local` (any password — auth is a stub in this scaffold)

## Verification

Run this query in the GraphQL playground at `http://localhost:4040/graphql`:

```graphql
query {
  systemHealth {
    postgres
    neo4j
    timestamp
  }
}
```

Expected result:
```json
{
  "data": {
    "systemHealth": {
      "postgres": "ok",
      "neo4j": "ok",
      "timestamp": "..."
    }
  }
}
```

## Next Steps

This is the scaffold — no session data has been loaded yet. To activate the full experience:

1. **Run data ingestion** — import the Council of Ministers CSV into the `sessions` PostgreSQL table
2. **Wire MCP tools** — implement `search_sessions` and `get_session_detail` handlers in `backend/mcp_tools/agent_registry.js`
3. **Neo4j graph model** — design and populate the graph schema for relationship-based queries
4. **NER / metadata enrichment** — tag sessions by topic, entity, and theme to enable filter-based search (addresses Simone's pain point #2 — "data underutilised")
5. **Real authentication** — replace the placeholder JWT with bcrypt + proper JWT signing

## Security notes

- All Docker ports are bound to `127.0.0.1` — not exposed to the internet by default
- Strong generated passwords are in `.env` — never commit this file
- The `app_user` database role has only SELECT/INSERT/UPDATE/DELETE — no DDL privileges
