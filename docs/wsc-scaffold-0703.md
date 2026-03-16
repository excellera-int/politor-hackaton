# WHITE SYSTEMS CONSULTING 
## Architecture Design Document (ADD) 

**Project:** WSC Agentic Framework | **Version:** 1.3.0 | **Environment:** Dockerized Local & Production

---

### 1. Executive Summary 
The WSC Agentic Framework is a proprietary, enterprise-grade boilerplate designed for rapid application prototyping and production scaling. It features a dual-database architecture (Relational + Graph), a strict GraphQL API layer, and native Model Context Protocol (MCP) tool integration. This framework is designed to serve as the foundation for Human-in-the-Loop, AI-agent-driven software.

---

### 2. Core Technology Stack 
* **Infrastructure:** Docker Compose v2 plugin (Multi-container orchestration). NEVER use the legacy Python-based `docker-compose` v1 package — it causes `KeyError: 'ContainerConfig'` with modern images. Always install via `apt-get install docker-compose-plugin`.
* **Databases:**
  * **Primary Relational:** PostgreSQL (User data, RBAC, structured CRUD) 
  * **Secondary Graph:** Neo4j (Complex relationships, dependencies, agentic traversal) 
* **Backend Application:** Node.js, Express.js 
* **API Layer:** Apollo Server (GraphQL) 
* **Agentic Layer:** Modular MCP (Model Context Protocol) tool exposure 
* **Frontend Application:** React.js (Vite), Apollo Client, Tailwind CSS 

---

### 3. Critical Constraints & Directives 
* **Strict Language Rule:** ALL code, variable names, database schemas, and code comments MUST strictly be in English, regardless of the conversational language used in prompts.
* **Error Handling:** Global error boundaries in the frontend; graceful GraphQL error formatting in the backend to prevent container crashes.
* **Security:** Base implementation of Role-Based Access Control (RBAC) scaffolding in the database and API resolvers.

---

### 4. Target Directory Structure 
The system must adhere to the following enterprise scaffold: 

```
/wsc_agentic_framework 
├── .env                    # Root .env — used by docker-compose for variable interpolation
├── .env.example            # Committed to git. Never commit .env itself.
├── docker-compose.yml 
├── /backend 
│   ├── .env                # Backend-specific secrets (DB credentials, API keys, SMTP, etc.)
│   ├── Dockerfile 
│   ├── package.json 
│   ├── server.js           # Express & Apollo Server initialization 
│   ├── /config 
│   │   ├── db.js           # PostgreSQL connection pool 
│   │   └── graph.js        # Neo4j driver connection 
│   ├── /graphql 
│   │   ├── typeDefs.js     # Base schema (Users, SystemHealth) 
│   │   └── resolvers.js    # Base queries and mutations with RBAC 
│   └── /mcp_tools 
│       └── agent_registry.js  # Scaffolding to expose GraphQL to AI agents
├── /db_init 
│   └── seed.sql            # Base PostgreSQL initialization
└── /frontend 
    ├── .env                # ONLY VITE_ prefixed variables. Nothing else.
    ├── Dockerfile 
    ├── package.json 
    ├── vite.config.js 
    ├── index.html 
    └── /src 
        ├── main.jsx 
        ├── App.jsx          # React Router setup 
        ├── /apollo 
        │   └── client.js    # Apollo Client setup with auth headers 
        ├── /components 
        │   ├── TopNav.jsx   # Global header scaffolding 
        │   └── Sidebar.jsx  # Navigation scaffolding 
        └── /pages 
            ├── Dashboard.jsx  # Default authenticated view 
            └── Login.jsx      # Auth entry point 
```

---

### 5. Database Scaffolding Requirements 
To ensure the dual-database architecture is functioning immediately upon `docker compose up`, the framework must include:

* **PostgreSQL:** A `users` table with fields for `id`, `email`, `name`, `company_id`, and `role` (e.g., `'Hero'`, `'Admin'`, `'Member'`).
* **Neo4j:** A health-check query sequence on backend startup to verify the graph driver is accepting Cypher queries.
* **seed.sql Table Order:** Tables MUST be created in strict dependency order. Any table that references another via a foreign key MUST be declared AFTER the referenced table. Violating this order causes `relation does not exist` errors at seed time. Example: `projects` must exist before `budget_items` references it.

---

### 6. AI Instructions for Prompt Generation 
As an AI reading this document, your task is to generate a comprehensive, step-by-step prompt (or series of prompts) that a human user can copy and paste into an autonomous coding agent. The prompts you generate MUST: 
1. Instruct the coding agent to create the `docker-compose.yml` and necessary `Dockerfiles` first.
2. Instruct the coding agent to build the backend and database connection files.
3. Instruct the coding agent to build the frontend Vite application and Apollo Client.
4. Remind the coding agent of the strict English-only coding constraint.
5. Remind the coding agent to apply ALL directives in Sections 7, 8, 9, and 10 of this document before generating any file.

---

### 7. Deterministic Dependency & Container Strategy
To prevent silent container crashes and breaking changes during agentic code generation, the following constraints MUST be strictly enforced across all stacks (Node.js, Python, etc.):

* **7.1. Strict Dependency Pinning (Zero-Trust Versions):** NEVER use floating versions (`^`, `~`, `*`, or `latest`) in `package.json`, `requirements.txt`, or any dependency manager. All foundational libraries MUST be hardcoded to a specific, stable major/minor version (e.g., `"@apollo/server": "4.13.0"`).

* **7.2. Anti-Silent-Crash Protocol:** Containers must never die silently. All backend entry points MUST wrap their initialization logic in a `try...catch` block that explicitly logs fatal errors to standard output:
  ```javascript
  console.error("[FATAL STARTUP ERROR]:", error);
  process.exit(1);
  ```

* **7.3. The "Bare-Metal" Diagnostic Escape Hatch:** If a Dockerized service falls into a crash loop or throws opaque network errors, DO NOT attempt to debug blindly through Docker. Execute a bare-metal test locally (`npm install` → `node server.js`) to expose ESM export errors or missing dependencies.

* **7.4. docker-compose.yml Version Attribute:** Do NOT include the top-level `version:` attribute (e.g., `version: '3.8'`) in `docker-compose.yml`. It is obsolete in Compose v2 and generates warnings that pollute all command output.

---

### 8. Production Deployment & State Management Strict Directives
Based on production deployment testing, the following rules MUST be followed to prevent environment synchronization failures:

* **8.1. Zero Hardcoded URLs — Applies to ALL Source Files:** Absolutely NO hardcoded `localhost` or IP-based URLs may exist anywhere in the codebase. This applies to:
  * **Frontend source files** (e.g., `apollo/client.js`, `fetch()` calls in any `.jsx`/`.js` file)
  * Backend routing, CORS configurations, and OAuth callbacks (e.g., `successRedirect`, `failureRedirect`)

  ALL URLs MUST be resolved exclusively from environment variables:
  ```javascript
  // CORRECT — apollo/client.js
  const client = new ApolloClient({
    uri: import.meta.env.VITE_API_URL || 'http://localhost:4040/graphql',
  });

  // CORRECT — any fetch() call
  const API_BASE = import.meta.env.VITE_API_URL?.replace('/graphql', '') || 'http://localhost:4040';

  // WRONG — never do this
  uri: 'http://localhost:4040/graphql'
  ```

  The fallback `localhost` value is acceptable only as a last-resort default for local development, never as the primary value.

* **8.2. Vite Build-Time Variable Embedding:** Vite embeds `VITE_*` environment variables into static JS bundles **at build time**, not at runtime. Consequences:
  * Variables set in `docker-compose.yml` under `environment:` are **NOT injected** into the Vite build. They must be present in `frontend/.env` before the build runs.
  * Changing any `VITE_*` variable requires a full cache-busting rebuild: `docker compose build --no-cache frontend`.
  * A standard `docker compose restart` will NOT apply new Vite environment variables.
  * After a rebuild, always verify the URL was embedded: `docker exec <frontend-container> grep -r "YOUR_IP" /app/dist/assets/`

* **8.3. Frontend Volume Mount Anti-Pattern:** NEVER mount the host `./frontend` directory into the frontend container in production:
  ```yaml
  # WRONG — this overwrites the built /app/dist, breaking the production build
  volumes:
    - ./frontend:/app

  # CORRECT — only persist node_modules to avoid reinstalling on every start
  volumes:
    - /app/node_modules
  ```
  Mounting the host directory overwrites the `dist/` folder that Vite built inside the image, causing 404 errors on all routes.

* **8.4. Environment Variable Scope Separation:** Each `.env` file has a strict and exclusive scope. Never mix variables across scopes:

  | File | Purpose | Contains |
  |---|---|---|
  | `.env` (root) | docker-compose variable interpolation | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `NEO4J_USER`, `NEO4J_PASSWORD` |
  | `backend/.env` | Backend runtime secrets | DB credentials, `PORT`, `NEO4J_URI`, `SMTP_*`, `OAUTH_*` keys |
  | `frontend/.env` | Vite build-time variables | ONLY `VITE_*` prefixed variables (e.g., `VITE_API_URL`) |

  Placing backend secrets (e.g., `POSTGRES_PASSWORD`) in `frontend/.env` exposes credentials in the compiled JS bundle, which is a critical security vulnerability.

* **8.5. PostgreSQL Volume Persistence:** The Postgres Docker image only runs its initialization scripts (including `seed.sql`) on its **first** startup when the volume is empty. Consequences:
  * Changing credentials in `.env` after the first run will cause a fatal authentication mismatch.
  * To apply new credentials or re-run `seed.sql`: `docker compose down -v` to destroy the volume, then `docker compose up -d`.
  * Warning: `docker compose down -v` is destructive. All database data will be lost.

* **8.6. Strict RBAC Case-Sensitivity & Data Integrity:**
  * Role authorization checks (e.g., `user.role === 'Hero'`) are strictly case-sensitive. Database seeds and updates must match the exact casing expected by the API layer.
  * Users MUST NOT be orphaned. Authorization logic verifying organization-level access will fail if a user (even an Admin) lacks a `company_id`. All users must be linked to a valid organization upon creation.

---

### 9. Production Server Infrastructure Directives
These directives apply when deploying to a Linux server (e.g., DigitalOcean Droplet, AWS EC2):

* **9.1. Swap Memory for Low-RAM Servers:** On servers with 2GB RAM or less, the Vite build process (`npm run build`) may run out of memory and fail silently (e.g., only transforming 38/1800 modules). Before any build, configure swap:
  ```bash
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```

* **9.2. Firewall Configuration (UFW):** On a fresh Ubuntu server, open ONLY ports that must be publicly accessible. Always open port 22 first to prevent SSH lockout. **NEVER open database or internal service ports to the public internet** — these are handled internally by Docker networking and Apache proxy (see Section 10):
  ```bash
  sudo ufw allow 22      # SSH — ALWAYS first, never skip
  sudo ufw allow 80      # HTTP (Apache handles routing)
  sudo ufw allow 443     # HTTPS (Apache handles routing)
  sudo ufw enable
  ```

  Do NOT open ports like `5432`, `7474`, `7687`, `4000`, `5173`, `8080`, or any internal service port. Apache acts as the single public entry point and proxies to internal containers. Opening internal ports directly exposes databases and services to automated internet scanners and brute-force attacks.

* **9.3. Kernel & System Updates:** After installing packages on a fresh server, a kernel upgrade may be pending. Schedule a reboot at a safe time to apply it:
  ```bash
  sudo reboot
  ```
  Containers configured with `restart: unless-stopped` will come back online automatically after the reboot.

* **9.4. Buildx Plugin:** Install the Docker Buildx plugin to eliminate build warnings and enable advanced build features:
  ```bash
  sudo apt-get install -y docker-buildx-plugin
  ```

---

### 10. Production Security Hardening Directives
These directives are MANDATORY for every application deployed to production. They are derived from real incidents and prevent the most common attack vectors targeting Dockerized applications on cloud servers.

* **10.1. Docker Port Binding — Localhost Only (CRITICAL):** This is the single most important security directive. NEVER publish a container port as `"PORT:PORT"` in `docker-compose.yml` in production. This binds the port to all network interfaces (0.0.0.0), making it directly accessible from the internet, bypassing the firewall entirely.

  ALL internal services (databases, backends, frontends served via reverse proxy) MUST bind exclusively to `127.0.0.1`:

  ```yaml
  # WRONG — exposes the port to the entire internet, bypasses UFW
  ports:
    - "5432:5432"
    - "4000:4000"
    - "7474:7474"

  # CORRECT — port is only accessible from within the server itself
  ports:
    - "127.0.0.1:5432:5432"
    - "127.0.0.1:4000:4000"
    - "127.0.0.1:7474:7474"
  ```

  The only containers that should NOT have this restriction are those that need a public port AND are not behind a reverse proxy. In the WSC stack, Apache is the sole public-facing entry point — all Docker services proxy through it.

* **10.2. No Default or Weak Database Passwords:** NEVER use default credentials in any environment file, even for demos or proof-of-concept deployments on production servers. Automated scanners test default credentials within minutes of a port becoming accessible.

  ```yaml
  # WRONG — these will be found and exploited within hours
  POSTGRES_PASSWORD: postgres
  POSTGRES_PASSWORD: password
  NEO4J_AUTH: neo4j/neo4j
  NEO4J_AUTH: neo4j/password

  # CORRECT — use strong, unique, randomly generated passwords
  POSTGRES_PASSWORD: xK9#mP2$vL7qN4wR
  NEO4J_AUTH: neo4j/xK9#mP2$vL7qN4wR
  ```

  Use a password manager or generate with: `openssl rand -base64 24`

* **10.3. Apache Reverse Proxy as Single Entry Point:** Every service deployed on the server MUST be accessed through Apache virtual hosts, never directly via port. The Apache configuration for each service must follow this pattern:

  ```apache
  <VirtualHost *:443>
      ServerName myapp.mydomain.com
      ProxyPreserveHost On

      # Route all traffic through Apache to the internal container
      ProxyPass / http://127.0.0.1:4000/
      ProxyPassReverse / http://127.0.0.1:4000/

      SSLCertificateFile /etc/letsencrypt/live/myapp.mydomain.com/fullchain.pem
      SSLCertificateKeyFile /etc/letsencrypt/live/myapp.mydomain.com/privkey.pem
  </VirtualHost>
  ```

  This architecture means: the internet talks to Apache on 80/443, Apache talks to Docker containers on localhost, and Docker containers talk to each other via Docker internal networking. Databases never appear in this chain.

* **10.4. Container Resource Limits:** Without memory limits, a single runaway process (caused by a bug, infinite loop, or malicious query) can consume 100% of CPU and RAM, taking down all other services on the server. Always set limits:

  ```yaml
  services:
    backend:
      deploy:
        resources:
          limits:
            memory: 512M
            cpus: '0.5'
    postgres:
      deploy:
        resources:
          limits:
            memory: 256M
            cpus: '0.5'
  ```

* **10.5. Database Superuser Restrictions:** The default `postgres` superuser should never be the application's runtime user. Create a dedicated, limited-privilege user for the application:

  ```sql
  -- In seed.sql — create a limited app user, never use superuser at runtime
  CREATE USER app_user WITH PASSWORD 'strong_password_here';
  GRANT CONNECT ON DATABASE myapp_db TO app_user;
  GRANT USAGE ON SCHEMA public TO app_user;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
  ```

  In `docker-compose.yml`, the application connects as `app_user`, not `postgres`. The `postgres` superuser is only used for administrative tasks.

* **10.6. Sensitive Data in Shell History:** Any credential typed directly in the terminal (e.g., in a `psql -c "ALTER USER postgres PASSWORD 'xxx'"` command) is stored in bash history in plaintext. After any operation that involves credentials in the terminal:

  ```bash
  history -c && history -w
  ```

  For recurring operations, use script files or environment variables instead of inline credentials.

* **10.7. Regular Security Audit Commands:** Run these periodically on any production server to detect anomalies early:

  ```bash
  # Who is consuming CPU right now?
  ps aux --sort=-%cpu | head -15

  # What containers are using the most resources?
  docker stats --no-stream

  # Are there unexpected open ports?
  ss -tunlp

  # Are there outbound connections to unknown IPs?
  netstat -tunp | grep ESTABLISHED

  # Check for recently modified files in web directories (last 7 days)
  find /var/www/ -type f -mtime -7 -ls

  # Check for PHP files with obfuscated/dangerous code patterns
  grep -rl "eval(base64_decode\|shell_exec\|system(" /var/www/ 2>/dev/null

  # Check database users in PostgreSQL
  docker exec -it <postgres_container> psql -U postgres -c "\du"

  # Check for unexpected WordPress admin users (if applicable)
  # SELECT ID, user_login, user_registered FROM wp_users ORDER BY user_registered DESC;
  ```

* **10.8. Environment Isolation — Never Mix Production and Development on the Same Server:** Do not run proof-of-concept containers, demos, or experimental services on the same droplet as production applications. Each environment should have its own server. If cost is a constraint, at minimum:
  * Demo/staging containers must have `127.0.0.1:` port bindings (never `0.0.0.0`).
  * Demo databases must have strong passwords, even if the data is disposable.
  * Demo services must not share networks with production containers in `docker-compose.yml`.

* **10.9. Incident Response Checklist:** If anomalous behavior is detected (high CPU, unexpected connections, unknown processes), execute in this order:

  1. Identify the culpable process: `cat /proc/<PID>/cgroup | grep docker`
  2. Identify outbound connections: `netstat -tunp | grep -v LISTEN`
  3. Block suspicious IP ranges immediately: `ufw deny from <IP_RANGE>`
  4. Check database for unauthorized users and functions:
     ```sql
     -- PostgreSQL
     SELECT * FROM pg_roles WHERE rolsuper = true;
     SELECT routine_name FROM information_schema.routines WHERE routine_schema NOT IN ('pg_catalog','information_schema');
     SELECT evtname FROM pg_event_trigger;
     ```
  5. Check web directories for new/modified files: `find /var/www/ -type f -mtime -1`
  6. Rotate all credentials (database passwords, API keys, OAuth secrets)
  7. Take a server snapshot before making changes (preserves forensic evidence)
  8. Clean and harden, then take a second snapshot of the clean state
