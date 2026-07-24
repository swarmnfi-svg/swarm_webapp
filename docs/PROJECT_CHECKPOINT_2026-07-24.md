# Project Checkpoint — 2026-07-24

**Purpose:** Restore point before further changes. If something breaks later, use this doc to recall what existed and how to roll back.

---

## Git restore points (use these to roll back)

### swarm_webapp

| Item | Value |
|------|-------|
| **Tag** | `checkpoint-2026-07-24` |
| **Commit** | `a1ad042` — Redesign login page with dark amber orange theme |
| **Remote** | `swarm` → `git@github-swarm:swarmnfi-svg/swarm_webapp.git` |
| **Branch** | `main` |

**Restore entire repo to this checkpoint:**

```powershell
cd C:\Users\seena\swarm_webapp
git fetch --all
git checkout checkpoint-2026-07-24
```

**Or create a recovery branch from the tag:**

```powershell
git checkout -b recovery-from-checkpoint checkpoint-2026-07-24
```

### swarm_website

| Item | Value |
|------|-------|
| **Tag** | `checkpoint-2026-07-24` |
| **Commit** | `927cf4c` — Redirect marketing site login to app.swarm.co.in |
| **Branch** | `main` |

```powershell
cd C:\Users\seena\swarm_website
git fetch --all
git checkout checkpoint-2026-07-24
```

---

## What was completed by this checkpoint

### 1. emPOWER SaaS centralized auth (consumer mode)

- Identity SoT: `accounts.empowerapp.in` (not `accounts.swarm.co.in`)
- Backend: `EmpowerSaaSAuthClient`, SSO endpoints, `identity_user_id` on users
- Frontend: `AuthCallback.jsx`, `sso.js`, login/signup SSO flow (auto-redirect disabled in latest commits — local login works in dev)
- `IDENTITY_MODE=local|saas` in `application.yml`
- Docs: `EMPOWER_CENTRALIZED_AUTH.md`, `EMPOWER_SHARED_LOGIN_CONNECTIVITY.md`, `SWARM_CENTRALIZED_AUTH_REPLY.md`

### 2. Partner API (emPOWER telemetry)

- `/api/partner/v1/*` with org API keys
- Sandbox key: `swk_sandbox_biopower_dev_2026`
- Doc: `PARTNER_API.md`

### 3. Alerts scoping fix

- Alerts filtered by user's assigned plants

### 4. Railway deployment (swarmnfi-svg account)

| Service | Root dir | URL |
|---------|----------|-----|
| **MySQL** | template | internal: `mysql.railway.internal` |
| **rare-passion** (backend) | `backend` | https://rare-passion-production-fc1a.up.railway.app |
| **swarm_webapp** (frontend) | `frontend` | https://swarmwebapp-production.up.railway.app |

**Project:** `modest-nurturing` (workspace: swarmnfi-svg)

**Backend variables (as of checkpoint):**

```env
DB_HOST=mysql.railway.internal
DB_PORT=3306
DB_NAME=railway
DB_USER=root
DB_PASSWORD=<set in Railway dashboard>
JWT_SECRET=<set in Railway dashboard>
MQTT_ENABLED=false
CORS_ORIGINS=https://swarmwebapp-production.up.railway.app
IDENTITY_MODE=local
```

**Frontend variables:**

```env
VITE_API_URL=https://rare-passion-production-fc1a.up.railway.app/api
```

**Railway CLI:** logged in as `swarm.nfi@gmail.com`

```powershell
& "C:\Users\seena\AppData\Roaming\npm\railway.cmd" link -p modest-nurturing -s rare-passion
& "C:\Users\seena\AppData\Roaming\npm\railway.cmd" up ./backend --path-as-root -s rare-passion -d -y
```

**Important:** Do not deploy from repo root (causes Railpack error). Always use root `backend` or `frontend`.

**Backend Dockerfile port fix (Railway):**

```dockerfile
ENTRYPOINT ["sh", "-c", "java -jar app.jar --server.port=${PORT:-${SERVER_PORT:-8080}}"]
```

Do **not** set empty `SERVER_PORT` in Railway — delete it so `$PORT` is used.

### 5. swarm_website marketing

- `js/auth.js` — redirects Sign In to `app.swarm.co.in` (or emPOWER SaaS depending on commit)
- `empower.html` — no auth gate
- `CENTRALIZED_AUTH_PLAN.md` — revised per emPOWER reply

---

## Local development (unchanged)

```powershell
# Backend
cd backend
.\mvnw.cmd spring-boot:run

# Frontend
cd frontend
npm install
npm run dev
```

- API: http://localhost:8080/api
- UI: http://localhost:3000
- Default login: `admin@biopower.com` / `admin123`

---

## Key files (if you need to re-read implementation)

```
swarm_webapp/
├── backend/
│   ├── Dockerfile                          # Railway PORT fix
│   ├── railway.toml
│   ├── config/IdentityProperties.java
│   ├── config/EmpowerSaaSAuthProperties.java
│   ├── service/EmpowerSaaSAuthClient.java
│   ├── service/AuthService.java
│   └── controller/AuthController.java
├── frontend/
│   ├── Dockerfile
│   ├── railway.toml
│   ├── src/pages/AuthCallback.jsx
│   ├── src/utils/sso.js
│   └── src/context/AuthContext.jsx
├── database/schema.sql                     # identity_user_id column
└── docs/
    ├── PROJECT_CHECKPOINT_2026-07-24.md    # this file
    ├── EMPOWER_CENTRALIZED_AUTH.md
    ├── EMPOWER_SHARED_LOGIN_CONNECTIVITY.md
    ├── PARTNER_API.md
    └── RAILWAY_DEPLOYMENT.md

swarm_website/
├── js/auth.js
├── empower.html
└── CENTRALIZED_AUTH_PLAN.md
```

---

## Production URLs (target, when domains are wired)

| Host | Role |
|------|------|
| `app.swarm.co.in` | SWARM React app |
| `api.swarm.co.in` | SWARM backend (recommended) |
| `swarm.co.in` | Marketing site |
| `accounts.empowerapp.in` | emPOWER SaaS login |

**SSO production env (when ready):**

```env
IDENTITY_MODE=saas
SAAS_ACCOUNTS_URL=https://accounts.empowerapp.in
SAAS_CLIENT_ID=swarm_webapp
SAAS_CLIENT_SECRET=<from emPOWER>
SAAS_APP_URL=https://app.swarm.co.in
```

---

## Pending (not blocking local dev)

1. `SAAS_CLIENT_SECRET` from emPOWER team
2. End-to-end SSO test on staging
3. Custom domains on Railway (`app.swarm.co.in`, `api.swarm.co.in`)
4. Push checkpoint tag to remote: `git push swarm checkpoint-2026-07-24`

---

## Quick health checks

```powershell
# Backend
curl https://rare-passion-production-fc1a.up.railway.app/api/auth/sso/config

# Frontend
curl -I https://swarmwebapp-production.up.railway.app
```

---

## Conversation reference

Full agent transcript for this work:  
`C:\Users\seena\.cursor\projects\c-Users-seena-swarm-webapp\agent-transcripts\20574696-020a-47f0-994a-8c6ed793e970.jsonl`

---

*Checkpoint created: 2026-07-24. Tag: `checkpoint-2026-07-24` on both repos.*
