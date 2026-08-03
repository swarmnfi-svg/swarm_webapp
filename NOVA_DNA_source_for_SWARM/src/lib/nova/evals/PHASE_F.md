# Phase F — Proactive insights (read-only)

**Skill:** `proactive_insights`

## Rules covered

| Insight id | RBAC floor | Money |
|------------|------------|-------|
| overdue_collections | invoice.read + org finance aggregates | amounts only if aggregates allowed |
| approval_bottlenecks | approval.read.* via novaOpenApprovalsWhere | none |
| payroll_blockers | salary / attendance / OT / reg perms | counts only |
| low_stock | stock.read | none |
| project_delays | project.read | none |
| gst_exceptions | invoice.read + org finance | counts |
| backup_connector_failures | backup history / tally.dashboard.view | none |

Each card is a `NovaFinding` with `confidence: "fact"` and deep-link recommendations only — no silent writes.

## Tests

`npx vitest run src/lib/nova/skills/ops/proactive-insights.test.ts`
