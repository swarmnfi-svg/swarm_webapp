# Plant HMI — P&ID Interactive View

**Status:** Implemented (simulation mode)  
**Route:** `/plant-hmi`  
**Target plant:** Tata Steel West Bokaro Biomethanation Plant (P&ID V4 15Apr)

---

## Overview

The Plant HMI provides an interactive **P&ID (Piping & Instrumentation Diagram)** view where operators can:

- See equipment tags from the P&ID (T101, BC101, CH101, T104, B101, GE101, etc.)
- View **live instrument values** where sensors are linked
- Use **simulated** plant power on/off and equipment start/stop controls
- Run an **auto-sequence** demo that walks through the process flow
- Filter equipment by process zone (Feed Prep, Digestion, Gas Handling, etc.)

> **Simulation mode:** Controls update server-side demo state only. They do not send commands to real PLCs or pumps.

---

## Access

| Entry | Path |
|-------|------|
| Sidebar | **Plant HMI** |
| Dashboard | **Open HMI** card (when plant has HMI configured) |
| Direct URL | `/plant-hmi?plantId=<id>` |

**Roles:** All authenticated roles can view. **Plant Admin** and **Super Admin** can send commands.

---

## Process zones

| Zone | Equipment tags |
|------|----------------|
| Feed Prep | T101, BC101, CH101 |
| Pretreatment | T102, AG101, T103 |
| Feed to Digester | P-101A, P-101B, P102, P103, P104 |
| Digestion | T104, MT101 |
| Gas Handling | B101, SC101, GE101, FA101 |
| Effluent / Sludge | T105, FP-101, T106, T107, T108, T109 |

---

## Controls

### Plant master

| Action | Effect |
|--------|--------|
| **Power On** | Enables controllable equipment (powered, not running) |
| **Power Off** | Stops all equipment and disables plant |
| **Auto Sequence** | Progressively starts controllable equipment in process order |
| **Stop Sequence** | Halts auto-sequence |

### Per-equipment (controllable units)

| Action | Effect |
|--------|--------|
| Power On | Equipment receives power |
| Start | Equipment runs (requires plant power + equipment power) |
| Stop | Equipment stops running |
| Power Off | Equipment fully off |

---

## Live data binding

Instruments linked to `sensor_nodes` show latest readings on hotspots and in the detail panel:

| Equipment | Linked instrument (demo) |
|-----------|--------------------------|
| T104 Main Digester | LIT-103, PIT-103, TIT-103, AIT-103 |
| B101 Biogas Balloon | LIT-201, PIT-202 |
| SC101 Scrubber | PDT-201 |
| GE101 Generator | FIT-202 |
| T105 Slurry Tank | LIT-301 |
| T107 Equalization | AIT-302 |

Values refresh every **8 seconds** on the HMI page.

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/hmi/{plantId}/diagram` | Diagram URL + hotspot coordinates |
| GET | `/api/hmi/{plantId}/state` | Equipment states + sensor values |
| POST | `/api/hmi/{plantId}/commands` | `{ tagNo, action }` — POWER_ON, START, STOP, etc. |
| POST | `/api/hmi/{plantId}/master` | `{ action }` — PLANT_POWER_ON, AUTO_SEQUENCE_START, etc. |

---

## P&ID drawing asset

**Current:** Schematic SVG at `frontend/public/hmi/tata-steel-pid.svg`

**To use your official P&ID drawing:**

1. Export as PNG or SVG (high resolution)
2. Save to `frontend/public/hmi/tata-steel-pid.png` (or `.svg`)
3. Update hotspot coordinates in backend seed (`HmiEquipmentSeeder.java`) or via DB `hmi_equipment.hotspot_*` columns
4. Percentage-based coordinates (0–100) align with the overlay in `PidDiagram.jsx`

---

## Database tables

- `hmi_equipment` — equipment registry per plant
- `hmi_equipment_state` — simulated powered/running state
- `hmi_plant_state` — plant power + auto-sequence

Seeded automatically for plants whose feedstock references `P&ID` (Tata Steel demo).

---

## Demo credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | swarm.nfi@gmail.com | Swarm@2026 |
| Plant Admin | tata.admin@tatasteel.com | TataSteel@2026 |
| Operator | tata.operator@tatasteel.com | TataSteel@2026 |

---

## Future (Phase 3)

- Real PLC/Modbus/MQTT command integration
- Command audit log
- Safety interlocks (e.g. digester level before pump start)
- WebSocket live updates

---

## Related files

```
backend/
  config/HmiEquipmentSeeder.java
  controller/HmiController.java
  service/HmiService.java
  model/entity/HmiEquipment*.java

frontend/
  src/pages/PlantHmi.jsx
  src/components/hmi/
  public/hmi/tata-steel-pid.svg
```
