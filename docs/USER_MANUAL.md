# User Manual

## BIOPOWER AI-IoT Plant Health Monitoring System

This manual covers the SWARM web application: dashboard monitoring, **Plant HMI** (process flow diagram), ESP sensor hub pairing, and admin features.

In the web app, open **User Manual** in the sidebar (`/help`). Content is filtered by role (Super Admin, Plant Admin, Operator).

---

## Table of contents

1. [Getting started](#1-getting-started)
2. [Dashboard](#2-dashboard)
3. [Plant HMI](#3-plant-hmi)
4. [ESP Sensor Hub](#4-esp-sensor-hub)
5. [Plant management (Admin)](#5-plant-management-admin)
6. [Sensor nodes (Admin)](#6-sensor-nodes-admin)
7. [Analytics](#7-analytics)
8. [Alerts](#8-alerts)
9. [AI recommendations](#9-ai-recommendations)
10. [Predictive maintenance](#10-predictive-maintenance)
11. [Reports](#11-reports)
12. [User roles](#12-user-roles)
13. [Notifications](#13-notifications)
14. [Settings (Super Admin)](#14-settings-super-admin)
15. [Android APK (phone & tablet)](#15-android-apk-phone--tablet)
16. [Development — run locally](#16-development--run-locally)

---

## 1. Getting started

### Login

1. Open the application URL in your browser (example: `http://localhost:3000` or your LAN IP).
2. Enter your email and password.
3. Click **Sign In**.

### Forgot password

1. Click **Forgot Password?** on the login page.
2. Enter your registered email.
3. Check your email for reset instructions.

### Demo credentials (Tata Steel HMI plant)

| Role | Email | Password |
|------|-------|----------|
| Plant Admin | tata.admin@tatasteel.com | TataSteel@2026 |
| Operator | tata.operator@tatasteel.com | TataSteel@2026 |

---

## 2. Dashboard

The main dashboard provides real-time plant monitoring:

- **Plant Health Score** (0–100): Green = Healthy, Yellow = Warning, Red = Critical
- **Sensor cards**: Current readings for pH, temperature, pressure, gas flow, methane, CO₂, H₂S, NH₃
- **Active alerts**: Latest unresolved alerts
- **Gas production**: Current biogas output rate

Select a plant from the dropdown to switch between sites.

---

## 3. Plant HMI

The **Plant HMI** is the interactive process flow diagram (PFD) for the Tata Steel West Bokaro biomethanation plant. It shows equipment status, live instrument readings, animated pipeline flow, and block-level start/stop controls.

> **Simulation mode:** Commands update server-side HMI state. They do not drive real PLCs or field pumps until Phase 3 field integration.

### Access

| Entry | Path |
|-------|------|
| Sidebar | **Plant HMI** |
| Direct URL | `/plant-hmi` |
| With plant pre-selected | `/plant-hmi?plantId=<id>` |

**Roles:** All authenticated users can open the HMI. **Plant Admin** and **Super Admin** can send commands. **Operators** can view status and readings only.

### Page layout

1. **SWARM Core header** — platform modules and simulation indicator.
2. **Master output enable** (control pages) — energize or de-energize the plant electrical bus.
3. **Process flow diagram** — animated PFD with block buttons and live readings panel.
4. **HMI page tabs** — Overview, zone pages, alarms, trends, diagnostics, audit.

Select the plant from the dropdown at the top if multiple P&ID plants exist.

### Master output enable (plant bus)

Before any motor or pump can start, the plant bus must be **energized**:

| Action | Effect |
|--------|--------|
| **Energize bus** | Powers controllable equipment (ready state, not running) |
| **De-energize bus** | Stops all equipment and disables the plant |

Only Plant Admin and Super Admin see these buttons.

### Process flow diagram (PFD)

The diagram shows the full biogas plant: fresh water feed, bag breaker, belt conveyor, crusher, pre-treatment tank, main digester, gas handling, slurry storage, equalization tank, and ETP.

#### Block control bar

Eight equipment blocks plus a master **All On** button:

| Button | Tag | Equipment |
|--------|-----|-----------|
| All On | — | Starts all eight blocks at once (skips blocks already running) |
| Belt Conveyor | BC101 | Feed belt |
| Crusher | CH101 | Crusher |
| Pre Treatment Tank | P-101B | Duty feed pump PW |
| Motor | AG101 | Pre-treatment mixer / fan |
| Main Digester | AG102 | Digester agitator |
| Slurry Storage Tank | P102 | Slurry pump |
| Treatment Water Tank | P104 | Treatment water pump |
| Equalization Tank | P103 | Equalization pump |

**Button colors (when bus is energized):**

| Color | Meaning |
|-------|---------|
| Green | Running |
| Red | Off (stopped) |
| Yellow | Fault |
| Grey | Bus de-energized or idle |

Click a block button to toggle **START** / **STOP** for that equipment.

#### Live readings panel

Right side of the diagram (or below on mobile):

- **Equipment** — block tag, value, and run status (Off / Running / Fault).
- **Instruments** — FIT, PIT, LIT tags with live values when sensors are linked.

Values refresh about every **4 seconds** while the HMI page is open.

#### Pipeline flow animation

- Animated dashed lines show active material flow (water, slurry, gas).
- Flow follows **active blocks** — pipes animate only when the related equipment is running and the bus is energized.
- **Fresh water feed → heater** animates when the bus is energized (no block dependency).

#### PS / PW feed pumps (pre-treatment)

Inside the Pre Treatment Tank:

- **PW (P-101B)** — **duty / working** pump (controlled by **Pre Treatment Tank** block).
- **PS (P-101A)** — **standby** pump.

| Condition | PS → PW line | PW → digester line |
|-----------|--------------|-------------------|
| PW running (normal) | Off | On (when motor + digester active) |
| PW off, PS running (standby) | On | On |
| Both off | Off | Off |

#### Diagram tools

| Tool | Action |
|------|--------|
| **Maximize** (fullscreen icon) | Full-screen diagram; use **Minimize** to return |
| **Motors running** | Count of controllable equipment currently running |
| **Legend** | Green = running, Red = off, Yellow = fault |

Click equipment on the diagram to highlight the selected tag in the toolbar.

### HMI page tabs

| Tab | Purpose |
|-----|---------|
| **Plant Overview** | Process flow summary, auto-sequence status, safety chain |
| **Feed & Pretreatment** | T101, BC101, CH101, T102, AG101 — diagram highlights feed zone |
| **Digester & Feed Pumps** | P-101A/B, T104, AG102 — duty/standby pumps and digester |
| **Gas System** | Balloon, scrubber, generator, flare |
| **Slurry & ETP** | Slurry tanks, screw press, equalization, treatment water |
| **Alarm Summary** | Active HMI alarms with acknowledge/resolve |
| **Trends & Totals** | Pressure, flow, temperature trends |
| **Maintenance / Diagnostics** | I/O quality, communication, runtime |
| **Audit Log** | Command history for the plant |

Zone tabs (Feed, Digester, Gas, Slurry) dim unrelated equipment on the diagram and show zone-specific monitors below.

### Auto-sequence (demo)

When available on control pages, **Auto Sequence** progressively starts controllable equipment in process order. **Stop Sequence** halts the demo sequence.

### Instrument labels on diagram

Circles on the PFD show the instrument **type only** (FIT, PIT, LIT). Full tag numbers (for example FIT-102, PIT-103) appear in the **Live Readings** panel.

### Troubleshooting (HMI)

| Issue | What to check |
|-------|----------------|
| Block buttons greyed out | Energize bus first; confirm your role can control (Admin) |
| No live readings | Sensor nodes linked to plant; wait for next poll (~4 s) |
| Flow lines not animating | Related block must be running; bus must be energized |
| PS → PW line always on | PW should be running in normal duty — standby path only when PW is off and PS is on |
| Diagram not updating after changes | Hard refresh (`Ctrl+Shift+R`) or clear browser cache |

### Further HMI reference

Technical details, API endpoints, and database tables: **[Plant HMI technical guide](./PLANT_HMI.md)**

---

## 4. ESP Sensor Hub

Repo copy with screenshots:

**[ESP Sensor Hub Connection Manual](./ESP_SENSOR_HUB_MANUAL.md)**  
Screenshots: [`docs/manual-screenshots/`](./manual-screenshots/)

Quick summary:

1. Admin sets a **Device Unique ID** in firmware and flashes once.
2. On site, connect phone to `SWARM-Setup-<chipId>` using the Unique ID as Wi‑Fi password.
3. Open `http://192.168.4.1/setup`, enter Unique ID + site Wi‑Fi, save & restart.
4. In SWARM → **Connect Device**, enter ESP LAN IP + Device Password, then pair.
5. Verify readings on **Dashboard**.

---

## 5. Plant management (Admin)

### Add a plant

1. Navigate to **Plants** in the sidebar.
2. Click **Add Plant**.
3. Fill in: Name, Type, Location, Capacity, Feedstock, Installation Date.
4. Click **Save**.

Plants whose feedstock references **P&ID** are eligible for the Plant HMI.

### Plant types

- Biogas Plant
- Bio-CNG Plant
- Sanitation Plant
- STP Plant
- Organic Waste Plant
- Waste-to-Energy Plant

---

## 6. Sensor nodes (Admin)

### Register a sensor

1. Go to **Sensor Nodes**.
2. Click **Register Node**.
3. Select plant, enter node name and sensor type.
4. Save.

### Monitor node health

- **Battery level**: Should be above 20%
- **Signal strength**: Should be above 50%
- **Status**: Active, Inactive, Faulty, or Offline

---

## 7. Analytics

View historical trends:

1. Select plant and sensor type.
2. Choose time range: Hour, Day, Week, Month.
3. Interactive chart displays trend data.

---

## 8. Alerts

### Alert severities

- **Critical**: Immediate action required (red)
- **Warning**: Attention needed (yellow)
- **Information**: For awareness (blue)

### Managing alerts

1. View alerts by status: Active, Acknowledged, Resolved.
2. Click **Acknowledge** to mark as seen.
3. Click **Resolve** when issue is fixed.

---

## 9. AI recommendations

The AI engine analyzes sensor patterns and provides:

- Health score (0–100)
- Issue detection (acidification, overfeeding, etc.)
- Actionable recommendations

Example: *"Reduce feedstock input by 15%. Increase mixing cycle frequency."*

---

## 10. Predictive maintenance

View predicted equipment failures:

- Remaining Useful Life (days)
- Estimated Failure Date
- Equipment Health Percentage

Equipment types: Pump, Blower, Agitator, Compressor, Sensor

---

## 11. Reports

Generate and download reports:

1. Click **Generate Report**.
2. Select plant, report type, and format (PDF/Excel/CSV).
3. Download from the reports list.

---

## 12. User roles

| Feature | Super Admin | Plant Admin | Operator |
|---------|:-----------:|:-----------:|:--------:|
| View Dashboard | ✓ | ✓ | ✓ |
| View Plant HMI | ✓ | ✓ | ✓ |
| Control Plant HMI (bus / blocks) | ✓ | ✓ | ✗ |
| Manage Plants | ✓ | ✓ | ✗ |
| Manage Sensors | ✓ | ✓ | ✗ |
| Connect Device (pair ESP) | ✓ | ✓ | ✓ |
| View Alerts | ✓ | ✓ | ✓ |
| AI Recommendations | ✓ | ✓ | ✓ |
| Generate Reports | ✓ | ✓ | ✓ |
| Manage Users | ✓ | ✗ | ✗ |
| System Settings | ✓ | ✗ | ✗ |

---

## 13. Notifications

The bell icon in the navbar shows active alert count. Click to open the Notification Center with categorized alerts.

---

## 14. Settings (Super Admin)

Configure:

- **Alert thresholds**: pH, temperature, pressure limits
- **MQTT broker**: IoT message broker settings
- **Email server**: SMTP configuration for notifications
- **AI settings**: Analysis interval
- **Report schedule**: Automated report timing

---

## 15. Android APK (phone & tablet)

The same SWARM web app runs inside a native Android shell (Capacitor). UI/UX is unchanged; responsive layouts already support phones and tablets.

| Item | Location |
|------|----------|
| **Debug APK** | `releases/SWARM-debug.apk` |
| **Build guide** | [ANDROID_APK.md](./ANDROID_APK.md) |

**Install:** copy APK to phone/tablet and open (allow unknown apps if prompted).

**Backend:** APK uses `VITE_API_URL` from `frontend/.env.production`. Railway `CORS_ORIGINS` must include `https://localhost`.

---

## 16. Development — run locally

### Git — push code

```bash
git push swarm main
```

### Terminal — run frontend and backend

**Frontend:**

```bash
npm install
npm run dev
```

**Backend:**

```bash
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=dev"
```

**Application URL:** `http://localhost:3000`  
**Plant HMI:** `http://localhost:3000/plant-hmi`  
**API base:** `http://localhost:8080/api`

**LAN access (other devices on same Wi‑Fi):** use your PC LAN IP, for example `http://192.168.x.x:3000/plant-hmi`
