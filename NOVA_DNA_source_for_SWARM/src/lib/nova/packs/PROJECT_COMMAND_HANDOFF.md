# Project Command — Sprint 5 HANDOFF

**Branch:** `p2/project-command-prep` (prep lite) · historically `nova-3-sprint5-prep`  
**Status:** PREP lite (dashboard contract + stub API + pack goldens) — **not** a dashboard rewrite; **no deploy / version bump from this track**  
**Plan:** [`NOVA_3_0_PLAN.md`](../NOVA_3_0_PLAN.md) §9 pack #2 · Phase 5 · Ship #9

---

## Prep lite (this branch)

| Piece | Path | Notes |
|-------|------|--------|
| Dashboard spine contract | `project-command-dashboard.ts` | Chapters align to `PROJECT_COMMAND_CHAPTER_TOOLS` / metric ids |
| Stub API | `GET /api/projects/[id]/command` | Reuses ERP reads (`summarizeProjectFinancials`, task/PO/SO/delivery counts) — **not** skill fan-out |
| Report plane | `PROJECT_COMMAND_REPORT_PLANE_GATE` | **Hard-gated** — `saveReportAvailable: false` until deployer health-match |
| Named routing | unchanged | James School / named-project → `project_command` (SearchEngine + goldens) |

**Non-goals:** full Project Command UI, milestone theatre, Save report, version bump, Railway.

---

## Dependency gate (blocking)

| Depends on | Why | Gate |
|------------|-----|------|
| **Sprint 3 — report plane live** | Project Command answers must be saveable as immutable `NovaReport` snapshots (pack → envelope → bucket → download ACL re-check). Without a health-matched report plane, shipping the pack creates answers directors cannot forward safely. | **REQUIRED** — do **not** push/merge this branch to `main` until the **deployer confirms Sprint 3 is health-matched** (save + download + regenerate + RBAC 403 path green on the live version). |
| **Sprint 4 — certified metrics** | Pack metric refs (`PROJECT_COMMAND_METRIC_IDS`) should show draft→certified badges and CI drift checks. Shared ids with Month (`sales.period_total`, `receipts.period_collected`, `ar.overdue_invoice_count`, …). | **IDEAL** — implement against dictionary + draft refs now; steward-certify after Sprint 4 bindings exist for the project set. |

**Hard rule for integrators / parent agents:** stay on `nova-3-sprint5-prep`. No `git push` to `main`, no Railway, no version bump from this prep. Merge only after Sprint 3 health-match confirmation from the deployer.

---

## Pack contract (frozen in PREP)

| Field | Value |
|-------|--------|
| **Pack id** | `project_command` (`NovaPackId` + recipe id) |
| **Prep module** | `src/lib/nova/packs/project-command-prep.ts` |
| **Live runner (baseline on tip)** | `src/lib/nova/packs/project-command.ts` — fan-out exists; wire metrics + handoff gaps below |
| **Stub builder** | `buildProjectCommandPackStub()` → `NovaPackResult` (no skill dispatch, no invented facts) |
| **Signature ask** | *“tell me everything important about this project”* |

### Questions (routing / examples)

See `PROJECT_COMMAND_QUESTIONS` — includes signature, named project, deep dive, follow-up after Month.

### Metrics list (draft)

See `PROJECT_COMMAND_METRIC_IDS`:

- `projects.active_count`
- `tasks.open`
- `sales_orders.count`
- `purchase_orders.count`
- `delivery.summary`
- `sales.period_total`
- `receipts.period_collected`
- `ar.overdue_invoice_count`

Stub emits these as `certification: "draft"`, `value: null`. Live pack must fill from catalog skill facts only.

### Finding shapes

See `PROJECT_COMMAND_FINDING_SHAPES`:

| Shape id | Chapter | Material? | Notes |
|----------|---------|-----------|--------|
| `project_resolve_gap` | Resolve | yes | Clarify / refuse inventing health scores |
| `project_spine` | Spine | no | scopedFacts summary |
| `open_tasks` | Tasks | yes | Attention candidate |
| `sales_orders` | SO | no | |
| `purchase_orders` | PO | no | |
| `deliveries` | Delivery | no | |
| `invoices` | Invoice | no | |
| `cash_collected` | Cash | no | |
| `overdue_attention` | Attention | yes | Collection chapter on project |
| `milestones_gap` | Milestones | no | **Deferred** — no catalog skill; do not invent theatre |

Attentions: ≤ `NOVA_MONTH_ATTENTION_PRIMARY_MAX` (3) primary; empty if nothing material.

### Chapters / tools

`PROJECT_COMMAND_CHAPTER_TOOLS` — catalog-only fan-out (SO/PO/delivery/invoice/cash/tasks + projects + overdue).

---

## Goldens

`PROJECT_COMMAND_GOLDENS` in the prep module — project-scoped queries for SearchEngine / recipe routing evals (signature, named bind, follow-up after Month, ambiguous → clarify, thin `project_health` vs deep pack).

Wire into CI when Sprint 5 implementer lands; do not claim green until Sprint 3 report save path can round-trip a Project Command `NovaPackResult`.

---

## Implementer checklist (post–Sprint 3 health-match)

1. Confirm deployer: Sprint 3 `/api/health` version matches report plane (save, download ACL, regenerate = new id).
2. Fill stub metrics from skill facts; keep draft until Sprint 4 certifies project set.
3. Map facts → Finding shapes only; never invent ₹ or “health scores”.
4. Ensure “Save report” from a Project Command answer uses the same report plane as Month pack.
5. Add goldens to CI; keep `project_health` thin recipe distinct from `project_command`.
6. Milestones: leave deferred until a catalog skill exists — omit theatre.

---

## Explicit non-goals (this PREP)

- No version bump, no Railway, no push/merge to `main`
- No dashboard builder / free viz / milestone invention
- No ERP writes — pack is read-only catalog skills only
- No CBG-as-fourth-pack (optional section later, not required for v1)

---

## Files in this PREP commit

- `src/lib/nova/packs/project-command-prep.ts` — id, questions, metrics, finding shapes, goldens, stub
- `src/lib/nova/packs/PROJECT_COMMAND_HANDOFF.md` — this document
- `src/lib/nova/packs/packs.test.ts` — stub + contract smoke

Baseline `project-command.ts` on tip may already fan-out; treat PREP as the **contract authority** until implementer aligns metrics/findings to shapes above **after** Sprint 3 gate.
