# BIOPOWER API Documentation

Base URL: `http://localhost:8080/api`

All authenticated endpoints require header: `Authorization: Bearer <token>`

---

## Authentication

### POST /auth/login
```json
{ "email": "swarm.nfi@gmail.com", "password": "Swarm@2026" }
```
Response: `{ "success": true, "data": { "token": "...", "role": "SUPER_ADMIN", ... } }`

### POST /auth/logout
### POST /auth/forgot-password
```json
{ "email": "user@example.com" }
```
### POST /auth/change-password
```json
{ "currentPassword": "old", "newPassword": "new123" }
```

---

## Plants

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | /plants | All | List plants (filtered by role) |
| GET | /plants/{id} | All | Get plant details |
| POST | /plants | Admin | Create plant |
| PUT | /plants/{id} | Admin | Update plant |
| DELETE | /plants/{id} | Super Admin | Delete plant |

---

## Sensor Nodes

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | /sensor-nodes | Admin | List all nodes |
| GET | /sensor-nodes/plant/{plantId} | Admin | Nodes by plant |
| POST | /sensor-nodes | Admin | Register node |
| PUT | /sensor-nodes/{id} | Admin | Update node |
| PATCH | /sensor-nodes/{id}/toggle | Admin | Enable/disable |
| DELETE | /sensor-nodes/{id} | Admin | Delete node |

---

## IoT Data (Public)

### POST /iot/data
```json
{
  "plantId": 1,
  "nodeId": 5,
  "sensorType": "PH",
  "value": 7.2,
  "timestamp": "2026-06-20T10:30:00"
}
```

Sensor types: `PH`, `TEMPERATURE`, `PRESSURE`, `GAS_FLOW`, `METHANE`, `CARBON_DIOXIDE`, `HYDROGEN_SULFIDE`, `AMMONIA`, `HUMIDITY`, `LIQUID_LEVEL`

---

## Dashboard & Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /dashboard/{plantId} | Live dashboard data |
| GET | /analytics/{plantId}?sensorType=TEMPERATURE&start=...&end=... | Historical data |

---

## Alerts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /alerts?plantId=1&status=ACTIVE | List alerts |
| PATCH | /alerts/{id}/acknowledge | Acknowledge alert |
| PATCH | /alerts/{id}/resolve | Resolve alert |

---

## AI Recommendations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /ai/recommendations/{plantId} | Get AI recommendations |
| PATCH | /ai/recommendations/{id}/acknowledge | Acknowledge |

---

## Predictive Maintenance

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /maintenance/{plantId} | Equipment maintenance predictions |

---

## Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /reports?plantId=1 | List reports |
| POST | /reports/generate | Generate report |

```json
{ "plantId": 1, "reportType": "DAILY", "format": "PDF" }
```

Report types: `DAILY`, `WEEKLY`, `MONTHLY`, `PLANT_SUMMARY`, `GAS_PRODUCTION`, `ALERTS`, `PLANT_HEALTH`

---

## Users (Super Admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /users | List users |
| POST | /users | Create user |
| PUT | /users/{id} | Update user |
| PATCH | /users/{id}/disable | Disable user |
| PATCH | /users/{id}/enable | Enable user |
| DELETE | /users/{id} | Delete user |

---

## Settings (Super Admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /settings | All settings |
| GET | /settings/category/{category} | By category |
| POST | /settings | Save setting |

---

## Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /notifications | Alert counts and lists |

---

## Alert Thresholds (Default)

| Parameter | Threshold |
|-----------|-----------|
| pH Min | 6.5 |
| pH Max | 8.5 |
| Temperature Min | 25°C |
| Temperature Max | 45°C |
| Pressure Max | 2.5 bar |
| Sensor Timeout | 10 minutes |
