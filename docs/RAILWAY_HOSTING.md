# SWARM Production Hosting (Railway)

**Last verified:** 2026-07-30

This is the **active production** Railway project. Do not use the old `modest-nurturing` / `rare-passion` project (expired trial).

---

## Railway project

| Item | Value |
|------|-------|
| **Project name** | SWARM_SaaS |
| **Project ID** | `b950f324-280f-4cce-aee6-147f0dfd08e5` |
| **Workspace** | arunbiopower's Projects |
| **Environment** | production |
| **Dashboard** | https://railway.com/project/b950f324-280f-4cce-aee6-147f0dfd08e5 |

### Link CLI to this project

```powershell
railway link -p b950f324-280f-4cce-aee6-147f0dfd08e5 -e production
```

---

## Services (all Online)

| Service | Root dir | Public URL | Role |
|---------|----------|------------|------|
| **MySQL** | (template) | internal: `mysql.railway.internal` | Database |
| **backend** | `backend` | https://backend-production-a841.up.railway.app | Spring Boot API (`/api`) |
| **swarm_webapp** | `frontend` | https://app.swarm.co.in | React UI + Capacitor APK |

```
MySQL ──► backend ──► swarm_webapp (app.swarm.co.in)
```

---

## Production URLs

| Purpose | URL |
|---------|-----|
| Web app | https://app.swarm.co.in |
| Plant HMI | https://app.swarm.co.in/plant-hmi |
| Backend API | https://backend-production-a841.up.railway.app/api |
| Marketing site | https://swarm.co.in |

---

## Environment variables (reference)

### backend service

```env
DB_HOST=mysql.railway.internal
DB_PORT=3306
DB_NAME=railway
DB_USER=root
DB_PASSWORD=<from Railway MySQL service>
JWT_SECRET=<set in Railway>
MQTT_ENABLED=false
CORS_ORIGINS=https://app.swarm.co.in,https://localhost,capacitor://localhost
IDENTITY_MODE=saas
SAAS_ACCOUNTS_URL=https://accounts.empowerapp.in
SAAS_CLIENT_ID=swarm_webapp
SAAS_APP_URL=https://app.swarm.co.in

# Nova Space OP — LLM provider failover (set in Railway, never commit values)
NOVA_SPACE_OP_ENABLED=true
NOVA_THINK_ENABLED=true
NOVA_NARRATE_ENABLED=true
GROQ_API_KEY=
GROQ_API_KEY_2=
GROQ_API_KEY_3=
GROQ_API_KEY_4=
OPENROUTER_API_KEY=
OPENROUTER_API_KEY_2=
OPENROUTER_API_KEY_3=
OPENROUTER_API_KEY_4=
GEMINI_API_KEY=
GEMINI_API_KEY_2=
NOVA_GROQ_MODEL=llama-3.3-70b-versatile
NOVA_OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct
NOVA_GEMINI_MODEL=gemini-2.0-flash
```

### swarm_webapp service

```env
VITE_API_URL=https://backend-production-a841.up.railway.app/api
```

The web app and APK call the backend API directly (no nginx `/api` proxy).

---

## Deploy workflow

**Railway auto-deploys from:** `swarmnfi-svg/swarm_webapp` (not `Srinivas0724/swarm_webapp`).

Push to **both** remotes when releasing:

```powershell
cd C:\Users\seena\swarm_webapp
git push origin main    # Srinivas0724 fork
git push swarm main     # Railway production (required)
```

Manual deploy:

```powershell
railway up ./backend --path-as-root -s backend -d -y
railway up ./frontend --path-as-root -s swarm_webapp -d -y
```

---

## Demo logins (Tata Steel plant)

| Role | Email | Password |
|------|-------|----------|
| Super Admin | swarm.nfi@gmail.com | Swarm@2026 |
| Plant Admin | tata.admin@tatasteel.com | TataSteel@2026 |
| Operator | tata.operator@tatasteel.com | TataSteel@2026 |

---

## APK notes

- APK is built with `VITE_API_URL` from `frontend/.env.production` (copy from `.env.production.example`)
- Build via `docs/ANDROID_APK.md` — do not commit debug APKs to the repo
- CORS must include `capacitor://localhost` and `https://localhost` on **backend**

---

## Old project (deprecated)

| Item | Value |
|------|-------|
| Project | modest-nurturing |
| Backend | rare-passion-production-fc1a.up.railway.app |
| Status | Trial expired — do not use |
