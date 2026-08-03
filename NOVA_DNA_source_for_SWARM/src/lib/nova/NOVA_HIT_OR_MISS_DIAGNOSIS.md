# NOVA Hit-or-Miss Diagnosis

**Date:** 2026-07-14  
**Repo tip at write:** `5bf5c3aa` (v3.1.8) — recovery already on `main`  
**Coords:** [`NOVA_QI_UPGRADE_HARM_AUDIT_AND_CORRECTION_PLAN.md`](./NOVA_QI_UPGRADE_HARM_AUDIT_AND_CORRECTION_PLAN.md), recovery agent [`bf7d9c4d`](bf7d9c4d-4b24-48e5-9dbd-8447258f5cbd), sweep agent [`4ebbfbc6`](4ebbfbc6-0fc9-4b7b-9605-62bb9df8ff89)  
**Method:** Decision-tree trace + offline phrasing probe (no tip shipped)

---

## Verdict

| Lens | Answer |
|------|--------|
| **Was it hit-or-miss?** | **Yes** — strongly, during QI **3.0.96 → 3.1.5**, especially person/tasks + ranking |
| **Is it still hit-or-miss today?** | **Mostly recovered for the reported Arif/ranking class**; **residual** inconsistency remains on paraphrases, tenant-dependent party collision, sticky person follow-ups, and Think/narration variance |
| **One-liner** | **Was hit-or-miss until recovery 3.1.7–3.1.8; still edge hit-or-miss, not vibe randomness** |

**Confidence:** ~0.9 on historical QI harm (audit + harness locks). ~0.75 on residual edges (offline probes; not live tenant-colliding names).

User-facing “sometimes right / sometimes dead-end” maps cleanly to **order-sensitive routers + incomplete regex families**, not crypto nondeterminism. Routing is deterministic for a given string; **different phrasings of the same intent diverge**, and **party resolve before person_fallback** makes outcomes **tenant-data-dependent**.

---

## Decision tree (live path)

```text
utterance
  → DialogState (pending clarify / sticky bind / topic-switch)
  → inferNovaQuery / short-circuits
  → SearchEngine rules (ranking early-exit, party-module, lexicon tools)
      [? low confidence + NOVA_THINK] → Think LLM slots → validate → else rules
  → Plan / selectNovaTools
  → runNovaTools:
        structureAsk = parseEntityModuleAsk
        rankingAsk? → skip entity, crumb ranking_early
        kindHint===staff? → person_prefer (skip party)
        else entityFilter → resolveNovaEntityHint (party first)
            not_found + soft personal shape → person_fallback
            else refuseSilentOrgWide (party/project-only after 3.1.7)
  → sticky module-only follow-up needs bind (party slot hint; no person sticky yet)
  → skill fork: tasks / Analysis / Trend / kpi_report / Reader caption
  → narrate: hybrid_guarded (LLM wording) vs deterministic_polished
```

Key files:

| Stage | File(s) |
|-------|---------|
| Structure / kinds | `query-structure/parse-entity-module.ts`, `personal-task.ts` |
| Gate | `query-structure/gates.ts` → `refuseSilentOrgWide` |
| SE ranking win | `nova-search-engine.ts` (`task_completion_ranking` before party-module) |
| Resolve / prefer / fallback | `nova-tools.ts` (~1086–1330) |
| Person extract | `nova-lexicon.ts` → `extractNovaPersonHint` |
| Think fork | `nova-think.ts` → `understandNovaQuery`; gated in `nova.ts` ~1445 |
| Sticky | `dialog-state.ts` (`shouldKeepNovaBoundEntity…`, `stickyModuleFollowUpClarifyReason`) |
| Analysis / KPI fork | `analysis/domain.ts`, `nova-tools.ts` (kpi_report vs nova_analysis vs kpi_summary) |
| Metrics | `/system/nova-qi-metrics`, `query-structure/qi-metrics.ts` |

---

## Top root causes (ranked by user impact)

### 1. QI party gate swallowed staff + ranking (HISTORICAL P0 — FIXED 3.1.7/3.1.8)

**Symptom:** “Arif pending tasks” → party not_found; “which tasks for arif is over due” → bind clarify on junk span; “who completed most task” → company/entity dead end.

**Cause:** Broad `entitySpan` + `refuseSilentOrgWide` treated **any** span as unfinished party/project; `person_fallback` regex too narrow.

**Fixed by:** `fc8e0971` / `5bf5c3aa` — `personal-task.ts`, party-only gate, ranking early-exit, `person_prefer` / broadened fallback, harness QI-R* / QI-P*.

**Attribution:** Recovery sibling owns this; do not re-tip.

---

### 2. Party-first then person_fallback = tenant-dependent steal (RESIDUAL P0/P1)

**Symptom:** Same phrasing works on one DB and “wrong entity” or party-scoped tasks on another.

**Cause:** Soft shapes (`Name pending tasks`, `aalok tasks`) still set `entityKindHint: "project"` and run **`resolveNovaEntityHint` first**. `person_fallback` only runs on **`not_found`**. If a customer/project token collides with a staff first name, party **wins silently**.

```1112:1128:src/lib/ai/nova-tools.ts
  // Staff kindHint (e.g. “tasks for arif”) → prefer person bind, skip party dead-end.
  // Soft “Name tasks” / “avaada tasks” still try party first → person_fallback on miss.
  if (
    ...
    structureAsk?.entityKindHint === "staff"
  ) {
    ...
    toolsUsed.push("person_prefer");
  }
```

Contrast: `tasks for Arif` → `kindHint=staff` → **person_prefer** (skip party).  
`Arif pending tasks` → `kindHint=project` + person hint → **party first**.

**Impact:** Highest remaining “hit-or-miss” feel for personal ops.

---

### 3. Personal-task coverage holes (same intent, different router) (RESIDUAL P1)

Offline probe (tip 3.1.8) — intentional class still OK; edges diverge:

| Phrasing | Typical path today | Quality |
|----------|--------------------|---------|
| `Arif pending tasks` | personHint + person_fallback (after party miss) | OK if no party hit |
| `pending tasks for Arif` | person + fallback; SE `tasks_for_project` | OK if no party hit |
| `tasks for Arif` | **staff kindHint + person_prefer** | Best |
| `overdue tasks of Arif` | staff + person | OK |
| `tasks assigned to Arif` | personHint; no structure span | OK |
| `show me Arif overdue tasks` | span `show me Arif`; SE `find_task_by_name`; tools **`search_entities`** | Dead-end / wrong |
| `list Arifs pending tasks` | search_entities / task title guess | Dead-end |
| `does Arif have overdue tasks` | garbage span; **clarify** can fire | Dead-end |
| `Arif ka pending tasks` | personHint **null**; clarify risk | Miss |
| `pending for Arif` | no tasks cue → **search_entities** | Miss |
| `Arif's pending tasks` | personHint may keep possessive; tools OK-ish | Fragile |
| `are there pending tasks for Arif` | person OK; `personShape=false` | Recovered via fallback |

Root: `isNovaPersonalTaskAskShape` / leading-name parsers / `extractNovaPersonHint` don’t share one normalizer; SE has earlier **title-search** and **party-module** regexes that win on politely worded English (`show me…`, `does… have…`).

---

### 4. Sticky is party-only; person follow-ups orphan (RESIDUAL P1)

**Symptom:** After “Arif tasks”, short “pending” / “overdue” may clarify for a **project/customer** (`stickyModuleFollowUpClarifyReason`) or lose person scope — never a first-class sticky **person** bind (audit P2 still open).

**Cause:** `stickyModuleFollowUpNeedsBind` keys off `slots.entityHint` party semantics; DialogState `bound` is party/project typed.

---

### 5. Think + hybrid narration = soft variance (RESIDUAL P2 for routing; P2 for wording)

**Routing:** `understandNovaQuery` only when plan **confidence low** + LLM configured (`nova.ts` ~1445). Think on vs off can change tools for the same low-confidence ask. Think uses `temperature: 0` but still model-dependent; invalid Think → rules fallback.

**Wording:** Money/ops often `hybrid_guarded` — LLM narrates sanitized facts; polish fallback is deterministic. Users may call this “hit-or-miss answers” even when facts match.

Not the Arif-gate class; still contributes to perceived inconsistency.

---

### 6. First-match / order sensitivity across engines (RESIDUAL P1)

Multiple independent first-match stacks:

1. SearchEngine regex ladder (ranking now early — good)
2. `parseEntityModuleAsk` branches (`tasks in` → `pending tasks in|for` → why-tasks → trailing for → hinglish → full role strip)
3. Lexicon `extractNovaPersonHint` ordered patterns
4. `selectNovaTools` early returns (Analysis cue, kpi_report, composeNovaIntent, …)

Slight wording moves which stack “wins.” Classic: trailing `for X` sets **staff** on personal shapes; leading `Name pending tasks` sets **project**.

---

### 7. Skill / SoT forks still cue-sensitive (RESIDUAL P1 product drift)

| Intent | Cue A | Cue B | Drift |
|--------|-------|-------|-------|
| Individual KPI | `KPI report card for Arif` → **`kpi_report`** | `why is Arif kpi low` / `MD Arif KPI analysis` → **`nova_analysis`** | Intended split, different UI density |
| Thin KPI | `Arif kpi` → **`kpi_summary`** | report-card / why | Easy to look “thinner” or wrong |
| Outstanding | `Avaada outstanding` → receivables + customer_outstanding | `outstanding for Avaada` → clarify / no entity on SE | Structure trailing-for + money tools |
| Contract outstanding | product SoT on project command (`contract − received`, tips 3.0.97–3.0.98) | bare `contract outstanding Avaada` → generic receivables tools | Label vs formula path easy to miss |

Money redact in assistant history (`nova.ts` ₹ → `₹[amount]`) is intentional; presentation mode can still **feel** inconsistent vs polished cards. Sweep sibling owns money/ACL adversarial pass — treat ACL as their beat unless a concrete leak is found.

---

### 8. Harness / metrics blind spots (RESIDUAL P1 process)

- QI harness now locks recovery class (QI-R1–3, QI-P1–5) — **green on tip**.
- Still **missing** adversarial paraphrases from §3 table (`show me…`, `does X have…`, Hinglish `ka/ke` pending, possessive).
- `/system/nova-qi-metrics` is **process-local crumb ring** (last ~200). Multi-instance Railway → incomplete; no alert on gate-firing-with-staff-kindHint yet (audit P1).
- Offline wrong-scope rate = 0 on `forbidOrgWideScoped` goldens ≠ lived person paraphrase consistency.

---

## Same-intent, different-phrasing matrix

| Intent | Phrasing | Post-3.1.8 behavior | Hit-or-miss? |
|--------|----------|---------------------|--------------|
| Person pending tasks | `Arif pending tasks` | Fallback path | Low if no party collide |
| Same | `pending tasks for Arif` | Fallback / SE project-ish | Low if no collide |
| Same | `tasks for Arif` | **person_prefer** | Best |
| Same | `show me Arif overdue tasks` | **search_entities** | **Yes** |
| Same | `does Arif have overdue tasks` | clarify risk | **Yes** |
| Ranking | `who completed most task(s)` | `task_completion_ranking` | Fixed |
| Ranking | `top task completers` | ranking | Fixed |
| Place / brand | `tasks in avaada` | party-scoped gate | Keep (good) |
| Place / brand | `avaada tasks` | party first → fallback if miss | Keep; soft dual |
| Sticky follow-up | `pending tasks` after Arif | party clarify / no person sticky | **Yes** |
| KPI | report card vs why/analysis vs bare | three tools | Product fork |

---

## What’s already fixed vs remaining

### Owned / shipped (recovery — do not fight)

| Item | Tip |
|------|-----|
| Ranking early-exit; parse null on ranking | 3.1.7 |
| Party/project-only `refuseSilentOrgWide`; staff kindHint skip; noise skip | 3.1.7–3.1.8 |
| Broadened `isNovaPersonTaskFallbackAsk` + staff `person_prefer` | 3.1.7 |
| Tail scrub (`is over due`); harness QI-R* / QI-P* | 3.1.7–3.1.8 |
| Clarify copy points users at person phrasings | 3.1.8 |
| Flag `NOVA_QI_STRICT_PARTY_GATE` (default soft) | 3.1.7 |

### Remaining (prefer sweep / follow-up tip — not this diagnosis)

| Item | Owner suggestion |
|------|------------------|
| Prefer person when `isNovaPersonalTaskAskShape` **before** party resolve (or clarify person vs party on collide) | Recovery follow-up / sweep |
| Expand shapes: `show me Name…`, `does Name have…`, Hinglish `ka/ke` + pending, possessives | Lexicon + `personal-task.ts` goldens |
| Sticky **person** bind for module-only follow-ups | DialogState P2 (audit) |
| Outstanding cue symmetry + contract-outstanding lexicon | Finance SoT / SE |
| Extend QI JSONL + crumb counters (`person_prefer`, `ranking_early`, gate-on-staff alert) | QI metrics P1 |
| Think: force rules for personal-task / ranking families even when low confidence | Think fence |
| Sweep sticky/ACL/present findings | Sibling [`4ebbfbc6`](4ebbfbc6-0fc9-4b7b-9605-62bb9df8ff89) |

**No tip from this diagnosis.** No isolated P0 outside sibling ownership that is safer as a drive-by than a sequenced tip.

---

## Recommended stabilizers

1. **Lexicon / personal-task goldens** for every row in the residual matrix (negative: must not `search_entities` for “show me Arif overdue tasks”).
2. **kindHint policy:** soft personal-task shapes → treat like staff (`person_prefer`) unless `isNovaPlaceFramedTaskAsk` or `looksLikePartyOrProjectName`.
3. **Gate rule:** already party-only — keep; never re-broaden without person_prefer.
4. **Collision clarify:** when party hit + staff candidate on same token → chips (conflict.ts already has staff×party policy; wire for soft personal shapes before silent party bind).
5. **Flags:** keep `NOVA_QI_STRICT_PARTY_GATE=0` default; optional `NOVA_THINK=0` on prod until fences exist.
6. **Metrics:** persist crumbs beyond single process; alert `clarify_miss` with `entityKindHint=staff` or `person_prefer=0` while personal shapes fire.
7. **Narration:** prefer `deterministic_polished` for tasks_summary / ranking until hybrid variance is accepted.

---

## Metrics / harness snapshot

| Source | What it shows |
|--------|----------------|
| `query-intelligence-harness.test.ts` + goldens | 15+ cases; recovery locks green (36 related tests pass locally) |
| `/system/nova-qi-metrics` | Process-local only — useful for one Railway instance smoke, not fleet inconsistency proof |
| Harm audit | Historical yes; correction = conditional gate not QI rollback |

Measured inconsistency for residual paraphrases: **not yet harnessed** → users can still hit miss paths while CI stays green.

---

## Executive answer

**Is it hit-or-miss?**  
**Was — yes (QI 3.0.96–3.1.5).** Primary user reports are **mitigated on tip 3.1.7–3.1.8**. **Still partially hit-or-miss** on (1) party-first vs person when names collide, (2) polite/Hinglish paraphrases routing to search/clarify, (3) sticky person gap, (4) Think/hybrid wording.

**Why (top):** over-broad entitySpan gate (fixed) → residual party-first race + regex family holes + multi-engine first-match.

**What’s next:** Prefer person (or clarify) on soft personal-task shapes; expand goldens for residual matrix; sticky person bind; leave ACL/sticky deep bugs to sweep sibling; no competing tip from this write-up.
