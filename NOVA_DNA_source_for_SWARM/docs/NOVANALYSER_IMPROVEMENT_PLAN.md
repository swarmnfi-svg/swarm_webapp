# NovANALYSER Improvement Plan

**Status:** Audit complete (code + live BPG) — **plan only; no tip/ship in this task**  
**Date:** 2026-07-27  
**Live BPG health:** `3.2.69` (`ready: true`) — [https://erp.empowerbpg.com/api/health](https://erp.empowerbpg.com/api/health)  
**Related:** `docs/plans/NOVANALYSER_ENGINE_PLAN.md` (original P0 design)

---

## 1. Executive summary — current state vs user pain

### User pain
- **NovANALYSER feels like zero useful output** on live BPG.
- **Income questions talk about KPI** (or empty / entity-search noise) instead of sales / P&L / receipts.

### Honest verdict (flag vs bug)

| Layer | Live BPG (Railway `lucky-enjoyment` / service `empower`) | Effect |
|-------|----------------------------------------------------------|--------|
| `NOVA_NOVANALYSER_ENABLED` | **Unset / OFF** (not present among `NOVA_*` vars) | NovANALYSER **never activates** on bubble, `/ai-assistant`, `/nova/chat` |
| SaaS (`empower-saas`) | Also **unset** | Same on accounts plane |
| Code on `3.2.69` | Orchestrator + skill shipped behind flag | Correct isolation — empty/wrong answers are mostly **flag-off fallback + lexicon gaps**, not a broken fan-out on production |

**Primary cause of “zero NovANALYSER output”:** the production flag is **OFF**. Enabling the flag alone is **not** enough to fix income/KPI confusion — several **real routing and product gaps** remain (see §2).

### What works when flag is ON (local probe)
- `"how can I improve the business"` → `novanalyser` (meta + tools + plan agree).
- `"how am I doing"` → `novanalyser` / `productivity_self`.
- Domain `"why is my kpi low"` correctly stays on `nova_analysis`.

### What still fails even with flag ON
- `"how is income"` / `"income this month"` → **unknown intent**, empty or `search_entities` — never finance tools.
- `"business health"` → **recipe `month_performance` wins before meta engines** → tools stay on month pack (UI “kpi_strip”), while plan/meta may claim `novanalyser` — **split brain**.
- `"cash flow"` / `"kpi trends"` → route to `novanalyser` then return **P1 stub** (`planned: true`, empty).
- Healthy finance metrics produce **“No ranked issues”** because correlate only emits **problem** thresholds — no income/P&L **status** narrative.

---

## 2. Gap audit matrix

| # | Symptom | Root cause | Severity | Fix (phase) |
|---|---------|------------|----------|-------------|
| G1 | NovANALYSER never runs on live | `NOVA_NOVANALYSER_ENABLED` unset on BPG + SaaS | **P0 / ops** | Controlled flag ON after P0 code tip (see §12) |
| G2 | “Income” → empty / search / KPI talk | Lexicon has `revenue→sales` but **no `income` alias**; intent has no `income_health`; period-only path leaves tools `[]` | **P0** | Alias income→sales/P&L intent; route `income_health` plan |
| G3 | “Business health” still month pack / KPI strip | `selectNovaTools`: **recipes before meta engines**; `month_performance` synonyms include `business health`, `how is business` | **P0** | Meta engines (or NovANALYSER cues) **before** overlapping recipes; narrow recipe synonyms |
| G4 | Income ≠ KPI confusion (user report) | (a) G2/G3; (b) month pack `bindingId: "kpi_strip"` labels sales/receipts as KPIs; (c) productivity plan heavy on `kpi_summary`; (d) flag-off empty → LLM/chips drift to KPI | **P0** | Taxonomy + rename strip + finance-first ranking |
| G5 | Cash / KPI trends = stub | Intents classify but `DEFERRED_INTENTS` + skill early-return `planned: true` | **P0 soft / P1** | P0: degrade to working plan (`income_health` / `business_health`) with explicit note; P1: real templates |
| G6 | “No issues” when sales exist | Correlate is **problem-only**; no positive/neutral income snapshot issues | **P0** | Always emit status facts (sales MTD, MoM, receipts) before issues |
| G7 | Staff business_health empty | Profile `staff` → plan steps `[]` + RBAC skips — **by design** | **Not a bug** | Keep; improve copy + redirect to productivity_self / clarify |
| G8 | Fan-out failures silent | Orchestrator returns `null` on deny/fail; only increments `fetchFailures`; format rarely explains which tools failed | **P1** | Surface skipped/failed tool ids in narrative |
| G9 | Conflict with packs / analysis / brief | Overlapping cues: `month_performance`, `daily_brief`, `nova_analysis`, `company_knowledge` | **P0–P1** | Priority table + goldens |
| G10 | No true P&L income skill in plan | Accounts `periodIncomeExpense` exists in app; NovANALYSER plan uses `sales_summary` not ledger income / `profitability_summary` | **P1** | Add income/P&L tools to `income_health` plan when RBAC allows |
| G11 | Ranking not finance-intent aware | Ranker boosts money when visible but does not **demote KPI** for finance intents | **P1** | Intent-weighted ranking |
| G12 | Save report stub only | `saveReportStub` note “planned P1” | **P2** | NovaReport snapshot |

---

## 3. Architecture target

Keep the shipped pipeline; harden contracts at each stage:

```text
Query
  → Intent (rules-first taxonomy; finance ≠ HR/KPI)
  → Profile (director | manager | accountant | staff)
  → Plan (RBAC ∩ tool registry; never silent empty)
  → Fan-out (certified skills only; record skips + failures)
  → Normalize (metric snapshots + period + SoT)
  → Correlate (status facts + problem issues + C-rules)
  → Rank (severity → money → count → intent weights)
  → Format (headline → status → issues → evidence → next actions → RBAC footer)
  → Follow-up (action → contributor skill; no re-run unless asked)
```

**Non-negotiable:** deterministic core (plan / metrics / issues); LLM optional polish only on already-ranked facts (same digit/money guards as NOVA Analysis).

**Priority vs siblings (target):**

1. Entity 360 / hard record codes  
2. **NovANALYSER cues** (when flag ON)  
3. Bounded recipes (`month_performance`, …) that do **not** steal NovANALYSER phrases  
4. `nova_analysis` / `nova_trend` / proactive insights  
5. Lexicon single-skill / SearchEngine  

---

## 4. Intent taxonomy redesign

### 4.1 Target intents

| Intent | Meaning | Example phrases | Not this |
|--------|---------|-----------------|----------|
| `income_health` | Sales / revenue / billed income / period income | “how is income”, “income this month”, “revenue MTD”, “this month sales”, “turnover” | Staff KPI, attendance |
| `cash_flow` | Liquidity + collections pace | “cash flow”, “liquidity”, “collections problem”, “are we collecting” | Bare AR list (→ receivables skills) |
| `pnl_health` | Profit & loss / margin | “profit this month”, “P&L”, “are we profitable” | Project-only profitability (may dual-route) |
| `business_health` | Cross-module org health | “improve the business”, “org health”, “what’s hurting”, “company health” | Single-domain “why KPI” |
| `productivity_self` | Self ops/HR/KPI | “how am I doing”, “my productivity” | Org finance |
| `productivity_team` | Team (P1) | “team productivity”, “who is struggling” | Org AR |
| `delivery_risk` | Projects + delivery (P1) | “delivery risk”, “late deliveries impact” | |
| `kpi_trends` | Scorecard trends (P1) | “kpi trends”, “are kpis improving” | Income / sales |
| `unknown` | No claim | — | Soft clarify, never invent finance |

### 4.2 Classification rules (P0)

1. **Finance tokens win over KPI tokens** when both appear (`income` + `performance` → finance).  
2. Map aliases: `income|revenue|turnover|billing` → `income_health` (unless explicit project P&L).  
3. Keep `isNovaAnalysisCue` veto for domain “why …” (do not steal into NovANALYSER).  
4. Do **not** treat `performance` alone as KPI when preceded by `month` / `business` / `company` (those → business / month pack / NovANALYSER per priority table).  
5. `receivables` / `outstanding` alone → existing AR skills (not NovANALYSER) — correct today.

### 4.3 Trace table (audit 2026-07-27)

| Query | Flag OFF (live) | Flag ON (code) | Desired |
|-------|-----------------|----------------|---------|
| how is income | `search_entities` | unknown / search | `income_health` → sales (+ P&L if granted) |
| income this month | `[]` tools | `[]` | `income_health` + period |
| business health | `month_performance` recipe | recipe still wins tools | `novanalyser` / `business_health` |
| how can I improve the business | empty / search | `novanalyser` ✓ | keep |
| receivables | AR skills ✓ | AR skills ✓ | keep (not income) |
| cash flow | search | novanalyser → **P1 stub** | cash plan or degrade to income+AR |
| kpi trends | `nova_trend` | novanalyser → **P1 stub** | `nova_trend` or real kpi_trends plan |

---

## 5. Plan-registry improvements

### 5.1 New / upgraded templates

**`income_health_v1`** (director / manager / accountant; staff → RBAC empty + redirect):

| Step | Tool | Why |
|------|------|-----|
| Sales | `sales_summary` | Billed income proxy |
| Receipts | `receipts_summary` | Cash in |
| Receivables | `receivables_summary` | Uncollected |
| Overdue | `overdue_invoices` | Collection risk |
| P&L / profitability | `profitability_summary` **or** new `income_expense_summary` | True income vs expense when permitted |
| Director strip | `director_dashboard_summary` | Optional rollup |

**Do not** include `kpi_summary` in `income_health`.

**`cash_flow_v1`:** receipts, bank (`cash_banking` / `bank_accounts_summary`), overdue, receivables, pending payments (director).

**`business_health_v1` (revise):** keep multi-module fan-out but **finance-first order**; demote KPI to last or omit unless query mentions KPI/staff.

**`productivity_self_v1`:** keep KPI + tasks + attendance (correct for self).

### 5.2 Deferred → degrade (P0)

For `cash_flow` / `kpi_trends` / `delivery_risk` / `productivity_team` until templates exist:

- Do **not** return silent `empty: true` stub.
- Degrade: `cash_flow` → `income_health` or `business_health` with note; `kpi_trends` → `nova_trend` / `nova_analysis` handoff; team/delivery → clarify or thin skill pack.

### 5.3 Finance tools inventory vs plans

| Capability | Existing skill / source | In business_health plan today? | Needed for income |
|------------|-------------------------|--------------------------------|-------------------|
| Tax invoice sales | `sales_summary` | Yes | Yes |
| Receipts | `receipts_summary` | Yes | Yes |
| AR / overdue | `receivables_summary`, `overdue_invoices` | Yes | Yes |
| Project P&L | `profitability_summary` | No | Optional for `pnl_health` |
| Ledger income/expense | Accounts `periodIncomeExpense` (page/API) | **No skill** | P1 skill |
| Bank / cash | `bank_accounts_summary`, `cash_banking` pack | No | `cash_flow` |
| Staff KPI | `kpi_summary` | Yes (last) | **Exclude from income** |

---

## 6. Empty-output elimination

Never return a content-free success for a classified intent.

| Situation | Required UX |
|-----------|-------------|
| Flag OFF | Soft message: feature not enabled (skill already does); outer router must not pretend NovANALYSER ran |
| Staff + `business_health` / `income_health` | Headline: needs org-finance access; suggest productivity ask; list skipped modules |
| All steps RBAC-skipped | Same + link to who can help |
| Some tools fail | `completeness: partial` + named failures |
| Metrics OK, no problems | **Status section** (“Sales MTD ₹… · Receipts ₹… · Open AR ₹…”) then “No critical issues” |
| Deferred intent | Degrade + “full X template planned” — never bare stub with only KPI links |

Unknown intent: clarify menu (sales / receipts / AR / business health / my productivity) — not `search_entities` for finance WH-words.

---

## 7. Correlation & ranking for finance-first queries

### 7.1 Status facts (always for income/business)

Emit non-scored or low-severity **status issues** / metric cards:

- Sales total + invoice count (period)  
- Receipts total  
- Open AR + overdue  
- Optional MoM delta when trend skill available  

### 7.2 Keep C01–C04; add finance rules (P1)

- **C05** sales down vs prior period + overdue up → revenue stress  
- **C06** sales up + receipts lag → working-capital lag  
- **C07** (optional) P&L loss + high overdue → cash risk  

### 7.3 Ranking

For `income_health` / `cash_flow` / `pnl_health`:

- Boost issues with `financialExposureInr` and finance `moduleId`  
- **Suppress or bury** `kpi_gap` / attendance unless query mentions people/KPI  
- Preserve `canViewOrgFinanceAggregates` money-hiding (RBAC)  

---

## 8. Formatting / evidence / next actions

Progressive disclosure (industry pattern: summary visible → evidence collapsible):

1. **Headline** — one line (status or N areas)  
2. **Period + profile** — “This month · director profile”  
3. **Status strip** — 3–5 grounded numbers with tool ids  
4. **Top issues** (max 5) — severity → observation → 1–3 evidence lines → one next action href  
5. **Footer** — RBAC skips count; “read-only”; never claim unrun tools  

Rename month pack UI `kpi_strip` → `money_strip` / `period_strip` to stop teaching users that sales = KPI.

Follow-ups: keep current “action → contributor skill” path; do not re-enter NovANALYSER unless user asks a new broad question.

---

## 9. Eval suite (golden queries)

Add `src/lib/novanalyser/novanalyser.golden.test.ts` (CI) covering routing + intent + plan tools (not live DB).

### Must-pass: income ≠ KPI

| id | query | expect |
|----|-------|--------|
| inc-01 | how is income | intent `income_health`; tools include `sales_summary`; **not** `kpi_summary` only |
| inc-02 | income this month | same + period bound |
| inc-03 | revenue this month | sales_summary (already) |
| inc-04 | how is income this month | not empty tools |
| bh-01 | business health | `novanalyser` when flag ON; **not** recipe-only `month_performance` |
| bh-02 | how can I improve the business | novanalyser |
| ar-01 | receivables | AR skills; not novanalyser |
| kpi-01 | why is my kpi low | nova_analysis |
| kpi-02 | kpi trends | nova_trend **or** kpi_trends plan — never income tools |
| rbac-01 | staff + business_health | empty steps + RBAC narrative |
| flag-01 | flag OFF | no novanalyser in selectNovaTools / chips |

Axes for later judge eval (optional): factuality, attribution to tool ids, answer relevance (income question must mention money metrics).

---

## 10. Phased roadmap

### P0 — Stop wrong / empty answers (1 tip recommended)

1. Lexicon: `income` → sales / income_health; block empty tools for income+period.  
2. Intent: add `income_health`; finance-over-KPI rules.  
3. Routing: NovANALYSER meta cues **before** recipes that share synonyms; remove `business health` / `how is business` from `month_performance` synonyms (keep “how is this month going”).  
4. Skill: deferred intents **degrade** instead of stub+KPI links.  
5. Format/correlate: always status strip for income/business; never silent empty.  
6. Goldens for income ≠ KPI + business health routing.  
7. Version bump + tip ship; **then** enable flag (see §12).  

### P1 — Real cash / P&L / team templates

- Implement `cash_flow`, `pnl_health`, `delivery_risk`, `productivity_team`, `kpi_trends` plans.  
- Ledger income/expense skill if sales proxy insufficient.  
- Intent-weighted ranking; failure surfacing; month pack rename `kpi_strip`.  
- Partial LLM narrative with digit guards (optional).  

### P2 — Memory / reports / pulse

- Saved NovaReport for NovANALYSER packs.  
- Scheduled business-health pulse.  
- Approved “memory cards” for recurring definitions (sales vs income SoT).  

---

## 11. RBAC non-negotiables

- Preserve `novaCanRunTool` / `can()` / `canViewOrgFinanceAggregates` on every fan-out step.  
- Staff org finance empty plan is **correct** — improve messaging only.  
- Flag OFF must keep zero routing / chip change (existing tests).  
- Middleware public paths ≠ authz bypass (unchanged).  
- No admin shortcut that opens org money without grants.  
- Tests must cover 401/403 / empty filtered tool lists, not only happy path.  

---

## 12. Flag rollout strategy

**Do not flip the flag until P0 code tip is live and guarded.**

1. Ship P0 tip to BPG (`main`) with goldens green; `EXPECT_VERSION` guard.  
2. Enable `NOVA_NOVANALYSER_ENABLED=1` on Railway **empower** (BPG) only — **variable change alone**; no second deploy trigger if already live (or redeploy if required by Railway).  
3. Smoke: director — “how is income this month”, “improve the business”; staff — business health RBAC copy; “why is my kpi low” still analysis.  
4. Mirror SaaS on `feature/saas-tenancy-p0` after BPG soak (24–48h).  
5. Kill switch: unset/delete variable (instant soft-disable).  

---

## 13. Open questions for Mike

1. **Income SoT:** tax-invoice `sales_summary`, ledger income from P&L, or both with explicit labels?  
2. **Flag timing:** enable immediately after P0 tip, or soak on staging first?  
3. **month_performance ownership:** keep as director month brief only, or merge into NovANALYSER eventually?  
4. Should **“how am I doing”** stay productivity (KPI-heavy) or ask clarify finance vs self?  
5. Hinglish income phrases to lock (`kitna income`, `is mahine ki kamai`, …)?  
6. Director-only for `income_health`, or any user with `invoice.read` + org aggregates?

---

## 14. Design principles (from web research)

Synthesized from production analytics-copilot patterns (multi-agent orchestration, finance intent safety, grounded eval, progressive disclosure):

1. **Deterministic core, conversational surface** — compute metrics in skills; LLM only narrates.  
2. **Plan-then-execute** with a reviewable tool list — never one-shot free SQL.  
3. **Intent classification as a safety gate** — finance vs HR/KPI before tool pick (TELUS/Banking77 lessons).  
4. **Overlapping intents need explicit priority** — recipes must not shadow meta engines.  
5. **Bound metric dictionary / SoT** — sales ≠ income ≠ KPI score.  
6. **Ground every claim** with tool id + period (FACTS / faithfulness).  
7. **Never silent failure** — RBAC skip, tool fail, and “healthy” are distinct UX states.  
8. **Progressive disclosure** — headline → status → severity issues → evidence → actions.  
9. **Golden evals before ontology churn** — income≠KPI goldens gate the tip.  
10. **Persona × permission slices in evals** — staff vs director expected answers differ.  
11. **Degrade gracefully** — stub intents hand off to nearest working plan.  
12. **Correlation after facts** — C-rules only on normalized metrics.  
13. **Intent-weighted ranking** — finance questions bury HR/KPI noise.  
14. **Auditability** — skippedModules + failures visible for trust.  
15. **Feature-flag kill switch** — already present; keep OFF until P0 ready.

---

## 15. Recommended P0 tip scope (one paragraph)

Ship a **routing + empty-output** tip only: add `income` lexicon/intent → `income_health` plan (sales/receipts/AR, no KPI); move NovANALYSER meta cues ahead of `month_performance` for shared phrases; degrade deferred intents instead of stubs; always render a status strip or explicit RBAC/empty explanation; add golden tests proving income ≠ KPI and business-health → novanalyser when flag ON. Bump `package.json` to live+1, tip to BPG, guard health — **leave `NOVA_NOVANALYSER_ENABLED` OFF until that tip is live**, then enable as a separate ops step.

---

## Appendix A — Live flag evidence

```text
BPG Railway project lucky-enjoyment / service empower / production
  NOVA_NOVANALYSER_ENABLED: <unset>
  Health: version 3.2.69, ready true

SaaS Railway project emPOWER SaaS Project / service empower-saas / production
  NOVA_NOVANALYSER_ENABLED: <unset>
```

## Appendix B — Key code loci

| Area | Path |
|------|------|
| Flag + intent | `src/lib/novanalyser/intent.ts` |
| Plans | `src/lib/novanalyser/plan-registry.ts` |
| Orchestrator | `src/lib/novanalyser/orchestrator.ts` |
| Correlate / rank / format | `correlate.ts`, `rank.ts`, `format.ts` |
| Skill | `src/lib/nova/skills/ops/novanalyser.ts` |
| Meta routing | `src/lib/ai/nova-engine-routing.ts` |
| Recipe-before-meta bug | `src/lib/ai/nova-tools.ts` (`recipeMatchesQuery` before `resolveNovaMetaEngineTools`) |
| Month pack KPI naming | `src/lib/nova/packs/month-performance.ts` (`kpi_strip`) |
| Lexicon novanalyser / month | `src/lib/ai/nova-lexicon.ts` |
