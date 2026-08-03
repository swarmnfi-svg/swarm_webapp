# NOVA QI Upgrade — Harm Audit & Correction Plan

**Date:** 2026-07-14  
**Scope:** Query Intelligence upgrade tips **3.0.96 (P0)** → **3.1.1 (P1/P2)** → **3.1.5 (kindHint residuals)** vs user-reported person/task regressions  
**Baseline live:** ~**3.1.6** KPI/docs (postQI tips already on main)  
**Sibling recovery:** agent [`bf7d9c4d`](bf7d9c4d-4b24-48e5-9dbd-8447258f5cbd) owns the **person/task recovery tip** — this doc must **not** fight that tip; ship recovery first; this audit rides recovery tip or stays local until then.  
**Coords:** `NOVA_QUERY_INTELLIGENCE_UPGRADE_PLAN.md`, `query-structure/*`, `nova-tools.ts`, `nova-search-engine.ts`

---

## 1. Verdict

| Question | Answer |
|----------|--------|
| **Net outcome** | **Mixed → lean net harm for daily ops chat** until person/task recovery ships |
| **Confidence** | **High (~0.85)** — three independent user phrases map cleanly to QI parse/gate changes; Avaada-class gains are real and should be kept |

**Executive read:** QI fixed a **real** product failure mode (silent org-wide / polluted entity hints on party·project·task phrasing — the Avaada class). It then **over-generalized** “entitySpan ⇒ party/project bind-or-clarify” so that **staff person + tasks** and **WH ranking** asks were treated as unfinished party lookups. Users experience that as “NOVA upgradation degraded performance” because the broken path is the high-frequency personal-ops path, while the fixed path is the less frequent brand/project path.

| Lens | Score |
|------|-------|
| Party / project / place framing (`tasks in avaada`, `X project task`) | **Net gain** |
| Person + tasks (`Arif pending`, `tasks for arif … overdue`) | **Net harm** |
| Ranking WH (`who completed most task`) | **Net harm** |
| Analysis / Trend structure inheritance | **Modest gain** (kept; not the user pain) |
| Overall product trust (this week’s reports) | **Harm dominated** until recovery |

**Do not fully revert QI.** Prefer **conditional gate** + broadened person_fallback + ranking early-exit (recovery tip design).

---

## 2. Harm inventory vs gain inventory

| ID | Class | Symptom (user / repro) | Mechanism (QI tip) | Severity | Keep / Fix |
|----|-------|------------------------|--------------------|----------|------------|
| H1 | **Ranking → company dead end** | “who completed most task” → bind company / entity resolve dead end | Broad `parseEntityModuleAsk` / role-strip can leave a span; SE/plan lacked early **task-completion ranking** win before party-module; gate message frames junk as “project or customer” | **P0** | Fix (ranking early-exit; never invent entitySpan on ranking) |
| H2 | **Grammar leftovers as party** | “which tasks for arif **is over due**” → *I need to bind “arif is over due”…* | Trailing `for X` parser + missing tail scrub; `refuseSilentOrgWide` treats **any** unresolved span as party | **P0** | Fix (scrub tails; staff kindHint; gate party-only) |
| H3 | **Person miss → party miss copy** | “Arif pending tasks” → *No customer, vendor, or project matching “Arif”* | P0 `person_fallback` regex only matched bare `Name tasks` (± trailing focus), **not** `Name pending tasks` / `tasks for Name`; on miss, scoped `tasks_summary` returned **party** `not_found` | **P0** | Fix (broaden person_fallback / person-prefer) |
| H4 | **Gate over-breadth** | Soft personal-task asks blocked by org-wide silence clarify | P1 `refuseSilentOrgWide`: entitySpan present ⇒ clarify for scoped tools — **no** discrimination of staff vs party vs ranking noise (until recovery WIP) | **P0** | Fix (party/project-only gate) |
| H5 | **Harness blind spot** | Regressions shipped through `release:verify` | Goldens QI-01…QI-10 + QI-H1 are **Avaada/party-first**; QI-06 encodes `aalok tasks` as `expectEntity` + `forbidOrgWideScoped` (party-gate mindset), not assert person_fallback / ranking | **P1** | Tests |
| G1 | **Place framing scoped** | `tasks in avaada` no longer silent org-wide | Single-token party accept + place framing + scoped clarify | — | **Keep** |
| G2 | **Role-word strip** | `Avaada project task` finds Avaada (not `"Avaada project"`) | `parseNovaEntityRoleSpan` / shared strip | — | **Keep** |
| G3 | **No silent org-wide on named party** | Unresolved brand no longer dumps org task totals | `refuseSilentOrgWide` + plan gate | — | **Keep intent**; narrow application |
| G4 | **Shared structure** | One parse → SE / plan / Analysis / Trend / Reader caption | `query-structure/*`, kindHint residuals 3.1.5 | — | **Keep** |
| G5 | **Depth / Hinglish / sticky harden** | `avaada ka task`; sticky module without bind clarifies | P1/P2 | — | **Keep** |
| G6 | **Telemetry skeleton** | miss / wrong-scope counters + crumbs | `qi-metrics` + harness in 3.1.4 | — | **Keep**; extend person/ranking outcomes |

**User verdict mapping:** H1+H2+H3 alone justify “degraded NOVA performance.” G1–G3 justify **not** rolling back the whole QI series.

---

## 3. Root-cause themes

### Theme A — Over-broad `entitySpan`

Shared parsers (`parseEntityModuleAsk`, trailing `for|of|from`, why/tasks peel) optimize for **party presence**. They also emit spans for:

- staff first names (`Arif`),
- grammar crumbs (`arif is over due`),
- ranking residues (`completed most`, WH leftovers),

…whenever acceptance helpers were soft (`acceptsPartyEntitySpan(..., allowSingleToken=true)` + incomplete noise filters).

**Effect:** Orchestrator / gate believe a **party** was named → party resolve or party clarify UI.

### Theme B — Party-only **message**, party-**and**-person **behavior**

Invariant P3 (“no silent org-wide when entity intended”) is correct for brands/projects. P1 implemented it as:

> any `entitySpan` + scoped tool + no bind → clarify *“bind to a project or customer”*

without first asking: **was the span a party/project?** Recovery WIP adds ranking-noise skip + `entityKindHint === "staff"` skip; that is the right shape.

**Effect:** Users hear a customer/vendor/project demand on staff queries.

### Theme C — `person_fallback` too narrow (and too late)

P0 shipped a deliberate demotion for `aalok tasks`:

```text
^[show…]? {token} tasks[s]? (pending|open|overdue)? $
```

Missed high-frequency variants:

| Utterance | Pre-QI / expected | Post P1 gate (broken) |
|-----------|-------------------|------------------------|
| `aalok tasks` | person_fallback | often OK (covered) |
| `Arif pending tasks` | person path | party not_found |
| `tasks for arif` | person path | party / gate |
| `which tasks for arif is over due` | person + overdue | gate on junk span |
| `who completed most task` | org ranking | entity dead end |

Fallback also ran **after** party resolve miss; staff-shaped `for Name` never preferred person **before** party.

### Theme D — Acceptance tests optimized for the Avaada incident

Harness + plan goldens closed G1–G3. They did **not** lock:

- ranking WH never invents entity,
- personal-task variants → `person_fallback` / staff resolve,
- gate **must not** fire when `kindHint=staff` or ranking.

So CI green ≠ user green on person ops.

### Theme E — Intent was right; sequencing was wrong

QI plan §7 already listed **Person vs party** as a risk with mitigation `person_fallback` + place framing. Mitigation lagged **gate + parser expansion** (3.1.1), then kindHint residuals (3.1.5) without expanding personal-task shapes. Classic: safety rail for parties became a wall for people.

---

## 4. Correction plan

### Coord with recovery agent (non-negotiable)

| Agent | Owns |
|-------|------|
| **Recovery [`bf7d9c4d`](bf7d9c4d-4b24-48e5-9dbd-8447258f5cbd)** | Implementation tip ASAP — ranking early-exit, person-first personal tasks, party-only gate, goldens, optional `NOVA_QI_STRICT_PARTY_GATE` |
| **This audit** | Verdict + plan only — **do not** tip-conflict; doc ships on recovery tip **or** local until tip lands |

Recovery WIP already touches (aligned):

- `query-structure/personal-task.ts` (ranking / place / person shapes / noise / scrub)
- `parse-entity-module.ts` (ranking null parse; trailing `for` → staff kind; noise rejects)
- `gates.ts` (noise + staff kindHint skip)
- `nova-search-engine.ts` (ranking before party-module)
- `nova-tools.ts` (person_prefer / broadened fallback / `NOVA_QI_STRICT_PARTY_GATE`)

### P0 — Ship ASAP (recovery tip)

1. **Ranking:** `isNovaTaskCompletionRankingAsk` → SE early win (`task_completion_ranking`, **no** entityHint); `parseEntityModuleAsk` returns null; tools skip entityFilter from structure.
2. **Person-first personal tasks:** shapes for `Name pending|open|overdue tasks`, `tasks for Name [is] overdue`, `pending tasks for Name`; `entityKindHint=staff` → prefer person bind (skip party dead-end) unless place-framed.
3. **Broaden `person_fallback`:** after party miss, demote when `isNovaPersonTaskFallbackAsk` (not only bare `Name tasks`).
4. **Party/project-only org-wide gate:** `refuseSilentOrgWide` **never** fires on ranking noise, `kindHint=staff`, or set `personHint`; place framing (`in|at|on|for project`) stays party-strict.
5. **Scrub tails:** drop `is|are … overdue|pending` crumbs before resolve.
6. **Goldens (minimum):** the three user phrases + `aalok tasks` + `tasks in avaada` / `Avaada project task` still scoped.
7. **Ship:** next free tip after live green (~**3.1.7+**), full `release:verify`, **one** deploy trigger, poll `/api/health`.

### P1 — Harden so this class cannot return

1. Expand QI JSONL: ranking variants, person-task variants, negative cases (must **not** party-clarify).
2. Fix QI-06 semantic: assert person path / demotion, not “forbidOrgWideScoped as party clarify success.”
3. Telemetry: counters for `person_prefer`, `person_fallback`, `ranking_early`, `scoped_gate_fired`; alert if gate fires on staff kindHint.
4. **Feature flag kill-switch** (see §5): default soft person path; `NOVA_QI_STRICT_PARTY_GATE=1` only for debug / party-first experiments.
5. Manual chat QA checklist on staging with real staff names (Arif-class) + Avaada-class brand.

### P2 — Product polish (after trust restored)

1. True **person vs party conflict** clarify when both staff and customer/project hit the same token (chips — never silent steal).
2. Admin QI metrics page already stubbed — surface person_fallback vs clarify_miss rates.
3. Optional sticky person bind for short module follow-ups (`pending tasks` after “Arif tasks”) — mirror party sticky carefully.
4. Revisit Analysis/Trend person matrix (mirrors party soft-scope) once P0 goldens stable.
5. Doc sync: mark QI plan risk “Person vs party” as **materialized** then **mitigated** with tip SHA.

---

## 5. Recommended feature flag / kill-switch

| Flag | Default | Behavior |
|------|---------|----------|
| **`NOVA_QI_STRICT_PARTY_GATE`** | **unset / off** | Soft path: personal-task shapes + staff kindHint prefer person; ranking never gated; party/project place framing still bind-or-clarify |
| `NOVA_QI_STRICT_PARTY_GATE=1` | opt-in | Force party-first even on soft personal-task asks (legacy P1 behavior for debug / A/B) |

**Ops kill interpretation:**

- If residual party-false-positives appear after recovery → **keep flag off**; tighten `acceptsPartyEntitySpan` / place framing instead of re-enabling strict.
- If a future tip re-breaks person path and recovery is days away → set **`NOVA_QI_STRICT_PARTY_GATE` is already the inverse**; prefer a dedicated **`NOVA_QI_PARTY_ORG_GATE=0`** only if product wants to disable **all** org-wide refusal (not recommended — would revive Avaada silent org-wide). Better kill: **disable gate for `tasks_summary` only** via env `NOVA_QI_TASKS_ORG_GATE=0` as emergency (document if added).

**Recommendation:** Ship recovery with **`NOVA_QI_STRICT_PARTY_GATE` documented**; do **not** add a full QI off-switch that drops G1–G3. Avaada scoping must remain on.

---

## 6. Success criteria

| # | Criterion | Pass |
|---|-----------|------|
| S1 | `who completed most task(s)` | Org/assignee **ranking** via `tasks_summary` focus completed — **no** customer/vendor/project bind demand |
| S2 | `which tasks for arif is over due` / overdue variants | **Arif** as staff/person; overdue/open filter — **no** “bind arif is over due” |
| S3 | `Arif pending tasks` / `arif open tasks` / `tasks for arif` | Person path; pending/open list — **not** “no customer/vendor/project matching Arif” |
| S4 | `aalok tasks` | Still person_fallback / person resolve — no org invent |
| S5 | `tasks in avaada` / `Avaada project task` / `avaada tasks` | Still **scoped** party/project (or clarify) — **never** silent org-wide |
| S6 | `release:verify` | Green including expanded QI harness |
| S7 | Telemetry | wrong_scope ≈ 0 on party goldens; person_fallback / ranking crumbs present on S1–S4 |

**Definition of done for “upgrade net gain again”:** S1–S5 all green on live tip + user re-tries the three phrases without party dead ends.

---

## 7. Tip / ship notes (docs vs recovery)

- **Do not** delay recovery ship for this markdown tip.
- Prefer: recovery tip lands code+goldens (+ optionally this file); or this file stays **uncommitted local** until next docs-friendly tip.
- After recovery SHA known, add one line under Decision log below with tip version.

### Decision log

| Date | Decision |
|------|----------|
| 2026-07-14 | Verdict: **mixed / lean net harm** for ops chat until person-task recovery; Avaada-class gains real |
| 2026-07-14 | Correction = **conditional gate** + person_fallback/ranking — **not** QI rollback |
| 2026-07-14 | Implementation ownership: recovery sibling tip; audit is plan-only |
| 2026-07-14 | Flag: `NOVA_QI_STRICT_PARTY_GATE` (default off) as soft/strict dial |
| 2026-07-14 | **Recovery tip `3.1.7`** (`fc8e0971`): QI gate is **party/project-only**; ranking early-exit; staff kindHint + broadened person_fallback — H1–H4 mitigated |
| 2026-07-14 | Follow-up polish tip **`3.1.8`**: harness QI-R*/QI-P*, clarify copy, audit doc committed |

---

## 8. Appendix — tip chain (evidence)

| Tip | What landed | Harm relevance |
|-----|-------------|----------------|
| **3.0.96** | Plan + P0 strip/kind-hint + narrow `leadingPersonTaskAsk` | Started shared parse; person_fallback **too narrow** |
| **3.1.1** | Full `query-structure`, **`refuseSilentOrgWide`**, sticky, Analysis/Trend structure, harness | **Primary regression tip** — gate + broad entitySpan |
| **3.1.4** | Harness + qi-metrics in `release:verify` | Locked Avaada goldens; missed person/ranking |
| **3.1.5** | Reader/Think/Trend kindHint | Good residuals; did not fix person-task family |
| **~3.1.7** (`fc8e0971`) | Recovery tip — party/project-only gate, ranking early-exit, person_prefer/fallback | Mitigates H1–H4; keeps G1–G3 |
| **~3.1.8** | Polish — harness + clarify copy + audit doc | Locks S1–S5 in release:verify |
