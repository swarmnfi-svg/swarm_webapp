# Nova Space OP — Architecture (ADR)

**Status:** Accepted (P0)  
**Date:** 2026-07-31

## Context

SWARM needs a read-only AI operator for plant telemetry. NOVA DNA from emPOWER provides a proven pattern: catalog tools, RBAC floor, structured facts, and guarded narration — not free-form LLM database access.

## Decision

Port NOVA orchestration into Java (`com.biopower.novaspace`) as **Nova Space OP**:

1. **Rules-first search** (`SwarmSearchSlots`) selects catalog tool ids only.
2. **NovaPlan** gates execution; permissions filter steps per user/plant.
3. **Read-only skills** wrap existing SWARM services (dashboard, alerts, telemetry, SpaceAnalyser fan-out).
4. **FactPack** is the authority for answers; narration is deterministic in P0 (LLM optional later).
5. **AnswerGuard** blocks invented sensor references.

## Why catalog tools beat free LLM SQL

- Plant RBAC is enforceable at every skill boundary.
- Answers carry provenance (sensor, plant, tool).
- Partial module failure soft-fails without hallucination.
- Same pattern scales to HMI Safe Workflow (propose, not execute) in Phase 3.

## Out of scope (P0)

- ERP finance/HR skills
- HMI write from chat
- Partner API embedding
- Full Knowledge Graph / Event Bus (future evolution)

## API

`POST /api/nova-space-op/chat` — JWT authenticated, returns answer + toolsUsed + provenance.
