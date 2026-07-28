# Project Checkpoint — 2026-07-28

**Purpose:** Restore point after Plant HMI, user manual, Railway push, and signup UI alignment. If something breaks later, use this doc to recall what existed and how to roll back.

---

## Git restore points (use these to roll back)

### swarm_webapp

| Item | Value |
|------|-------|
| **Tag** | `checkpoint-2026-07-28` |
| **Commit** | `9880087` — Checkpoint doc (+ `521473e` signup UI, `2bffe23` Plant HMI) |
| **Previous milestone** | `2bffe23` — Plant HMI PFD, backend HMI API, responsive UI, user manual |
| **Remote `swarm`** | `git@github-swarm:swarmnfi-svg/swarm_webapp.git` |
| **Remote `origin`** | `https://github.com/Srinivas0724/swarm_webapp.git` |
| **Branch** | `main` |

**Restore entire repo to this checkpoint:**

```powershell
cd C:\Users\seena\swarm_webapp
git fetch --all
git checkout checkpoint-2026-07-28
```

**Or create a recovery branch from the tag:**

```powershell
git checkout -b recovery-from-checkpoint-2026-07-28 checkpoint-2026-07-28
```

**Hard reset local `main` to this checkpoint (destructive — only if you want to discard later commits):**

```powershell
git fetch --all
git checkout main
git reset --hard checkpoint-2026-07-28
```

---

## What was completed by this checkpoint

### 1. Plant HMI (Process Flow Diagram)

- Interactive biogas PFD at `/plant-hmi` (`biogas-pfd.html` + `swarm-hmi.js`)
- Block controls: Belt Conveyor, Crusher, Pre Treatment Tank, Motor, Main Digester, Slurry Storage, Treatment Water, Equalization
- **All On** master button — starts all eight blocks at once
- Live readings panel (equipment + instruments FIT/PIT/LIT)
- Animated pipeline flow tied to active blocks and plant bus state
- **PS/PW pump logic:** PW (P-101B) duty; PS→PW line only when PS standby active (PW off)
- PW→digester line drawn on top of pre-treatment tank (visible from PW pump)
- Maximize/fullscreen layout fix for diagram iframe
- Instrument circles show type only (PIT, FIT, LIT); full tags in readings panel
- Backend: `HmiController`, `HmiService`, equipment seeding, simulation state
- PFD cache bust: `v=block-controls-26` in iframe URL

### 2. User manual (rebuilt with HMI)

- `docs/USER_MANUAL.md` — full guide including Plant HMI section
- `docs/PLANT_HMI.md` — technical HMI reference
- In-app `/help` — Plant HMI accordion, Open Plant HMI button, troubleshooting

### 3. Signup page UI

- `Signup.jsx` matches login dark amber theme (same card, inputs, button, background)
- Commit: `521473e`

### 4. GitHub / Railway

- Pushed to both remotes on `main`:
  - `swarmnfi-svg/swarm_webapp`
  - `Srinivas0724/swarm_webapp`
- Railway should auto-deploy from `main` (frontend + backend services)

### 5. Responsive UI (included in `2bffe23`)

- Mobile/tablet layouts for main app, Plant HMI maximize, Connect Device, tables/tabs

---

## Local development

```powershell
# Backend
cd backend
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=dev"

# Frontend
cd frontend
npm install
npm run dev
```

| URL | Purpose |
|-----|---------|
| http://localhost:3000 | App |
| http://localhost:3000/plant-hmi | Plant HMI |
| http://localhost:3000/help | User manual |
| http://localhost:8080/api | Backend API |

**LAN (other devices):** `http://192.168.29.22:3000` (use host PC IP)

### Demo logins (Tata Steel HMI)

| Role | Email | Password |
|------|-------|----------|
| Plant Admin | tata.admin@tatasteel.com | TataSteel@2026 |
| Operator | tata.operator@tatasteel.com | TataSteel@2026 |

---

## Railway (reference from prior checkpoint — verify in dashboard)

| Service | Root dir | Example URL |
|---------|----------|-------------|
| **MySQL** | template | internal |
| **rare-passion** (backend) | `backend` | https://rare-passion-production-fc1a.up.railway.app |
| **swarm_webapp** (frontend) | `frontend` | https://swarmwebapp-production.up.railway.app |

**Frontend env:** `VITE_API_URL=https://<backend-url>/api`  
**Backend env:** `CORS_ORIGINS=https://<frontend-url>`, MySQL vars, `SERVER_PORT=${{PORT}}`

See `docs/RAILWAY_DEPLOYMENT.md` for 502 troubleshooting.

---

## Key files (HMI + auth UI)

```
swarm_webapp/
├── frontend/
│   ├── public/hmi/
│   │   ├── biogas-pfd.html          # PFD SVG + block bar + readings
│   │   └── swarm-hmi.js             # Flow logic, block controls, PS/PW
│   ├── src/pages/
│   │   ├── PlantHmi.jsx
│   │   ├── Login.jsx
│   │   └── Signup.jsx               # Matches login theme (521473e)
│   ├── src/components/hmi/
│   │   └── BiogasPlantDiagram.jsx   # Iframe wrapper, maximize
│   └── src/pages/Help.jsx           # User manual + HMI section
├── backend/
│   ├── controller/HmiController.java
│   └── service/HmiService.java
└── docs/
    ├── PROJECT_CHECKPOINT_2026-07-28.md   # this file
    ├── PROJECT_CHECKPOINT_2026-07-24.md   # earlier restore point
    ├── USER_MANUAL.md
    └── PLANT_HMI.md
```

---

## Commit history at this checkpoint

```
521473e Match signup page UI to login dark amber theme
2bffe23 Add Plant HMI PFD, backend HMI API, responsive UI, and updated user manual
9bb518e Add project checkpoint doc for 2026-07-24 restore point
a1ad042 Redesign login page with dark amber orange theme
```

**Earlier checkpoint tag:** `checkpoint-2026-07-24` at `a1ad042`

---

## Conversation reference

Agent transcript for this work session:  
`C:\Users\seena\.cursor\projects\c-Users-seena-swarm-webapp\agent-transcripts\20574696-020a-47f0-994a-8c6ed793e970\20574696-020a-47f0-994a-8c6ed793e970.jsonl`

---

*Checkpoint created: 2026-07-28. Tag: `checkpoint-2026-07-28` at commit `9880087`.*
