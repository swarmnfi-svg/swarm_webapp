# Cursor instructions — NOVA DNA for SWARM AI OPERATOR

**For:** Swarm engineers using Cursor  
**Goal:** Build AI OPERATOR on NOVA's foundation (plan → skills → facts → narrate), without copying ERP ledger semantics or weakening authz.

Attach this file when starting a Cursor agent session on the unzipped DNA package or the full `empower-erp` monorepo.

---

## 1. How to open the package

1. Unzip `NOVA_DNA_source_for_SWARM.zip`.
2. In Cursor: **Open Folder** on the unzip root (contains `README_FOR_SWARM.md` + `src/` + `apps/`).
3. Tell the agent: “Follow `CURSOR_INSTRUCTIONS_FOR_SWARM.md`. We are porting NOVA DNA into Swarm for read-only telemetry insights first.”
4. If you also have full `empower-erp`, prefer that workspace for go-to-definition on `@/lib/rbac` and Prisma — this zip is a focused slice and may not typecheck alone.

---

## 2. What “NOVA DNA” means

NOVA is **controlled intelligence**, not an open agent with DB access.

Canonical loop:

1. **Understand** — Search Engine (rules) fills slots; Lexicon helps; **NovaThink** only if confidence is low.
2. **Plan** — `buildNovaPlan` / `finalizeNovaPlan` selects **catalog tools only**.
3. **Control** — DialogState, Clarify (bind by id), Entity Resolve, dual **write-deny**, **RBAC filter**.
4. **Execute** — Skills / Packs / Analysis / Trend / **NovANALYSER** fan-out under `can()` / `novaCanRunTool`.
5. **Facts** — Structured fact packs + provenance (not chat memory as authority).
6. **Narrate** — Present/Narrate + **answer guards** (numbers, units, identity, period).

**RBAC is additive and never fail-open.** If a tool is not allowed, omit it or deny — do not invent an admin bypass. Feature flags disable capability; they must not open other tools or data.

---

## 3. Map Swarm roadmap → NOVA engines

| Swarm stage | Operator need | Map to NOVA engines |
|-------------|---------------|---------------------|
| **Telemetry (now)** | “Why is plant X unhealthy?” “Show incomplete meters today” | Search + Lexicon; Skills over local Timescale/aggs; Present with quality/unit guards |
| **Control (HMI)** | “Set mode to X” / setpoint propose | Dialog + Clarify for device ambiguity; **Safe Workflow** pattern (open/propose UI, human submit); hard deny silent writes |
| **AI OPERATOR** | Cross-signal insights + ranked actions with evidence | **NovaPlan**; gated **NovaThink**; **NovANALYSER**-style plan → fan-out → correlate → rank → narrate; tool allowlists + plant RBAC |

Ownership reminder: Swarm owns IoT ingest/HMI. emPOWER may **pull** Swarm partner API for Manufacturing Hub. Do **not** build Swarm inside ERP; do **not** let an LLM hit Swarm DB directly.

---

## 4. Files to study first (in order)

### Architecture (read before coding)

1. `docs/NOVA_ENGINES_FLOWCHART.md` — 12 engines + mermaid flows  
2. `docs/NOVA_FINAL_ARCHITECTURE.md` — commercial hybrid invariants  
3. `docs/NOVANALYSER_ENGINE_PLAN.md` — fan-out orchestration design  
4. `docs/EMPOWER_SWARM_INTEGRATION_ARCHITECTURE.md` — product boundaries  
5. `src/lib/nova/invariants.ts` — frozen “never do this” list  

### Orchestration core

6. `src/lib/ai/nova-plan.ts` — plan gate  
7. `src/lib/ai/nova-engine-routing.ts` — meta-engine priority (NovANALYSER → analysis → trend → …)  
8. `src/lib/nova/nova-search-engine.ts` — rules-first slots  
9. `src/lib/nova/nova-think.ts` — gated LLM slot polish  
10. `src/lib/ai/nova-lexicon.ts` / `nova-clarify.ts`  
11. `src/lib/nova/dialog-state.ts`  
12. `src/lib/ai/nova-tool-permissions.ts` + `nova-write-guards.ts`  
13. `src/lib/ai/nova-tools.ts` — entity resolve + tool run surface  

### Fan-out / insights (best P0 template for Swarm)

14. `src/lib/novanalyser/orchestrator.ts` — intent → plan → concurrent skills → correlate → rank → format  
15. `src/lib/novanalyser/plan-registry.ts`, `correlate.ts`, `rank.ts`, `intent.ts`  
16. `src/lib/nova/skills/ops/novanalyser.ts` — skill adapter  

### Client / API UX reference

17. `src/app/api/client/v1/nova/**` — bearer chat contracts  
18. `apps/nova-chat-android/API.md` + Compose chat/clarify/voice flows  

### Control / propose patterns (for later HMI)

19. `src/lib/nova/NOVA_SAFE_WORKFLOW_CONTROL_PLAN.md`  
20. `src/lib/nova-reader/` — draft bridge (prefill ≠ commit)  

---

## 5. Port vs wrap vs call as API

| Strategy | Do this | Don't do this |
|----------|---------|---------------|
| **Port** | Plan/Dialog/Clarify/permission-floor/NovANALYSER orchestrator shapes into Swarm services; replace ERP skills with telemetry metric skills | Copy invoice/payment Prisma skills into Swarm |
| **Wrap** | Safe Workflow + Reader-style draft/preview for HMI commands | Auto-apply setpoints from chat without human confirm |
| **API call** | emPOWER backend → Swarm partner API for MH cards/skills | Browser/ERP user session calling Swarm; NOVA querying Swarm DB |

For **Swarm AI OPERATOR**, default to **port orchestration + new Swarm skills**. Treat emPOWER integration as a separate partner-API track.

---

## 6. Guardrails (agent must enforce in code reviews)

- **No permission bypasses** — no “admin shortcuts,” no `return true` authz, no public middleware implying open data.
- **Tenant / org / plant scope** — every skill query filtered; deny cross-plant leakage in tests.
- **Tool allowlists** — only registered catalog tools; validate Think/LLM slot output against catalog.
- **Write policy** — P0 AI OPERATOR is **read-only**. Control commands = propose + human gate.
- **Facts authority** — telemetry stores + quality flags win over chat memory.
- **Answer guards** — after narration, verify units, device ids, time windows, and incompleteness language (no fake zeros).
- **Secrets** — never commit `.env`, API keys, `local.properties`, keystores, or `google-services.json`.

When changing authz-related code, add **denial tests** (401/403 / empty filtered tool lists), not only happy paths.

---

## 7. Suggested first P0 (implement this)

**Title:** Read-only telemetry insights (NovANALYSER-style)

**Acceptance criteria:**

1. Operator asks a broad question (“How healthy is plant Alpha today?”).
2. Intent classifier selects a **profile** (e.g. plant_health).
3. Plan registry lists metric steps (uptime, alerts, incomplete meters, energy, …).
4. Fan-out runs only steps the user **can** access for that plant.
5. Correlate + rank issues with evidence links into Swarm UI.
6. Narrate with guards; soft-fail missing modules.
7. **No** write/setpoint tools registered.

**Skeleton (conceptual):**

```text
classifyIntent(query)
  → resolveProfile(user, plantScope)
  → buildPlan(profile)           // catalog tool ids only
  → filterSteps(novaCanRunTool)
  → mapWithConcurrency(dispatchSkill)
  → normalizeMetrics → correlate → rank
  → formatNarrative(+ guards)
```

Mirror `src/lib/novanalyser/orchestrator.ts` rather than inventing a free-form agent loop.

---

## 8. What the agent should produce for Swarm

When asked to scaffold AI OPERATOR P0:

1. Domain types for Swarm metrics (with quality enum).
2. Skill contract + registry (read-only).
3. Permission floor map (tool → roles/scopes).
4. Orchestrator + plan registry for 1–2 intents.
5. Unit tests: RBAC deny, empty plan, partial fan-out failure, answer guard.
6. Short ADR: why catalog tools beat free LLM SQL.

Do **not** add emPOWER Prisma models or ERP money language (“profit”) to Swarm insights — use physical truth + completeness/contribution wording if cost appears later.

---

## 9. Quick glossary

| Term | Meaning |
|------|---------|
| NovaPlan | Single gate that finalizes which catalog tools run |
| NovaThink | Optional LLM slot fill when rules confidence is low |
| NovANALYSER | Cross-module insight orchestrator (fan-out + rank) |
| DialogState | Session sticky entities / pending clarify acts |
| Pack | Multi-metric chapter result |
| Safe Workflow / FILL | Open form or propose draft; user commits |
| Reader | Document OCR → draft fields; never ledger write |

---

## 10. Contact placeholder

- emPOWER / Mike's team: `[primary contact]`
- Swarm lead: `[primary contact]`
- Joint design review: Control HMI command model + AI OPERATOR P0 demo
