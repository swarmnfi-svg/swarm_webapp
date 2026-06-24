# Railway Deployment — Fix 502 Errors

## Why you see 502

Railway shows **deploy success** but **502 Bad Gateway** when:

1. **Wrong root folder** — Railway built the repo root, not `backend/` or `frontend/`
2. **Wrong port** — App listens on 8080/80 but Railway expects `$PORT`
3. **Backend crashed** — MySQL env vars missing → app exits after deploy
4. **Frontend API URL** — Not set → login fails (different from 502)

---

## Fix your current service (`rare-passion`)

### If this should be the **Backend API**

1. Railway → **rare-passion** → **Settings**
2. Set **Root Directory** → `backend`
3. Set **Builder** → Dockerfile
4. **Variables** tab — add:

```
DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_NAME=${{MySQL.MYSQLDATABASE}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
SERVER_PORT=${{PORT}}
JWT_SECRET=change-this-to-a-long-random-secret-key-32chars-min
MQTT_ENABLED=false
CORS_ORIGINS=https://YOUR-FRONTEND-URL.up.railway.app
```

Replace `MySQL` with your MySQL service name if different.

5. **Deploy** → **Redeploy**
6. Open **Deployments** → click latest → **View Logs**
   - Look for: `Started BiopowerApplication`
   - If you see MySQL errors → fix DB variables

7. Test: `https://rare-passion-production-fc1a.up.railway.app/api/auth/login`

### If this should be the **Frontend**

1. **Settings** → **Root Directory** → `frontend`
2. **Variables**:

```
VITE_API_URL=https://YOUR-BACKEND-URL.up.railway.app/api
```

3. Redeploy

---

## Recommended: 2 services + MySQL

| Service | Root Directory | Purpose |
|---------|----------------|---------|
| MySQL | (template) | Database |
| backend | `backend` | API |
| frontend | `frontend` | React UI |

1. Keep **MySQL** as is
2. Configure **rare-passion** as **backend** (steps above)
3. **+ New** → same repo → name `frontend` → root `frontend`
4. Set `VITE_API_URL` on frontend to backend URL
5. Set `CORS_ORIGINS` on backend to frontend URL
6. Redeploy both

---

## Check deploy logs (most important)

1. Click **rare-passion** → **Deployments**
2. Click the active deployment → **View Logs**

| Log message | Meaning |
|-------------|---------|
| `Started BiopowerApplication` | Backend OK |
| `Communications link failure` | Fix MySQL variables |
| `Port 8080 was already in use` | Set `SERVER_PORT=${{PORT}}` |
| `Application run failed` | Read stack trace above |
| Nginx started | Frontend OK |

---

## After code fix — push to GitHub

```powershell
cd C:\Users\seena\swarm_webapp
git add backend/Dockerfile frontend/Dockerfile frontend/nginx.conf.template frontend/docker-entrypoint.sh backend/railway.toml frontend/railway.toml docs/RAILWAY_DEPLOYMENT.md
git commit -m "Fix Railway port and deployment config"
git push swarm main
```

Railway will auto-redeploy.

---

## Login credentials (after backend is healthy)

- Email: `admin@biopower.com`
- Password: `admin123`
