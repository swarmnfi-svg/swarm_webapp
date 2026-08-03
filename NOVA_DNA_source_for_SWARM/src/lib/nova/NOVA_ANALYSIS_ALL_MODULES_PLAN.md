# NOVA Analysis — All Modules Plan

**Date:** 2026-07-14  
**Status:** MVP adapters shipped (P0); P1–P2 are plug-in backlog  
**Engine:** `src/lib/nova/analysis/` · skill `nova_analysis`  
**Contract:** `module-contract.ts` + `modules/registry.ts`  
**Coords:** `NOVA_ANALYSIS_ENGINE.md` · KPI `buildKpiReportCard` / `NOVA_ANALYSIS_HANDOFF.md`  
**Non-goals:** free SQL · agent tool-pick · write-back · invent numbers (`NOVA_SELF_RELIANCE_LIGHT_PLAN.md`)

---

## Product shape (repeat KPI)

Every module follows the same light stack:

1. **Catalog skill(s)** fetch facts under existing `can()` / money-hide / team scope  
2. **Pure builder** `build*AnalysisBundle` / adapt skill fact → `NovaAnalysisBundle` (factor schema v1)  
3. **Engine** `runNovaAnalysis` — deterministic rank + **LLM why-narration** (digit + factorId guards)  
4. **Cues** in `domain.ts` / lexicon → `nova_analysis` (not a new agent)

LLM never invents ₹/%; empty/denied packs stay honest; 429 → facts-only.

---

## Priority bands

### P0 — shipped MVP (do not block)

| Module id | Source tools | Builder / load |
|-----------|--------------|----------------|
| `kpi` | scorecard / `kpi_report` + `kpi_summary` | `adaptKpiReportCardToBundle` / `buildKpiAnalysisBundle` |
| `tasks` | `tasks_summary` | `adaptTasksFactToAnalysisBundle` |
| `outstanding` | `customer_outstanding`, `overdue_invoices`, `receipts_summary` | `adaptOutstandingFactsToAnalysisBundle` |
| `attendance` | `attendance_late_summary` | `adaptAttendanceFactToAnalysisBundle` |
| `project` | `tasks_summary`, `projects_summary` | `adaptProjectFactsToAnalysisBundle` |

**Verify:** `why is my kpi low` · `why overdue` · `analyze this project` · `why is outstanding high` · `attendance analysis`

### P1 — next adapters (thin, reuse skills)

| Module id | Source tools | Expected factors |
|-----------|--------------|------------------|
| `approvals` | `approvals_summary` | aged open count, idle ≥N days samples |
| `leave` | `leave_summary` | pending / balance / named subject |
| `delivery` | `delivery_summary` | delayed count, late samples |
| `stock` | `stock_summary` | below-min count, item samples |
| `bank_recon` | `bank_recon_summary` | unreconciled count, aging buckets |
| `incentives` | `incentives_summary` | unpaid / open by ACLs |
| `sales` | `sales_summary` | period totals already in skill (no invented MoM) |
| `collection` | `collection_attention` | outstanding + overdue composite facts |

### P2 — deepen when finders stable

| Module id | Notes |
|-----------|--------|
| `salary` | HR ACL only; respect Staff money-hide |
| `grn` | period-required like GRN skill |
| `purchase` | PO/PR/bills thin counts — no invented margins |
| `gst` | `gstr_snapshot` / `gst_docs_summary` |
| `cash_banking` | pack facts only |
| `month_performance` | attention cards as factors (cap 3) |
| `documents` | metadata search only — no content invention |

---

## Plug-in checklist (for each new module)

1. Pure `buildXAnalysisBundle` (or adapt from skill `data`) in `analysis/adapters.ts` or module file  
2. Register row in `modules/registry.ts` with `priority`, `sourceToolIds`, `cues`, `rbacNote`, `load`  
3. Add `isNovaAnalysisCue` / `inferNovaAnalysisDomain` matches  
4. Golden: cue → `nova_analysis`; denied without ACL; digit-guard unit test  
5. Do **not** widen ACL beyond the source skill  

---

## Ship policy

- Ship KPI + framework without waiting for P1–P2.  
- Version bump > live tip; one deploy trigger (`git push` preferred).  
- Architecture CI still forbids `free_sql` / write tools in skills.
