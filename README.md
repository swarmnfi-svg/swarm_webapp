# BIOPOWER AI-IoT Plant Health Monitoring System

Production-ready web application for monitoring Biogas, Bio-CNG, Sanitation, Organic Waste Treatment, and Waste-to-Energy plants.

## Features

- **Live IoT Monitoring** – Real-time sensor data from ESP32, Raspberry Pi, PLC, MQTT Gateway
- **AI Plant Health Engine** – Detects acidification, overfeeding, gas yield reduction; generates recommendations
- **Alert Management** – Threshold-based alerts with email/SMS/WhatsApp ready notifications
- **Predictive Maintenance** – Equipment failure prediction with remaining useful life
- **Historical Analytics** – Interactive charts with hour/day/week/month filters
- **Multi-Plant Management** – Centralized dashboard for multiple sites
- **Role-Based Access** – Super Admin, Plant Admin, Operator roles

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Material UI, Recharts, Axios |
| Backend | Spring Boot 3, Java 17, JWT, Maven |
| Database | MySQL 8 |
| IoT | MQTT, REST API |
| Deployment | Docker, Nginx |

## Quick Start (Docker)

```bash
docker-compose up -d
```

Access the application at **http://localhost**

### Default Credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@biopower.com | admin123 |
| Plant Admin | manager@biopower.com | manager123 |
| Operator | operator@biopower.com | operator123 |

## Local Development

### Backend

```bash
cd backend
# Windows (no global Maven required)
.\mvnw.cmd spring-boot:run

# Linux/macOS
./mvnw spring-boot:run
```

API runs at `http://localhost:8080/api`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`

## IoT Data Ingestion

### REST API

```bash
POST /api/iot/data
Content-Type: application/json

{
  "plantId": 1,
  "nodeId": 1,
  "sensorType": "PH",
  "value": 7.2,
  "timestamp": "2026-06-20T10:30:00"
}
```

### MQTT

Publish to topic `biopower/sensors/#`:

```json
{
  "plantId": 1,
  "nodeId": 1,
  "sensorType": "TEMPERATURE",
  "value": 38.5,
  "timestamp": "2026-06-20T10:30:00"
}
```

## Project Structure

```
swarm_webapp/
├── backend/          # Spring Boot REST API
├── frontend/         # React dashboard
├── database/         # MySQL schema
├── docker/           # MQTT & deployment configs
├── docs/             # Documentation
└── docker-compose.yml
```

## Documentation

- [Installation Guide](docs/INSTALLATION.md)
- [API Documentation](docs/API.md)
- [User Manual](docs/USER_MANUAL.md)
- [Raspberry Pi Deployment](docs/RASPBERRY_PI_DEPLOYMENT.md)
- [Database ER Diagram](docs/ER_DIAGRAM.md)

## License

Proprietary – BIOPOWER Plant Health Monitoring System
