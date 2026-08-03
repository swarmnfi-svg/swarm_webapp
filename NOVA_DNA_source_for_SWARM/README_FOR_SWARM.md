# NOVA DNA — Source package for SWARM

**Audience:** Swarm IoT engineers building Telemetry → Control (HMI) → AI OPERATOR  
**From:** emPOWER / Mike's team  
**Date:** July 2026  

This archive is a **slice** of the emPOWER monorepo: NOVA intelligence engines, NovANALYSER, Reader, related AI routing, mobile client API contracts, and NOVA Chat Android source. It is **not** a full ERP dump and intentionally excludes secrets, `node_modules`, build artifacts, and production data.

## What's inside

| Path | Contents |
|------|----------|
| `README_FOR_SWARM.md` | This file |
| `CURSOR_INSTRUCTIONS_FOR_SWARM.md` | Agent instructions for Cursor (start here in Cursor) |
| `docs/NOVA_ENGINES_FLOWCHART.md` | 12-engine inventory + flowcharts |
| `docs/NOVA_FINAL_ARCHITECTURE.md` | Commercial hybrid target architecture |
| `docs/NOVANALYSER_ENGINE_PLAN.md` | NovANALYSER design (fan-out / correlate / rank) |
| `docs/EMPOWER_SWARM_INTEGRATION_ARCHITECTURE.md` | Product boundaries: Swarm standalone vs emPOWER API client |
| `src/lib/nova/` | Search, Think, Dialog, skills, packs, analysis, trend, presentation, mobile services, invariants |
| `src/lib/novanalyser/` | Cross-module orchestrator |
| `src/lib/nova-reader/` | OCR → form draft plane |
| `src/lib/ai/nova-*.ts` | NovaPlan, lexicon, clarify, tools, permissions, routing, format, write guards, … |
| `src/app/api/client/v1/nova/` | Bearer chat / threads / notifications contracts |
| `apps/nova-chat-android/` | Kotlin Compose client (source only; no APKs / build / secrets) |

Companion PDF (may also be outside this zip):

- `NOVA_for_SWARM_Team.pdf` — work completed + roadmap mapping for your team

## What NOVA DNA means

```
utterance → understand (Search / Lexicon / gated Think)
         → NovaPlan (catalog tools only)
         → control (Dialog, Clarify, Entity Resolve, write-deny, RBAC)
         → execute (skills / packs / analysis / trend / NovANALYSER)
         → facts + provenance
         → narrate (Present) + answer guards
```

**Never fail-open on permissions.** Feature flags turn features off; they do not bypass `novaCanRunTool` / `can()`.

## How to open in Cursor

1. Unzip to a folder, e.g. `~/dev/NOVA_DNA_source_for_SWARM`.
2. **File → Open Folder** on that root (or open the monorepo and point the agent at these paths).
3. Attach `@CURSOR_INSTRUCTIONS_FOR_SWARM.md` as the standing brief for the agent.
4. Prefer TypeScript study first; Android is a reference client for API UX.

This slice may not compile standalone (imports like `@/lib/rbac`, Prisma, Next.js). Use it as **architecture + patterns to port**, or open the full `empower-erp` repo if you have access.

## Port vs wrap vs API

| Approach | When |
|----------|------|
| **Port** | Orchestration DNA: plan gate, dialog/clarify, tool permission floor, NovANALYSER fan-out, answer guards — into Swarm's own services with Swarm metrics |
| **Wrap** | Reuse patterns (Safe Workflow: propose → preview → human confirm) for HMI Control commands |
| **Call as API** | emPOWER Manufacturing Hub consuming Swarm partner telemetry; ERP NOVA skills soft-fail over pulled aggs — **not** Swarm embedding ERP |

## Guardrails (non-negotiable)

- No free SQL / LLM tool picking
- No silent writes to devices or ledgers in P0
- Tool allowlists + plant/org scope on every fan-out step
- Prefill / propose ≠ commit
- Quality flags and units on telemetry facts (no zero-fill fiction)

## Suggested first P0

Read-only **telemetry insights** for operators: intent → metric skill plan → concurrent fetch → correlate → rank → narrate. Map later to Control HMI with human-confirm, then AI OPERATOR.

## Contact

Fill in with Mike's team:

- Primary: `[name / email]`
- Secondary: `[name / email]`
