# Installation Guide

## Prerequisites

- Docker & Docker Compose (recommended)
- OR: Java 17, Maven 3.8+, Node.js 18+, MySQL 8.0

---

## Option 1: Docker Deployment (Recommended)

### Step 1: Clone and Start

```bash
git clone <repository-url>
cd swarm_webapp
docker-compose up -d
```

### Step 2: Verify Services

```bash
docker-compose ps
```

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 80 | React dashboard |
| Backend | 8080 | Spring Boot API |
| MySQL | 3306 | Database |
| MQTT | 1883 | Mosquitto broker |

### Step 3: Access Application

Open http://localhost and login with `swarm.nfi@gmail.com` / `Swarm@2026`

---

## Option 2: Manual Installation

### Database Setup

**PowerShell:**
```powershell
Get-Content .\database\schema.sql -Raw | mysql -u root -p
```

**Command Prompt:**
```cmd
mysql -u root -p < database\schema.sql
```

Create user:
```sql
CREATE USER 'biopower'@'localhost' IDENTIFIED BY 'biopower123';
GRANT ALL PRIVILEGES ON biopower_db.* TO 'biopower'@'localhost';
```

### Backend

**Windows (PowerShell):**
```powershell
cd backend
$env:DB_HOST="localhost"; $env:DB_USER="biopower"; $env:DB_PASSWORD="biopower123"
.\mvnw.cmd spring-boot:run
```

**Linux/macOS:**
```bash
cd backend
export DB_HOST=localhost DB_USER=biopower DB_PASSWORD=biopower123
./mvnw spring-boot:run
```

> **Note:** In PowerShell you must use `.\mvnw.cmd` (with `.\`) to run the script from the current folder.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### MQTT Broker (Optional)

Install Mosquitto:
```bash
# Ubuntu/Debian
sudo apt install mosquitto mosquitto-clients

# Start broker
mosquitto -c docker/mosquitto/mosquitto.conf
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| DB_HOST | localhost | MySQL host |
| DB_PORT | 3306 | MySQL port |
| DB_NAME | biopower_db | Database name |
| DB_USER | biopower | Database user |
| DB_PASSWORD | biopower123 | Database password |
| JWT_SECRET | (see application.yml) | JWT signing key |
| MQTT_BROKER | tcp://localhost:1883 | MQTT broker URL |
| SERVER_PORT | 8080 | API port |
| CORS_ORIGINS | http://localhost:3000 | Allowed origins |

---

## HTTPS Configuration

For production, place Nginx with SSL in front:

```nginx
server {
    listen 443 ssl;
    ssl_certificate /etc/ssl/certs/biopower.crt;
    ssl_certificate_key /etc/ssl/private/biopower.key;
    
    location / {
        proxy_pass http://localhost:80;
    }
    location /api/ {
        proxy_pass http://localhost:8080/api/;
    }
}
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Docker Desktop is unable to start` | See [Docker Desktop fix](#docker-desktop-wont-start) below, or use [local MySQL](#option-b-local-mysql-without-docker) |
| `no configuration file provided` | Run `docker compose` from `C:\Users\seena\swarm_webapp`, not your home folder |
| Backend won't start | Check MySQL is running and credentials match |
| CORS errors | Add frontend URL to CORS_ORIGINS |
| MQTT connection failed | Verify Mosquitto is running on port 1883 |
| No sample data | Delete DB volume and restart: `docker compose down -v && docker compose up -d` |

### Docker Desktop won't start

1. **Restart Docker Desktop** from the Start menu (run as Administrator).
2. **Enable WSL 2** (required on Windows 10/11):
   ```powershell
   wsl --install
   ```
   Reboot, then open Docker Desktop → Settings → General → enable **Use the WSL 2 based engine**.
3. **Check virtualization** is enabled in BIOS (Intel VT-x / AMD-V).
4. If it still fails, use **local MySQL** below instead of Docker.

### Option B: Local MySQL (without Docker)

> **Don't have MySQL installed?** Use the [Quick Dev Mode](#quick-dev-mode-no-mysql-no-docker) below instead.

1. Download and install [MySQL 8 Community Server](https://dev.mysql.com/downloads/mysql/).
2. During setup, set root password and start MySQL as a Windows service.
3. Create the database:

   **PowerShell:**
   ```powershell
   Get-Content .\database\schema.sql -Raw | mysql -u root -p
   ```

   **Command Prompt (cmd):**
   ```cmd
   mysql -u root -p < database\schema.sql
   ```
4. Create the app user (in MySQL shell or Workbench):
   ```sql
   CREATE USER 'biopower'@'localhost' IDENTIFIED BY 'biopower123';
   GRANT ALL PRIVILEGES ON biopower_db.* TO 'biopower'@'localhost';
   FLUSH PRIVILEGES;
   ```
5. Start the backend:
   ```powershell
   cd C:\Users\seena\swarm_webapp\backend
   .\mvnw.cmd spring-boot:run
   ```
6. Start the frontend (separate terminal):
   ```powershell
   cd C:\Users\seena\swarm_webapp\frontend
   npm run dev
   ```
   Open **http://localhost:3000**

### Quick Dev Mode (no MySQL, no Docker)

If MySQL and Docker are not installed, run with an in-memory H2 database:

```powershell
# Terminal 1 – backend
cd C:\Users\seena\swarm_webapp\backend
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=dev"

# Terminal 2 – frontend
cd C:\Users\seena\swarm_webapp\frontend
npm run dev
```

Open **http://localhost:3000** — login: `swarm.nfi@gmail.com` / `Swarm@2026`

Sample data is created automatically on first startup.
