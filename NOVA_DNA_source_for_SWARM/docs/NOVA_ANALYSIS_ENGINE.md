# NOVA Analysis Engine

**Status:** MVP shipped (P0 modules) + all-modules registry framework  
**Date:** 2026-07-14  
**Plan (P0–P2):** [`NOVA_ANALYSIS_ALL_MODULES_PLAN.md`](./NOVA_ANALYSIS_ALL_MODULES_PLAN.md)  
**Coords with:** KPI report-card (`buildKpiReportCard` / `NOVA_ANALYSIS_HANDOFF.md`)  
**Non-goals:** free SQL · agent tool-pick · write-back · dashboard builder (`NOVA_SELF_RELIANCE_LIGHT_PLAN.md`)

---

## Architecture

```
User cue (“why is my kpi low” / “why overdue” / …)
  → selectNovaTools → nova_analysis
  → modules/registry (domain → module def)
  → RBAC loader (catalog skills only)
  → NovaAnalysisBundle (factor schema v1)
  → runNovaAnalysis:
       1. rank factors deterministically
       2. LLM synthesizes narrative + rankedDrivers + operationalNotes
       3. digit + factorId guards; soft 429 → facts-only
  → format / Findings
```

Parallel to Search / Chat / facts — **not** a new agent framework.

### Plug-in pattern (KPI first)

1. Pure `build*AnalysisBundle` / adapt skill facts → bundle  
2. Register in `modules/registry.ts` with `load`, `cues`, `rbacNote`, `priority`  
3. Add domain cues — skip P1/P2 until loader exists (skill returns honest “planned”)

### LLM role (default ON)

After the fact pack is built, LLM:

1. Synthesizes **why** the headline sits where it sits  
2. Ranks **likely drivers** citing `factorId`s from the pack  
3. Adds **operational interpretations** (process read — never new ₹/%)  
4. Uses director / manager / staff tone from session role  

Hard reject if invented digits, unknown `factorId`, or empty/denied facts.  
Env: `NOVA_ANALYSIS_LLM=0` forces facts-only.

---

## P0 modules (shipped)

| Domain | Fact source | ACL |
|--------|-------------|-----|
| KPI | `buildKpiReportCard` (+ thin `kpi_summary`) | `canViewKpiScorecard` |
| Tasks | `tasks_summary` | `task.read.self` |
| Outstanding | AR + overdue + receipts | invoice + org finance aggregates |
| Attendance | `attendance_late_summary` | skill `can()` |
| Project | tasks + projects | project.read / task.read.self |

See **ALL_MODULES plan** for P1–P2 backlog (approvals, leave, delivery, stock, bank recon, …).

---

## Verify phrases

- `why is my kpi low`
- `why overdue`
- `analyze this project`
- `why is outstanding high`
- `why so many late` / `attendance analysis`

Bare `my kpi` / `kpi list` → `kpi_summary`.  
`kpi report card` / `kpi breakdown` → `kpi_report` (structured dump).
