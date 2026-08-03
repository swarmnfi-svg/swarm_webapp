# NOVA Bug Sweep Report

**Date:** 2026-07-14  
**Repo tip baseline:** `3.1.15` (Trend universal registry + KPI high streak; prior `3.1.14` AR+KPI adapters) — `3.1.13` person prefer; `3.1.12` captions; `3.1.11` attendance credit; `3.1.10` Analysis cue B1  
**Sweep agent scope:** packs / skills / Analysis / Trend / Reader / money+ACL — **not** entity-resolve / QI gate / multi-word parent-child (sibling `bf7d9c4d`)  
**Status:** P0s **shipped in `3.1.9`**; Analysis cue B1 **closed in `3.1.10`**; Present narration contradict (`james school tasks`) **fixed in `3.1.12`**; residual person paraphrase `pending for Arif` **fixed in `3.1.13`**; Trend B2 AR/KPI **shipped in `3.1.14`**; Trend universal vision + high streak + measure registry **`3.1.15`**.

---

## Tip lineage

| Version | What | Live verify |
|---------|------|-------------|
| **3.1.7** | QI recovery — person/task + ranking after party gate | landed on main |
| **3.1.8** | QI polish — harness locks + party-only clarify copy | READY before 3.1.9 |
| **3.1.9** | Multi-entity parent-child + person paraphrases + sticky person **+ Analysis money-late + Trend attendance ACL** | READY before 3.1.10 |
| **3.1.10** | Analysis: `why {entity} tasks overdue` first-class cue (QI-A*) | READY before 3.1.11 |
| **3.1.11** | Attendance: credit early-in / late-out in monthly totals | READY before 3.1.12 |
| **3.1.12** | Present: `james school tasks` customer vs project caption consistency | READY before 3.1.13 |
| **3.1.13** | Person prefer: bare `pending|open for {Name}` (no tasks cue) | READY before 3.1.14 |
| **3.1.14** | Trend P1: AR aging + KPI score time-series adapters | READY before 3.1.15 |
| **3.1.15** | Trend universal (non-money first-class) + measure registry + high KPI streak | ship this tip |

---

## Explicit goldens — verified status

| Phrase / class | Status | Evidence |
|----------------|--------|----------|
| who completed most task → ranking | **Verified (sibling tip)** | QI harness + ranking early-exit on 3.1.7/3.1.8 |
| Arif overdue / pending tasks → staff | **Verified (sibling tip)** | person_fallback / staff kindHint goldens |
| Avaada / named project task scoping | **Verified** | QI-01..05 harness + party-first bare `Name tasks` |
| Money amounts in LLM history redaction | **Verified OK** | `sanitizeNovaFactsForLlm` + money-guard tests in `nova.test.ts` |
| Bare-entity follow-ups | **Deferred to sibling** | Sticky / multi-word parent-child WIP |
| AR aging / KPI score trend cues | **Verified (`3.1.14`+)** | `trend.test.ts` domain + routing goldens |
| Late-comers / high KPI streak | **Verified (`3.1.15`)** | goldens + measure registry |

Harness: committed QI goldens (QI-01..10, R1–R3, P1–P5) pass. Sibling **WIP** goldens for `show me Arif overdue tasks` / `does Arif have…` currently fail tool routing (`search_entities` vs `tasks_summary`) — owned by sibling multi-entity tip, not this sweep.

---

## Findings table

| ID | Sev | Engine | Symptom | Root cause | Action |
|----|-----|--------|---------|------------|--------|
| **S1** | **P0** | Analysis / tool routing | `why late payment` / `why late invoices` / `why late delivery` forced `nova_analysis` | `pickNovaQueryDepth` matches bare `\bwhy\b`; `selectNovaTools` treated `depth===analysis` as hard route, bypassing `isNovaAnalysisCue` + `isNonAttendanceLateContext` | **Fixed locally** — depth thin for money/ops late; routing excludes money-late from analysis depth win |
| **S2** | **P0** | Trend (attendance) | Self-only staff can fetch another person’s late trend by name | `loadAttendanceLateTrend` resolved `personHint` with **no** ACL (unlike `attendance_late_summary` / task trend) | **Fixed locally** — deny peer + outside-team; ACL unit tests added |
| **S3** | — | Search / Entity / Gate | Combined-word multi-entity / parent-child auto-bind | User: “was enable earlier” | **Sibling owns** — `party-hierarchy.ts` + resolve collapse WIP |
| **S4** | — | QI person/task | Ranking / Arif / Avaada regressions from QI gate | Over-broad `entitySpan` + party gate | **Verified fixed** on tip 3.1.7/3.1.8 — do not re-touch |
| **B1** | P1 | Analysis domain cues | `why are avaada tasks overdue` relied on bare depth, not cue regex | Cue patterns don’t allow entity between `why are` and `tasks overdue` | **Fixed in `3.1.10`** — `isNovaAnalysisCue` accepts entity span; QI-A1…A3 |
| **B2** | P1 | Trend | AR aging / KPI score trends still `plannedBundle` | Matrix marks `planned` | **Shipped `3.1.14`**; universal registry + high streak **`3.1.15`** |
| **B3** | P2 | Packs / skills | Silent `.catch(() => 0/null)` on several finance rollups | Soft-fail hides provider/DB errors as zeros | Backlog — surface trusted empty vs error |
| **B4** | P2 | Reader | Intent ACL solid on create gates | No new Reader money leak found | **OK** — keep intent-acl tests |
| **B5** | P2 | Money / ACL | Sales/PO/expenses/CBG money-hide paths look sound | Staff+invoice.read soft-deny covered by tool-permissions tests | **OK** |
| **B6** | P2 | Analysis SoT | KPI adapter still bridges report-card factors | Aligns with Staff scorecard loader | **OK** — keep goldens |

---

## Fixes landed in working tree (this sweep)

1. `src/lib/nova/query-structure/late-context.ts` — shared `isNonAttendanceLateContext`
2. `src/lib/nova/query-structure/depth.ts` — money/ops `why late …` → `thin`
3. `src/lib/ai/nova-tools.ts` — Analysis depth route excludes money-late (coexists with sibling resolve WIP)
4. `src/lib/nova/analysis/domain.ts` — re-export shared late-context helper
5. `src/lib/nova/trend/domain.ts` — import late-context from query-structure (no Analysis cycle)
6. `src/lib/nova/trend/adapters/attendance-late.ts` — person ACL parity with attendance skill
7. Tests: `attendance-late.acl.test.ts`, depth goldens in `query-structure/index.test.ts`, Analysis money-late suite green

**Absorbed into tip `3.1.9`** with multi-entity / engines improvise (parent-child, person paraphrases, sticky person) — Railway VERIFY on health `version===3.1.9`.

---

## Engine coverage notes (12 engines)

| # | Engine | Sweep note |
|---|--------|------------|
| 1 | Search | QI gate verified sibling; multi-entity deferred |
| 2 | Intent / Lexicon | Sibling expanding person extractors — defer |
| 3 | Think | No new P0 found this pass |
| 4 | Dialog / Sticky | Sibling sticky personHint skip — defer |
| 5 | Clarify | Party-only copy verified on 3.1.8 |
| 6 | Entity Resolve | Sibling parent-child — **defer** |
| 7 | Skills | Money-hide OK; no new P0 |
| 8 | Packs | Cash bank hidden-balance OK; B3 backlog |
| 9 | Analysis | **S1 fixed**; KPI SoT OK |
| 10 | Trend | **S2 fixed**; **B2 AR/KPI `3.1.14`**; universal + streak **`3.1.15`** |
| 11 | Present / Narrate | Money/digit guards OK |
| 12 | Reader | Intent ACL OK |

---

## Remaining backlog

1. ~~Optional: broaden `isNovaAnalysisCue` for `why … {entity} … tasks overdue`~~ → **done `3.1.10`**.
2. ~~Trend P1 adapters: AR aging, KPI score time series~~ → **done `3.1.14`**; universal measure registry + high KPI streak → **done `3.1.15`**.
3. Soft-fail finance `.catch` → trusted empty messaging (P2).
4. Trend P2 registry rows: sales / collections / site visits / delivery / approvals / stock (planned in `measures.ts`).

---

## Coordination

- Sibling owns entity resolve / QI improvise tip(s) — **never overwrite** `party-hierarchy*`, person_fallback expansions, gate party-only.
- This sweep report + local Analysis/Trend ACL fixes stay rebase-friendly on top of their tip.
