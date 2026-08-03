# NOVA Trend Engine

**Status:** Universal measurable trends — **live** late-comers · late task completion · AR overdue · KPI score + high streak (`3.1.15`)  
**Date:** 2026-07-14  
**Coords with:** NOVA Analysis (`src/lib/nova/analysis/*`), SearchEngine / lexicon, multimodule sticky bind  
**Non-goals:** free SQL · write-back · dashboard builder · inventing series points · stealing “why …” Analysis cues

---

## 0. Product directive (vision)

> **Trend is universal.** It is **not** limited to money / AR.  
> Any measurable item should be trendable: late-comers (attendance), KPI for a particular user, who held high KPI the longest, task lateness, collections, site visits, …  
> Shared contract + adapter registry; each measure plugs one loader.

AR overdue is **one adapter among many**, not the product definition.

---

## 1. Product definition

**NOVA Trend** answers **who / what** moves **over a timeline** (days → weeks → months): frequency, worsening, ranking, streak — not a single snapshot “why”.

| Cue class | Example | Trend answer | Money? |
|-----------|---------|--------------|--------|
| Late-comers | “late comers trend”, “who is frequently late” | People ranked by credible late punch-days | No |
| Task late completion | “who completes tasks after overdue most” | People ranked by completed-after-due | No |
| KPI person trajectory | “KPI trend for Amit” | Score series by period for that user | No |
| High KPI streak | “who has high KPI for a long streak” | People ranked by trailing periods ≥ 75 | No |
| AR overdue | “customers whose outstanding is worsening” | Overdue ₹ series + rising customers | Yes |

**Versus Analysis**

| | Analysis | Trend |
|-|----------|-------|
| Question | *Why is it here?* | *Who / what repeatedly / over time?* |
| Evidence | Factor pack + ranked drivers | Windowed series + rankings |
| Cue | `why …`, `analyse …` | `trend`, `over time`, `frequently`, streak / worsening |
| Narration | Optional LLM + digit-guard | Deterministic summary + table/sparkline |

---

## 2. Universal trend contract

```ts
NovaTrendBundle {
  schemaVersion: 1
  domain: "attendance_late" | "task_late_completion" | "ar_aging" | "kpi_score" | …
  entity: { kind, id?, label }
  metric: { id, label, unit }
  window: { from, to, label, source }
  grain: "day" | "week" | "month"
  series: [{ bucket, value, label? }]
  rankings: [{ rank, entityId?, label, value, secondary? }]
  methodology?: string
  links?: { title, href }[]
}
```

**Rules**

1. **Numbers only from loaders** — never invent series points.
2. **Window bind before load** — `ctx.range` → parsed → default 30d (KPI stretches default to 180d).
3. **Grain** — day ≤45d / week ≤120d / else month (adapters may override).
4. **RBAC** — domain skill floors; deny cleanly.
5. **Digit-guard** — narrative tokens ⊆ evidence.
6. **Registry first** — add a row in `measures.ts` before a new loader.

---

## 3. Measure registry (`src/lib/nova/trend/measures.ts`)

| id | Domain | Category | Status | Adapter |
|----|--------|----------|--------|---------|
| `attendance_late_frequency` | `attendance_late` | people | **live** | `adapters/attendance-late.ts` |
| `task_late_completion_frequency` | `task_late_completion` | ops | **live** | `adapters/task-late-completion.ts` |
| `ar_overdue_trajectory` | `ar_aging` | money | **live** | `adapters/ar-aging.ts` |
| `kpi_score_trajectory` | `kpi_score` | kpi | **live** | `adapters/kpi-score.ts` |
| `kpi_high_score_streak` | `kpi_score` | kpi | **live** | `adapters/kpi-score.ts` |
| `sales_volume_trajectory` | — | money | planned | — |
| `collections_trajectory` | — | money | planned | — |
| `site_visit_frequency` | — | ops | planned | — |
| `delivery_lateness` | — | ops | planned | — |
| `approvals_sla` | — | ops | planned | — |
| `stock_out_frequency` | — | ops | planned | — |

SoT notes:

- Attendance: `HrAttendanceDaily` + `isCredibleLateDay`
- Tasks: `Task` COMPLETED after due calendar day
- AR: SalesInvoice outstanding reconstructed as-of bucket ends (age > 30d)
- KPI score / streak: `KpiReview.totalScore`; high = ≥ 75 (Good+ band)

---

## 4. Plug-in points

```
User cue
  → isNovaTrendCue (Analysis keeps “why …”)
  → selectNovaTools → nova_trend
  → lexicon + skill ops.nova_trend
  → inferNovaTrendDomain → adapter load (RBAC)
  → formatNovaTrend
```

Conflict: `why … late` → Analysis; `late comers trend` / `frequently late` → Trend; money `late payment` → non-attendance late context.

---

## 5. UI in chat

Deterministic markdown: headline · summary · ranking table (Person / Customer) · optional sparkline · links.

---

## 6. Phased ship

| Phase | Scope | Exit |
|-------|-------|------|
| **P0** | Contract + attendance late + task late-completion | Cue → `nova_trend` |
| **P1** | AR + KPI trajectory | Shipped `3.1.14` |
| **P1b** | Universal vision docs + KPI high streak + measure registry | **Shipped `3.1.15`** |
| **P2** | Sales / collections / visits / delivery / approvals / stock | When skills live |

---

## 7. Tests · goldens

| Phrase | Expect |
|--------|--------|
| `late comers trend last 30 days` | `nova_trend` · `attendance_late` |
| `who is frequently late` | `nova_trend` · `attendance_late` |
| `KPI trend for Amit this quarter` | `nova_trend` · `kpi_score` |
| `who has high KPI for a long streak` | `nova_trend` · `kpi_score` + streak mode |
| `why so many late` | `nova_analysis` (not Trend) |

---

## 8. Deploy notes

Semver: next free after live tip. Push once → Railway SUCCESS + health version match + no Application error.
