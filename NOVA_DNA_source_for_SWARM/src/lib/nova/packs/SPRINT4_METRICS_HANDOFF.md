# Certified metrics + readonly cutover — Sprint 4 HANDOFF

**Branch:** `nova-3-sprint4-prep` only  
**Status:** PREP (full metric contract + draft registries + cutover checklist) — **not** merge-ready to `main`  
**Plan:** [`NOVA_3_0_PLAN.md`](../NOVA_3_0_PLAN.md) §6 Trust contract · Phase 4 · Ship #8

---

## Dependency gate (blocking)

| Depends on | Why | Gate |
|------------|-----|------|
| **Sprint 3 — report plane live** | Certified metric versions freeze into `NovaReport` envelopes (`metricVersions`). Cutover of skill reads to `NOVA_READONLY_DATABASE_URL` must not land before directors can save/download immutable packs. | **REQUIRED** — do **not** push/merge this branch to `main` until the **deployer confirms Sprint 3 is health-matched** (save + download ACL + regenerate + RBAC 403 path green on the live version). |
| **Sprint 0 — readonly scaffold** | `prisma-readonly.ts` + SQL role scaffold + CI import gate already on tip. This prep deepens the checklist and usage map. | Assumed on tip |

**Hard rule:** stay on `nova-3-sprint4-prep`. No `git push` to `main`, no Railway, no version bump from this prep. Merge only after Sprint 3 health-match confirmation from the deployer.

---

## Metric contract (full fields)

Every pack-critical binding must include:

| Field | Purpose |
|-------|---------|
| `id` / `version` | Stable identity; drift breaks CI |
| `definition` | Human-readable meaning |
| `calculation` | Deterministic formula / skill mapping |
| `source` | Skill id(s) / ledger objects — never LLM |
| `unit` | inr / count / days / … |
| `aggregation` | sum / count / avg / latest |
| `periodRule` | month / fy / point_in_time / … |
| `gstTreatment` | inclusive / exclusive / n/a |
| `emptyMeaning` | What “no rows” means |
| `access` | Permission / role prerequisites |
| `certification` | certified \| draft \| deprecated |
| `owner` | Steward team |
| `lastValidated` | ISO date last checked vs skill output |

Types + registries: `src/lib/nova/semantic/certified-bindings.ts`  
Lean dictionary (id/label/unit/…) remains in `metrics.ts`; Sprint 4 bindings **extend** it.

---

## Draft / certified registries

| Pack | Export | Status |
|------|--------|--------|
| **Month Performance** | `NOVA_CERTIFIED_MONTH_BINDINGS` | **certified** (8 metrics) |
| **Project Command** | `NOVA_DRAFT_PROJECT_BINDINGS` | **draft** (8 metrics; steward after Sprint 5 wiring) |
| **Collection Attention** | `NOVA_DRAFT_COLLECTION_BINDINGS` | **draft** (4 core AR metrics) |

Ids:

- Month: `SPRINT4_MONTH_METRIC_IDS`
- Project: `SPRINT4_PROJECT_METRIC_IDS` (aligned with Sprint 5 `PROJECT_COMMAND_METRIC_IDS`)
- Collection: `SPRINT4_COLLECTION_METRIC_IDS`

CI: `assertCertifiedBindingsAgainstDictionary()` + `assertFullMetricContract()` in architectural / semantic tests.

---

## `NOVA_READONLY_DATABASE_URL` cutover

Checklist (ordered): `src/lib/nova/semantic/readonly-cutover.ts` → `NOVA_READONLY_CUTOVER_CHECKLIST`

Prisma lane map: `NOVA_PRISMA_USAGE_MAP`

| Lane | Client | Who |
|------|--------|-----|
| `skill_readonly` | `@/lib/nova/prisma-readonly` | **All catalog skills** |
| `nova_plane_write` | `@/lib/prisma` | memory, aliases, report-service |
| `test_mock` | mocked | unit tests |

**Invariant:** skills must never import write-capable `@/lib/prisma`. Tip CI already enforces this; cutover completes when dedicated URL + `nova_readonly` role are live (optional `NOVA_READONLY_REQUIRE=1`).

SQL scaffold: `scripts/nova-readonly-role-scaffold.sql` (DBA review before prod).

---

## Implementer checklist (post–Sprint 3 health-match)

1. Confirm deployer: Sprint 3 `/api/health` version matches report plane.
2. Merge or cherry-pick this prep onto main **without** bumping from the prep commit alone — ship with a unique semver only on the deployer path.
3. DBA: create `nova_readonly`, set `NOVA_READONLY_DATABASE_URL`, smoke SELECT-only.
4. Wire UI badges: Month pack `certification: "certified"` + version from bindings.
5. Steward-promote Project / Collection drafts → certified after pack goldens green.
6. Optionally set `NOVA_READONLY_REQUIRE=1` in production after smoke.

---

## Explicit non-goals (this PREP)

- No version bump, no Railway, no push/merge to `main`
- No dashboard builder / free viz / semantic-as-product brand
- No ERP writes — skill lane stays SELECT-only
- No promoting Project/Collection to `certified` without steward review

---

## Files in this PREP

- `src/lib/nova/semantic/certified-bindings.ts` — full contract + Month/Project/Collection registries
- `src/lib/nova/semantic/readonly-cutover.ts` — cutover checklist + prisma usage map
- `src/lib/nova/packs/SPRINT4_METRICS_HANDOFF.md` — this document
- `src/lib/nova/semantic/index.ts` — exports
- `src/lib/nova/semantic/semantic.test.ts` / `nova-architecture.ci.test.ts` — contract + cutover shape tests
