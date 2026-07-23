# emPOWER SaaS Centralized Auth — SWARM Implementation

**Audience:** SWARM + emPOWER teams  
**Date:** 2026-07-23  
**Status:** Implemented (consumer mode); awaiting emPOWER staging credentials

---

## Architecture (per emPOWER reply)

| Item | Value |
|------|-------|
| Identity SoT | **emPOWER SaaS** at `accounts.empowerapp.in` |
| Shared identity DB | emPOWER SaaS Railway Postgres (SWARM does **not** own schema) |
| SWARM app | `app.swarm.co.in` |
| SWARM marketing | `swarm.co.in` → redirects auth to SaaS |
| BIOPOWER | `erp.empowerbpg.com` — **separate**, not in shared login |
| Partner telemetry | `/api/partner/v1` — org API keys, **unchanged** |

---

## Flow

1. User clicks Sign In/Up on `swarm.co.in` or `app.swarm.co.in`
2. Browser redirects to `accounts.empowerapp.in/login|signup?client_id=swarm_webapp&app=swarm_webapp&redirect_uri=...`
3. User authenticates at emPOWER SaaS (email, Google, MFA if required)
4. SaaS redirects to `app.swarm.co.in/auth/callback?code=...`
5. React calls `POST /api/auth/sso/callback` with the code
6. Spring Boot exchanges code at `accounts.empowerapp.in/api/oauth/token` (server-to-server)
7. Backend upserts local `users` row via `identity_user_id`, issues SWARM JWT (HS256)
8. User lands on dashboard; plants/sensors/alerts remain in `biopower_db`

---

## Configuration

```yaml
# application.yml
biopower:
  identity:
    mode: ${IDENTITY_MODE:local}   # local | saas
    saas:
      accounts-url: ${SAAS_ACCOUNTS_URL:https://accounts.empowerapp.in}
      client-id: ${SAAS_CLIENT_ID:swarm_webapp}
      client-secret: ${SAAS_CLIENT_SECRET:}
      app-url: ${SAAS_APP_URL:http://localhost:3000}
      token-path: /api/oauth/token
```

| Mode | Behavior |
|------|----------|
| `local` | Email/password login against `biopower_db.users` (dev default) |
| `saas` | Login/signup/change-password blocked; SSO only via emPOWER SaaS |

---

## API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/auth/sso/config` | Public | Returns `saasEnabled`, accounts URL, callback path |
| GET | `/api/auth/sso/login-url` | Public | SaaS authorize URL for login |
| GET | `/api/auth/sso/signup-url` | Public | SaaS authorize URL for signup |
| POST | `/api/auth/sso/callback` | Public | Body: `{ "code": "..." }` → SWARM JWT |

Local auth (`/api/auth/login`, `/api/auth/signup`) returns HTTP 400 in `saas` mode with message to use `accounts.empowerapp.in`.

---

## Local user provisioning

```sql
users.identity_user_id VARCHAR(36) UNIQUE  -- links to emPOWER SaaS user id
```

- Match order: `identity_user_id` → `email` → create new user
- New SSO users get `OPERATOR` role, `ACTIVE` status
- `user_plants` / `user_sensor_nodes` stay SWARM-only

---

## Security

- BCrypt strength **12** (aligned with emPOWER SaaS `passwordHash`)
- MFA: token exchange rejects if `mfaEnabled=true` and `mfaVerified=false`
- SWARM JWT remains separate (own `JWT_SECRET`, 24h TTL)
- CORS: `biopower.cors.allowed-origins` includes app + marketing origins

---

## Frontend files

| File | Purpose |
|------|---------|
| `frontend/src/utils/sso.js` | Load config, redirect to SaaS |
| `frontend/src/pages/AuthCallback.jsx` | Handle `/auth/callback?code=` |
| `frontend/src/pages/Login.jsx` | Auto-redirect when SaaS enabled |
| `frontend/src/pages/Signup.jsx` | Auto-redirect when SaaS enabled |

---

## swarm_website (`swarm.co.in`)

`js/auth.js` with `USE_LOCAL_AUTH=false`:

- Sign In/Up → `accounts.empowerapp.in`
- `empower.html` — no auth gate (marketing demo)
- Set `USE_LOCAL_AUTH=true` only for offline demos

---

## Pending from emPOWER

1. `SAAS_CLIENT_SECRET` for staging/production
2. Confirm exact JSON shape from `/api/oauth/token`
3. Confirm app-picker card URL for SWARM
4. Staging `accounts.empowerapp.in` access for integration test

---

## Related docs

- [EMPOWER_SHARED_LOGIN_CONNECTIVITY.md](./EMPOWER_SHARED_LOGIN_CONNECTIVITY.md) — connectivity + DB details
- [PARTNER_API.md](./PARTNER_API.md) — telemetry (independent of user SSO)
- `swarm_website/CENTRALIZED_AUTH_PLAN.md` — revised architecture plan
