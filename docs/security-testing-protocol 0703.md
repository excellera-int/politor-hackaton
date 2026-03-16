# Pre-Delivery Security Testing Protocol
**White Systems Consulting**
*Version 1.0 — Stack: Ubuntu 24.04 · Docker · nginx · PostgreSQL · Neo4j · Node.js/GraphQL · React*

---

## Overview

This protocol defines the minimum security testing steps required before delivering any client application to production. Tests are executed from the developer's local machine targeting the deployment droplet — never from the server itself.

**Estimated time per engagement:** 2–4 hours  
**Required tools:** `nmap`, `hydra`, `nikto`, `wpscan` (if WordPress), `sqlmap`, `curl`

---

## Phase 1 — Reconnaissance

### 1.1 Passive Recon
Before touching the server, gather public information.

```bash
# Check DNS records
dig +short <domain>
dig +short <domain> MX

# Inspect HTTP headers — look for version leaks
curl -I https://<domain>
# Red flags: Server: nginx/x.x.x, X-Powered-By, X-Generator
```

**What to look for:**
- Server/framework versions exposed in headers
- Subdomains that reveal internal infrastructure
- SSL certificate details (expiry, wildcard scope, issuer)

---

## Phase 2 — Port & Service Scanning

### 2.1 Full Port Scan (mandatory — do not skip -p-)
```bash
nmap -sV -sC -p- --open -T4 <DROPLET_IP> -oN ~/scan_<client>_full.txt
```

### 2.2 Evaluate Results

**Ports that should NEVER be public:**

| Port | Service | Action if open |
|------|---------|----------------|
| 5432 | PostgreSQL | Critical — block immediately |
| 7474 | Neo4j HTTP | Critical — block immediately |
| 7687 | Neo4j Bolt | Critical — block immediately |
| 2375/2376 | Docker API | Critical — block immediately |
| 6379 | Redis | Critical — block immediately |
| 27017 | MongoDB | Critical — block immediately |

**Ports that should be proxied through nginx (not direct):**

| Port | Service | Risk if direct |
|------|---------|----------------|
| 5678 | n8n | Workflow/credential exposure |
| 4000 | Node.js/GraphQL | API exposed without WAF |
| 8000–8999 | Internal services | Version info, no rate limiting |

**Verification test for any suspicious port:**
```bash
# Quick connectivity check
nc -zv <DROPLET_IP> <PORT>
# or on Windows:
Test-NetConnection -ComputerName <DROPLET_IP> -Port <PORT>
```

---

## Phase 3 — Docker Compose Audit

### 3.1 Port Binding Check
Review every `ports:` entry in all `docker-compose.yml` files.

```yaml
# WRONG — exposed to all interfaces (0.0.0.0)
ports:
  - "5432:5432"

# CORRECT — bound to localhost only
ports:
  - "127.0.0.1:5432:5432"
```

**Rule:** Databases, internal APIs, and admin services must always use `127.0.0.1:` prefix.

### 3.2 Hardcoded Credentials Check
```bash
# Scan compose files and .env for default/weak credentials
grep -rE "(password|secret|key)\s*=\s*.{1,12}$" . --include="*.yml" --include="*.env"
```

Flag any passwords under 16 characters or using obvious patterns (`postgres`, `admin`, `123456`).

---

## Phase 4 — Firewall Verification

### 4.1 Confirm Defense-in-Depth
Security must not rely on a single layer. Verify both independently:

```
Layer 1: DigitalOcean Cloud Firewall (network level)
Layer 2: docker-compose port bindings (application level)
```

**DigitalOcean Cloud Firewall — minimum ruleset:**

| Inbound Rule | Allowed From |
|-------------|-------------|
| 22 (SSH) | Your office/home IP only |
| 80 (HTTP) | All (redirects to HTTPS) |
| 443 (HTTPS) | All |
| All other ports | DENY |

**Important:** UFW alone is NOT sufficient for Docker deployments. Docker modifies iptables directly and bypasses UFW. Always use the DO Cloud Firewall as the primary network barrier.

---

## Phase 5 — SSH Hardening Check

### 5.1 Verify Key-Based Auth Only
```bash
# Check if password auth is disabled
ssh <user>@<DROPLET_IP> "grep PasswordAuthentication /etc/ssh/sshd_config"
# Expected: PasswordAuthentication no
```

### 5.2 Brute Force Test
```bash
hydra -l root -P /usr/share/wordlists/rockyou.txt \
  ssh://<DROPLET_IP> -t 4 -V -f
```

**Expected result:** All attempts fail. If any succeed, the password policy is critically weak.

---

## Phase 6 — Web Application Scan

### 6.1 Nikto — Quick Surface Scan
```bash
nikto -h https://<domain> -ssl -o ~/nikto_<client>.txt
```

**Key findings to address:**
- Missing security headers (`X-Frame-Options`, `Content-Security-Policy`, `X-Content-Type-Options`)
- Directory listings enabled
- Exposed `.git`, `.env`, or backup files

### 6.2 Security Headers Verification
```bash
curl -sI https://<domain> | grep -iE "(x-frame|x-content|content-security|strict-transport|referrer)"
```

**Required headers for production:**

| Header | Recommended Value |
|--------|-----------------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-Content-Type-Options` | `nosniff` |
| `Content-Security-Policy` | Configured per app |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

---

## Phase 7 — GraphQL API Security

### 7.1 Introspection Check
```bash
curl -X POST https://<domain>/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __schema { types { name } } }"}' | python3 -m json.tool
```

**Introspection must be disabled in production.** If it returns a list of types, any attacker can map the full API schema.

### 7.2 Depth Limit Check
Test whether the API enforces query depth limits by sending a deeply nested query:
```bash
curl -X POST https://<domain>/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ user { friends { friends { friends { friends { name } } } } } }"}'
```

A properly configured API should reject this with a depth limit error.

### 7.3 Rate Limiting Check
```bash
# Send 50 rapid requests and observe responses
for i in $(seq 1 50); do
  curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://<domain>/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}'; 
done
```

Expected: `429 Too Many Requests` after threshold. If all return `200`, rate limiting is not configured.

---

## Phase 8 — SQL Injection Testing

### 8.1 Automated Scan
```bash
# Against a GET endpoint
sqlmap -u "https://<domain>/api/resource?id=1" --dbs --batch

# Against a POST request (captured from browser/ZAP)
sqlmap -r request.txt --level=3 --risk=2 --batch
```

**Use `--risk=2` maximum in pre-production.** `--risk=3` can modify data.

---

## Phase 9 — SSL/TLS Verification

```bash
# Check certificate validity and expiry
curl -vI https://<domain> 2>&1 | grep -iE "(expire|issuer|subject|ssl)"

# Check for weak ciphers (requires openssl)
openssl s_client -connect <domain>:443 2>&1 | grep -iE "(cipher|protocol|verify)"
```

**Certificate must:**
- Not be expired
- Match the domain (no wildcard mismatch)
- Use TLS 1.2+ only

---

## Delivery Checklist

Use this checklist as a final gate before client handoff:

### Infrastructure
- [ ] Full port scan completed — no unexpected open ports
- [ ] All database ports bound to `127.0.0.1` in docker-compose
- [ ] DigitalOcean Cloud Firewall configured and assigned to droplet
- [ ] UFW enabled as secondary layer
- [ ] No default credentials in `.env` or compose files
- [ ] FTP disabled or replaced with SFTP

### SSH
- [ ] `PasswordAuthentication no` in sshd_config
- [ ] Root login disabled (`PermitRootLogin no`)
- [ ] Brute force test passed (all attempts rejected)

### Web Application
- [ ] SSL certificate valid and not expiring within 30 days
- [ ] All required security headers present
- [ ] No sensitive info in HTTP response headers (`Server`, `X-Powered-By`)
- [ ] No exposed `.env`, `.git`, or backup files

### API / GraphQL
- [ ] GraphQL introspection disabled in production
- [ ] Query depth limiting configured
- [ ] Rate limiting active on all endpoints
- [ ] Authentication required on all non-public endpoints

### Database
- [ ] PostgreSQL not reachable from public internet (verified with `nc`/`Test-NetConnection`)
- [ ] Neo4j not reachable from public internet
- [ ] Strong passwords (16+ chars) on all database users

---

## Severity Reference

| Level | Color | Definition | Response Time |
|-------|-------|-----------|---------------|
| Critical | 🔴 | Direct path to data breach or server takeover | Fix before delivery |
| High | 🟠 | Significant risk, exploitable with moderate effort | Fix before delivery |
| Medium | 🟡 | Risk exists but requires specific conditions | Fix within 1 week |
| Low | 🟢 | Defense-in-depth improvement | Fix in next sprint |

---

*Protocol maintained by White Systems Consulting — review and update quarterly or after any major infrastructure change.*
