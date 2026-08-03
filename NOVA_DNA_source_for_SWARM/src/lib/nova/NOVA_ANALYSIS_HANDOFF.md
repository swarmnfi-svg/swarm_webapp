# NOVA Analysis engine — handoff (KPI report card owner)

**This agent owns:** KPI report card UI + ACL + `kpi_report` / `kpi_summary` + `buildKpiReportCard`.  
**Sibling owns:** cross-module **NOVA Analysis** (`src/lib/nova/analysis/*`, skill `nova_analysis`).

## Shipped (KPI)

| Surface | Path / id |
|--------|-----------|
| UI report card | `/kpi/scorecard/[userId]?periodId=` |
| Alias | `/kpi/report-card/[userId]` → scorecard |
| PDF | `/api/kpi/scorecard-pdf` |
| Builder | `src/lib/kpi/report-card.ts` → `buildKpiReportCard` |
| Analysis factors | `src/lib/kpi/report-card-factors.ts` → `buildKpiAnalysisBundle` (Analysis imports) |
| ACL | `canViewKpiScorecard` — `kpi.read.all` / `.team` / `.self` (+ grants) |
| NOVA dump | `kpi_report` — structured boosts/drags/trend |
| NOVA list | `kpi_summary` |

### ACL

- Admin / Director / `kpi.read.all` grant → any user  
- `kpi.read.team` → self + team  
- `kpi.read.self` → own only  

### Routing split (coordinate)

| Phrases | Tool |
|---------|------|
| `why is my kpi low/high`, `explain kpi`, Analysis cues | **`nova_analysis`** (sibling) |
| `kpi report card`, `kpi breakdown`, `kpi report` | **`kpi_report`** (this agent) |
| `kpi list`, `{person} kpi`, bare KPI | **`kpi_summary`** |

## Sibling — reuse, don’t fork

1. Prefer `canViewKpiScorecard` + `loadKpiScorecard` / `runKpiReport` for KPI domain.  
2. Map scorecard lines through `buildKpiAnalysisBundle` (already in adapters).  
3. Deterministic factor math stays in KPI; Analysis narrates / ranks across modules.

## Version

Ship **`3.0.75`** (above live ~3.0.71+). Deploy only with user approval (`git push` **or** `railway up`, then poll `/api/health`).

## Out of scope

Desktop / Android · incentive formula changes · Analysis pack registry (sibling).
