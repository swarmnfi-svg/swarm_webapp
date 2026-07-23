# SWARM Partner API (emPOWER Integration)

**Base URL:** `http://localhost:8080/api/partner/v1`  
**Auth:** `Authorization: Bearer <api_key>`  
**Direction:** Pull-only (emPOWER backend → SWARM). Read-only. No user sync. No Swarm UI embed.

---

## Sandbox credentials (local dev)

| Field | Value |
|-------|-------|
| Organization ID | `org_biopower_pilot` |
| API key | `swk_sandbox_biopower_dev_2026` |

Health check:

```bash
curl -H "Authorization: Bearer swk_sandbox_biopower_dev_2026" \
  http://localhost:8080/api/partner/v1/health
```

---

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Ping + org binding |
| GET | `/plants` | Plant catalog |
| GET | `/devices` | Device/node catalog (`device_id` = `node_{id}`) |
| GET | `/telemetry/latest` | Latest readings |
| GET | `/telemetry/history` | Paginated history (`cursor`, `updated_since`) |
| GET | `/telemetry/alerts` | Alerts |
| GET | `/telemetry/health/{plantId}` | Plant health summary |
| GET | `/aggregates/daily` | Daily aggregates (`from`, `to` dates) |

---

## Query parameters

### `/telemetry/latest`
- `plantId` (optional)
- `deviceId` (optional, e.g. `node_5`)

### `/telemetry/history`
- `plantId`, `deviceId`, `metricType` (optional filters)
- `updated_since` — ISO-8601 UTC (e.g. `2026-07-22T00:00:00Z`)
- `cursor` — opaque pagination token from previous response
- `limit` — max 2000, default 500

### `/aggregates/daily`
- `from`, `to` — required dates (`YYYY-MM-DD`)
- `plantId`, `deviceId`, `metricType` — optional filters

---

## Response conventions

- Timestamps: **UTC** ISO-8601 (`Instant`)
- `device_id`: stable string `node_{nodeId}`
- `reading_type`: `GAUGE` or `TOTALIZER`
- `quality`: `MEASURED` on raw readings; aggregates may return `INCOMPLETE`
- `metric_type`: sensor enum (`TEMPERATURE`, `GAS_FLOW`, `FLOW_TRANSMITTER`, etc.)

### Metric dictionary

| metric_type | unit | reading_type |
|-------------|------|--------------|
| PH | (none) | GAUGE |
| TEMPERATURE | C | GAUGE |
| PRESSURE | bar | GAUGE |
| GAS_FLOW | m3/h | TOTALIZER |
| METHANE | % | GAUGE |
| FLOW_TRANSMITTER | m3/h | TOTALIZER |
| PRESSURE_TRANSMITTER | bar | GAUGE |
| TEMPERATURE_TRANSMITTER | C | GAUGE |

---

## Super Admin — manage partner keys

JWT Super Admin endpoints (not for emPOWER):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/partner/organizations` | List orgs |
| POST | `/api/admin/partner/organizations` | Create org |
| POST | `/api/admin/partner/api-keys` | Create API key |
| DELETE | `/api/admin/partner/api-keys/{id}` | Revoke key |

Create organization example:

```json
POST /api/admin/partner/organizations
{
  "name": "BIOPOWER Pilot",
  "externalOrgId": "org_biopower_pilot",
  "plantIds": [1, 2]
}
```

---

## What emPOWER will NOT call

- `POST /api/iot/batch` (device ingest only)
- Connect Device / pairing APIs
- User admin or mutating Swarm config APIs

---

## Integration contract (agreed with emPOWER)

1. SWARM stays standalone — own UI, auth, firmware, MQTT
2. emPOWER vaults org API key server-side
3. emPOWER pulls every ~15 min (cron)
4. Mapping device → hub/line stays on emPOWER (`MeterDeviceMap`)
5. Contribution/costing is emPOWER-side — SWARM provides physical telemetry only
6. Webhooks deferred — not required for P2

See also: emPOWER `EMPOWER_SWARM_INTEGRATION_ARCHITECTURE.md`
