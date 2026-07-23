# SWARM ↔ emPOWER — Shared Login & Connectivity Details

**Audience:** emPOWER ERP team + SWARM / nanoFarm team  
**Date:** 2026-07-23  
**Status:** SSO consumer implemented — **awaiting emPOWER staging credentials**  
**Related:** [EMPOWER_CENTRALIZED_AUTH.md](./EMPOWER_CENTRALIZED_AUTH.md), emPOWER reply `SWARM_CENTRALIZED_AUTH_REPLY.md`

---

## Decision alignment (confirmed)

| Product | Identity / login |
|---------|------------------|
| **SWARM** + **emPOWER SaaS** | **emPOWER SaaS** at `accounts.empowerapp.in` — SWARM is consumer only |
| **BIOPOWER** (standalone IoT deployments) | **Separate** — keeps its own `users` table and JWT auth |
| **emPOWER ↔ SWARM telemetry (P2)** | **Unchanged** — Partner API (`/api/partner/v1`) with org API keys; **not** user login |

**SWARM does not connect directly to the SaaS identity Postgres.** Auth-code exchange at `accounts.empowerapp.in/api/oauth/token` is the integration boundary.

---

## 1. Connection string — current SWARM app DB (IoT data, not shared login yet)

This is SWARM’s **application database** (`biopower_db`) — plants, sensors, readings, alerts, and today’s local `users` table.

### Local dev (H2, no Docker)

```
jdbc:h2:file:./data/biopower_db;DB_CLOSE_DELAY=-1;MODE=MySQL;DATABASE_TO_LOWER=TRUE
User: sa
Password: (empty)
Profile: spring.profiles.active=dev
```

### Docker / MySQL (default `docker-compose.yml`)

```
jdbc:mysql://<DB_HOST>:3306/biopower_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
User: biopower
Password: biopower123   (change in production)
```

### API base URL (local)

```
http://localhost:8080/api
```

> **Important:** This is **not** the shared SaaS identity DB. Do **not** point emPOWER login at `biopower_db` until we publish the shared identity schema and connection string.

---

## 2. emPOWER SaaS identity — consumer integration (implemented)

SWARM does **not** provision or migrate the shared identity DB. emPOWER SaaS owns the schema (Prisma on Railway Postgres).

| Item | Value |
|------|-------|
| Auth host | `https://accounts.empowerapp.in` |
| Token exchange | `POST /api/oauth/token` (server-to-server) |
| SWARM client id | `swarm_webapp` |
| Callback | `https://app.swarm.co.in/auth/callback` |
| Local link column | `users.identity_user_id` in `biopower_db` |

Set `IDENTITY_MODE=saas` and `SAAS_CLIENT_SECRET` from emPOWER to enable production SSO.

---

## 3. Who owns migrations

| Database | Owner today | Notes |
|----------|-------------|-------|
| `biopower_db` (SWARM app) | **SWARM team** | `database/schema.sql` + Hibernate `ddl-auto: update` |
| Shared identity DB | **emPOWER SaaS** (Prisma / Railway Postgres) | SWARM consumes via OAuth token exchange only |
| Partner API keys (`partner_*` tables) | **SWARM team** | Stays in `biopower_db` — not in shared identity DB |

Until shared DB exists, SWARM continues to authenticate against **local `users`** in `biopower_db`.

---

## 4. Password hash (today + target for shared DB)

| Item | SWARM today | Target for shared login |
|------|-------------|-------------------------|
| Algorithm | **BCrypt** (`BCryptPasswordEncoder`, Spring Security) | **BCrypt** (must match emPOWER SaaS) |
| Stored field | `users.password` VARCHAR(255) | Same column name preferred |
| Rounds / strength | **BCrypt strength 12** | Matches emPOWER SaaS (`passwordHash`, rounds 12) |
| Pepper / HMAC | **None** | Confirm if emPOWER adds pepper |
| Login identifier | **Email** (unique) | Email as primary username |

### Sample login flow (today)

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@biopower.com",
  "password": "admin123"
}
```

Response includes JWT Bearer token (HS256, SWARM-issued).

### JWT (SWARM-issued, separate from shared DB)

| Setting | Value |
|---------|-------|
| Header | `Authorization: Bearer <token>` |
| Algorithm | **HS256** |
| Claims | `sub` (user id), `email`, `role` |
| Secret | env `JWT_SECRET` (min 256 bits in production) |
| TTL | `JWT_EXPIRATION` default **86400000 ms (24h)** |

Shared login does **not** mean shared JWT secret — each app can still issue its own session/JWT after validating against the shared identity DB.

---

## 5. OAuth / MFA

| Feature | SWARM today | Shared login plan |
|---------|-------------|-------------------|
| OAuth2 / OIDC | **Implemented** (auth-code via emPOWER SaaS) | `IDENTITY_MODE=saas` |
| SSO (emPOWER ↔ SWARM UI) | **Implemented** | `/auth/sso/*` + `/auth/callback` |
| MFA (TOTP / SMS) | **Honored at token exchange** | Rejects if `mfaEnabled` && !`mfaVerified` |
| Forgot password email | Scaffold only (logs, no SMTP send) | emPOWER SaaS may own reset flow |

**For P2:** No OAuth/MFA dependency. Partner telemetry uses **API keys**, not user login.

---

## 6. User model (SWARM `users` table today — reference for shared schema)

```sql
users (
  id BIGINT PK,
  identity_user_id VARCHAR(36) UNIQUE,  -- emPOWER SaaS user id (SSO)
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE,
  mobile VARCHAR(20),
  password VARCHAR(255),        -- BCrypt hash (local mode) or placeholder (saas mode)
  role ENUM('SUPER_ADMIN','PLANT_ADMIN','OPERATOR'),
  status ENUM('ACTIVE','INACTIVE','DISABLED'),
  created_at TIMESTAMP
)
```

**Swarm-specific data stays in SWARM app DB:**

- `user_plants`, `user_sensor_nodes` — **not** synced to emPOWER
- emPOWER hub membership / Manager deny — **emPOWER-only** (per prior integration contract)

---

## 7. What emPOWER can use today (no shared login required)

**Partner Telemetry API** (already implemented):

```
Base: http://<swarm-host>:8080/api/partner/v1
Auth: Authorization: Bearer <api_key>
```

| Field | Sandbox value |
|-------|----------------|
| API key | `swk_sandbox_biopower_dev_2026` |
| Organization id | `org_biopower_pilot` |

Health check:

```bash
curl -H "Authorization: Bearer swk_sandbox_biopower_dev_2026" \
  http://localhost:8080/api/partner/v1/health
```

Full reference: [PARTNER_API.md](./PARTNER_API.md)

This is **server-to-server** — independent of shared user login.

---

## 8. What we need from emPOWER to finish SSO in production

1. `SAAS_CLIENT_SECRET` for `client_id=swarm_webapp` (staging + production)
2. Confirm **token exchange JSON** shape from `/api/oauth/token`
3. Confirm **app-picker** redirect URL for SWARM
4. Staging access to `accounts.empowerapp.in` for end-to-end test
5. Confirmation that **BIOPOWER** stays on a **separate** identity path

---

## 9. One-line summary

> SWARM consumes **emPOWER SaaS** identity at `accounts.empowerapp.in` via auth-code exchange. Local `biopower_db` holds app data + `identity_user_id` link. Partner telemetry uses API keys independently. Production SSO awaits `SAAS_CLIENT_SECRET` from emPOWER.

---

## Related docs

- [EMPOWER_CENTRALIZED_AUTH.md](./EMPOWER_CENTRALIZED_AUTH.md) — SSO implementation details
- [PARTNER_API.md](./PARTNER_API.md) — emPOWER telemetry integration (P2)
- [API.md](./API.md) — SWARM user-facing REST API
- [SWARM_Project_Working_Flow.pdf](./SWARM_Project_Working_Flow.pdf) — end-to-end product workflow
