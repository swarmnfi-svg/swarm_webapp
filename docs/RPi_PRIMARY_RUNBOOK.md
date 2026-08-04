# Raspberry Pi Primary Runbook

**Architecture:** RPi runs the live SWARM stack (app + API + MySQL). Railway is a warm standby. Cloudflare routes traffic based on health checks.

**Repo:** `swarmnfi-svg/swarm_webapp` — branch `main`

---

## 1. Hardware requirements

| Item | Recommendation |
|------|----------------|
| Board | Raspberry Pi 4 or 5 |
| RAM | 4–8 GB |
| Storage | USB SSD boot (not SD-only for MySQL) |
| Network | Static LAN IP; internet for Cloudflare Tunnel |
| Power | Official PSU; UPS recommended |

---

## 2. OS and SSD setup

1. Flash **Raspberry Pi OS (64-bit)** to USB SSD.
2. Enable SSH: `sudo raspi-config` → Interface Options → SSH.
3. Set static LAN IP (router DHCP reservation or `/etc/dhcpcd.conf`).
4. Mount SSD data path:

```bash
sudo mkdir -p /mnt/ssd/swarm/mysql /mnt/ssd/swarm/backups
sudo chown -R 999:999 /mnt/ssd/swarm/mysql   # mysql container user
```

5. Install Docker:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out and back in
sudo apt install -y docker-compose-plugin mysql-client
```

---

## 3. Clone and configure

```bash
git clone git@github.com:swarmnfi-svg/swarm_webapp.git
cd swarm_webapp
cp .env.rpi.example .env.rpi
nano .env.rpi
```

**Critical values in `.env.rpi`:**

| Variable | Example | Notes |
|----------|---------|-------|
| `SWARM_PUBLIC_API_URL` | `https://api.swarm.co.in/api` | ESP + pairing use this |
| `VITE_API_URL` | `https://api.swarm.co.in/api` | Frontend build arg |
| `JWT_SECRET` | (same as Railway) | Required for failover sessions |
| `SWARM_MYSQL_DATA_DIR` | `/mnt/ssd/swarm/mysql` | Persist DB on SSD |
| `RAILWAY_MYSQL_*` | From Railway dashboard | For hourly sync script |

Load env when starting compose:

```bash
export $(grep -v '^#' .env.rpi | xargs)
docker compose -f docker-compose.rpi.yml --env-file .env.rpi up -d --build
```

Check health:

```bash
curl -s http://localhost:8080/api/health
curl -s http://localhost:80
```

---

## 4. Cloudflare Tunnel (public access)

Preferred over port-forwarding for RPi primary.

1. Install `cloudflared` on Pi.
2. Create tunnel in Cloudflare Zero Trust dashboard.
3. Route hostnames:
   - `api.swarm.co.in` → `http://localhost:8080` (backend)
   - `app.swarm.co.in` → `http://localhost:80` (frontend) — or keep app on Railway until cutover
4. Ensure `SWARM_PUBLIC_API_URL` and `VITE_API_URL` use `https://api.swarm.co.in/api`.

See [CLOUDFLARE_FAILOVER.md](CLOUDFLARE_FAILOVER.md) for health checks and failover pools.

---

## 5. ESP device pairing

- **Connect Device** page talks **directly** to ESP on LAN (`frontend/src/utils/espClient.js`). Your PC must be on the same Wi-Fi as the ESP.
- ESP stores `SWARM_PUBLIC_API_URL` from pairing — must be a **public** URL (tunnel or `api.swarm.co.in`), never `localhost`.
- If Wi-Fi setup fails, join ESP hotspot `SWARM-Setup-{chipId}` and open `http://192.168.4.1/setup`.
- Re-flash firmware from `firmware/swarm_esp8266_hub/` after pulling latest `main`.

---

## 6. Hourly DB sync to Railway

Railway standby should stay ≤1 hour behind primary.

### Get Railway MySQL credentials

In Railway dashboard → MySQL service → Connect → TCP Proxy (or `railway variables`).

Set in `.env.rpi`:

```env
RAILWAY_MYSQL_HOST=containers-us-west-xxx.railway.app
RAILWAY_MYSQL_PORT=xxxx
RAILWAY_MYSQL_USER=root
RAILWAY_MYSQL_PASSWORD=...
RAILWAY_MYSQL_DATABASE=railway
SYNC_BACKUP_DIR=/mnt/ssd/swarm/backups
```

### Test sync

```bash
chmod +x scripts/sync-to-railway.sh
./scripts/sync-to-railway.sh --dry-run
./scripts/sync-to-railway.sh --dump-only   # local backup only first
./scripts/sync-to-railway.sh               # full dump + Railway restore
```

### Cron (hourly)

```bash
crontab -e
```

Add:

```cron
0 * * * * cd /home/pi/swarm_webapp && ./scripts/sync-to-railway.sh >> /var/log/swarm-sync.log 2>&1
```

**Data gap on failover:** up to 1 hour of telemetry unless you add a 15-minute incremental sync.

---

## 7. Normal operations

| Role | Host | Env |
|------|------|-----|
| **Primary** | Raspberry Pi | `SWARM_DEPLOYMENT_ROLE=primary` |
| **Standby** | Railway | `SWARM_DEPLOYMENT_ROLE=standby` |

- Traffic → RPi via Cloudflare (when healthy)
- ESP → RPi API (LAN or tunnel URL)
- Hourly cron syncs DB → Railway
- Railway runs slim: 512 MB backend, 256 MB frontend, JVM capped

---

## 8. Failover (RPi down)

1. Cloudflare health check fails on RPi (~20–30s with 10s interval).
2. Traffic routes to Railway standby pool.
3. ESP continues posting if using stable hostname `api.swarm.co.in`.
4. Users may lose up to 1 hour of data (last sync).

---

## 9. Failback (RPi recovered)

1. Start RPi stack: `docker compose -f docker-compose.rpi.yml up -d`
2. Verify `/api/health` on RPi.
3. Run one-way sync RPi → Railway to realign standby:
   ```bash
   ./scripts/sync-to-railway.sh
   ```
4. Cloudflare marks primary pool healthy; traffic returns to RPi.

---

## 10. Resource limits (RPi compose)

| Service | Memory limit |
|---------|--------------|
| MySQL | 1.5 GB |
| Backend | 512 MB (`-Xmx384m`) |
| Frontend | 128 MB |

---

## 11. Troubleshooting

| Issue | Fix |
|-------|-----|
| Backend OOM on Pi | Check `docker stats`; reduce plants or retention days |
| ESP can't reach API | `SWARM_PUBLIC_API_URL` must be public HTTPS URL |
| Connect Device spinner | PC must be on same LAN as ESP; use setup AP fallback |
| JWT invalid after failover | Ensure same `JWT_SECRET` on RPi and Railway |
| Railway restore fails | Test with `--dump-only` first; verify TCP proxy credentials |

---

## Related docs

- [RAILWAY_HOSTING.md](RAILWAY_HOSTING.md) — Railway standby env vars
- [CLOUDFLARE_FAILOVER.md](CLOUDFLARE_FAILOVER.md) — health monitors and pools
