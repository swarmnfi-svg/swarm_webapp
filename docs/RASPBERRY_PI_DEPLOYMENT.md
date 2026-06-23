# Raspberry Pi Deployment Guide

Deploy BIOPOWER on Raspberry Pi 4/5 for edge-based plant monitoring.

---

## Hardware Requirements

- Raspberry Pi 4 (4GB+ RAM recommended) or Pi 5
- 32GB+ microSD card (Class 10)
- Stable power supply (5V 3A)
- Ethernet or WiFi connection
- Optional: External USB SSD for database storage

---

## Step 1: Prepare Raspberry Pi OS

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Reboot
sudo reboot
```

---

## Step 2: Deploy BIOPOWER

```bash
# Clone project
git clone <repository-url> /home/pi/biopower
cd /home/pi/biopower

# Start services
docker compose up -d
```

---

## Step 3: Configure Static IP (Recommended)

Edit `/etc/dhcpcd.conf`:
```
interface eth0
static ip_address=192.168.1.100/24
static routers=192.168.1.1
static domain_name_servers=8.8.8.8
```

---

## Step 4: Connect IoT Sensors

### ESP32 via MQTT

Configure ESP32 to publish to Pi's MQTT broker:

```cpp
const char* mqtt_server = "192.168.1.100";  // Pi IP
const char* topic = "biopower/sensors/plant1";

// Publish JSON:
// {"plantId":1,"nodeId":1,"sensorType":"TEMPERATURE","value":38.5}
```

### Raspberry Pi as Sensor Node

```python
import requests
import time

API_URL = "http://192.168.1.100:8080/api/iot/data"

while True:
    data = {
        "plantId": 1,
        "nodeId": 1,
        "sensorType": "TEMPERATURE",
        "value": read_sensor()
    }
    requests.post(API_URL, json=data)
    time.sleep(60)
```

---

## Step 5: Auto-Start on Boot

Docker Compose services restart automatically. Verify:

```bash
sudo systemctl enable docker
docker compose ps
```

---

## Step 6: Performance Optimization

### Reduce Memory Usage

Edit `docker-compose.yml` for Pi:

```yaml
backend:
  environment:
    JAVA_OPTS: "-Xmx512m -Xms256m"
mysql:
  command: --innodb-buffer-pool-size=128M
```

### Use External Storage

Mount USB SSD for MySQL data:
```yaml
volumes:
  - /mnt/ssd/mysql:/var/lib/mysql
```

---

## Step 7: Remote Access

### Option A: Port Forwarding
Forward ports 80 and 8080 on your router to Pi's IP.

### Option B: VPN
Use WireGuard or Tailscale for secure remote access.

### Option C: Cloud Sync
Configure backend to also push data to cloud VPS for backup.

---

## Monitoring Pi Health

```bash
# Check container status
docker compose logs -f backend

# System resources
htop

# Disk usage
df -h

# Temperature
vcgencmd measure_temp
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Out of memory | Increase swap: `sudo dphys-swapfile swapoff && sudo nano /etc/dphys-swapfile` set CONF_SWAPSIZE=2048 |
| Slow startup | Normal on Pi; wait 2-3 minutes after boot |
| MQTT not connecting | Check firewall: `sudo ufw allow 1883` |
| Database corruption | Restore from backup volume |

---

## Backup Strategy

```bash
# Daily database backup cron
0 2 * * * docker exec biopower-mysql mysqldump -u biopower -pbiopower123 biopower_db > /home/pi/backups/db_$(date +\%Y\%m\%d).sql
```
