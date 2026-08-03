# NOVA Bug Sweep Report — 2026-07-17

**Date:** 2026-07-17
**Baseline:** `main` @ `3.1.34` (live `erp.empowerbpg.com` = 3.1.34, ready)
**Tip shipped by this sweep:** `3.1.35` — NOVA routing + formatter hardening
**Scope:** Full NOVA sweep across the 12 engines (Search, Intent/Lexicon, Think, Dialog/Sticky, Clarify, Entity Resolve, Skills, Packs, Analysis, Trend, Present/Narrate, Reader) plus recent work (Entity 360, project-finance / delivery-installation semantics, PDF/chart reports, attendance/trend routing, money-guard + LLM redaction, multi-key Gemini failover). Desktop app branch/`apps/empower-desktop/*` intentionally untouched.

---

## Test results — before / after

| Suite | Before | After |
|-------|--------|-------|
| `src/lib/ai/nova.test.ts` | 7 failed / 347 passed | **1 failed (deferred) / 360 passed** |
| `src/lib/nova/**` + `nova-format`/`nova-lexicon`/`nova-tools` (full) | 3 failed (2 extra pre-existing) | **1 failed (deferred) / 802 passed** |
| Other `src/lib/ai/nova-*` golden/unit suites | pass | pass (236) |
| Critical release subset (`release:verify`) | pass | **pass (97)** |
| `tsc --noEmit` | clean | **clean** |

Net: **9 previously-failing tests → green**, 1 deferred (documented below), **zero regressions** across 800+ NOVA tests.

> Note: the task briefed “~7 pre-existing failures around the delivery-delay formatter.” Root-cause showed only **1** of the 7 was the formatter; the other 6 were distinct, independently pre-existing bugs/stale tests (present at least since `3.1.32`, before Entity 360). Two more pre-existing failures were found in the broader suite (`analysis`, `presentation-polish`).

---

## Bugs found (prioritized)

### P1 — FIXED (production code)

#### 1. Temporal / module / quantifier tokens bind as fake entities (Entity Resolve + Search engine)
- **Symptom:** `july sales` → *“No customer, vendor, or project matching ‘july’”*; `today receipts` → *“I need a project or customer match for ‘today’”*; `payment requests pending` → resolves fake party *“payment requests”* and never runs the tool; `how many payment requests` / `how much sales` → scope to fake *“many”* / *“much”*.
- **Root cause:** `acceptsPartyEntitySpan()` (shared gate used by both `nova-search-engine.ts` and `parseEntityModuleAsk`) accepted any single-token/multi-word label as a party. Month names, relative-day words, bare module noun-phrases, and count quantifiers were never excluded. `parseEntityModuleAsk("payment requests pending")` stripped the focus word “pending” and treated the module phrase “payment requests” as a party.
- **Fix:** Added `isNovaTemporalOrModuleEntityNoise()` in `src/lib/nova/query-structure/parse-entity-module.ts` (months full/abbrev, today/yesterday/this-last-current/fy/quarter/weekday; bare module/metric phrases; quantifiers many/much/few/several/multiple/count/total/number) and reject those spans at the top of `acceptsPartyEntitySpan()`. Single guard fixes all funnels (SE rows table + full-utterance parse + `runNovaTools` entity fallback).
- **Fixed tests:** `summarises july sales…`, `answers todays reciepts…`, `payment requests count uses deterministic answer…`, `scopes payment_requests_summary for STAFF via list where`.
- **Repro/lock:** `src/lib/nova/query-structure/index.test.ts` → “month / relative-day / module noun phrases are never a party span (bug sweep)” + quantifier cases + `runNovaSearchEngine("how many payment requests").entityHint` null.

#### 2. Delivery-delay “Most delayed” formatter never renders
- **Symptom:** `delivery delays` answer stopped at *“Deliveries (open / incomplete): N record(s)”* — no “Most delayed” table, even though the tool returns `topDelayed` rows.
- **Root cause:** `formatFactsDeterministic` gated the delay block on `focus === "delivery_delayed" || focus === "installation_delayed"`. The v3.1.24/3.1.26 “delivery/installation semantics” work renamed focus values; the formatter branch and the unit test drifted (test still passed legacy `focus: "delays"`). Contract mismatch since ~3.1.33.
- **Fix:** `src/lib/ai/nova-format.ts` — key the delay block off `/delay/i.test(focus)` and pick the Installation vs Delivery label via `/installation/i.test(focus)`. Now robust to canonical (`delivery_delayed`/`installation_delayed`) **and** legacy (`delays`) values.
- **Fixed test:** `formats delivery delay facts with top delayed rows`.
- **Repro/lock:** added `formats delivery delay facts for the canonical delivery_delayed focus (bug sweep lock)` (iterates `delivery_delayed` / `installation_delayed` / `delays`).

#### 3. `why late delivery` misroutes to attendance Analysis instead of Delivery (Trend/Analysis routing)
- **Symptom:** `why late delivery` → `nova_analysis` (attendance depth) instead of `delivery_summary`. `why delivery late` worked; `why late delivery` did not (word-order sensitive).
- **Root cause:** `normalizeNovaQuery("why late delivery")` rewrites to `why delivery delayed`. The non-attendance-late guard in `selectNovaTools` only checked `/\blate\b/`, so after normalization (“delayed”, no “late”) the delivery-delay context was no longer protected and the bare-`why` depth path claimed it for Analysis.
- **Fix:** `src/lib/ai/nova-tools.ts` — broaden the guard to `/\b(?:late|delay|delayed)\b/` so delivery-delay contexts stay thin (delivery) after normalization.
- **Fixed test:** `analysis.test.ts › does not steal money/delivery late into attendance analysis`.

### P2 — FIXED (stale tests; code was already correct/secure)

#### 4. Stale RBAC test asserted a POL-1 vendor-bank hole
- **Finding:** Test expected `novaCanRunTool(STAFF + bank.viewfullaccount, "vendor_bank_open") === true`. POL-1 (`pol1-sensitive-permissions.ts`) **intentionally** strips bank/payroll/approve grants from STAFF/MANAGER at `can()`, so the correct (secure) result is `false`. Making code return `true` would re-open a vendor-bank leak.
- **Action:** Updated `nova.test.ts` to lock the secure behavior — STAFF+grant → `false`, non-ops `ACCOUNTANT`+grant → `true`, STAFF+`vendor.read` → `false`. **No code change.**

#### 5. Stale presentation-mode convergence test (report vs chat consistency)
- **Finding:** `presentation-polish.test.ts` expected `sales_summary` → `hybrid_guarded`. The core (`nova-presentation.ts`) intentionally lists `sales_summary` in `NOVA_DETERMINISTIC_POLISHED_TOOLS` under the **money-guard** (“same ERP facts → same answer”, never LLM-narrated) — corroborated by `summarises july sales deterministically…` which requires `deterministic_polished` and no LLM.
- **Action:** Updated the test to expect `deterministic_polished` for `sales_summary`. **No code change** (changing core would regress the money-guard).

### P1 — DEFERRED (risky / large-scope — documented, not guessed)

#### 6. Multi-turn “recheck” follow-up merges into a garbled routing query
- **Symptom:** History `["biggest project", "<wrong receipt answer>"]` + `can u recheck that` → merged routing query `"biggest project can u recheck that active projects value biggest project"` → falls to `entity_resolve`/`clarify` instead of re-running `projects_summary`. (Failing test: `rechecks project value with history instead of empty search`.)
- **Root cause (preliminary):** `resolveNovaFollowUp` / `novaPlanToRoutingQuery` (`src/lib/ai/nova-context.ts`) concatenate prior-question text + a canonical slot expansion (“active projects value”) + the current utterance, producing duplicated/expanded tokens that then trip entity resolution. Long-standing (test added ~v2.37.3).
- **Why deferred:** The follow-up/slot-merge system is multi-branch and shared by every multi-turn flow; a blind change risks broad regressions. Needs focused design work.
- **Recommended fix:** In the recheck branch, re-run the **prior plan’s tools/slots directly** (bypass text re-concatenation), or dedupe/scrub `novaPlanToRoutingQuery` output so a merged routing query never re-emits the prior question text alongside its slot expansion. Add a golden for “recheck after wrong answer re-runs prior intent”.

---

## Additional observations (no code change)

- **Test-mock drift (test hygiene, not a prod bug):** `nova.test.ts`’s `@/lib/prisma` mock is missing methods some skills call (`staffAdvance.aggregate`, `paymentRequest.groupBy`, `paymentRequest.aggregate`). Real Prisma models expose these, so production is unaffected; the missing mocks only produce console noise / can mask coverage. Recommend backfilling the mock.
- **Entity 360 (3.1.33/3.1.34):** `entity-360` suite green; RBAC beneficiary gate (`canSeeVendorBankDetails`) and payer-bank posting gate verified via existing tests. No routing regressions attributable to Entity 360 (nova.ts router untouched by that work — regressions in this sweep pre-date it).
- **Money-guard / redaction:** `nova-money`, `nova-llm-sanitize`, `nova-presentation` suites green; sales/receipts remain deterministic-polished (no LLM money narration).

---

## Fixes + tests summary

| File | Change |
|------|--------|
| `src/lib/nova/query-structure/parse-entity-module.ts` | New `isNovaTemporalOrModuleEntityNoise()` (temporal + module-phrase + quantifier) rejected in `acceptsPartyEntitySpan()` |
| `src/lib/nova/query-structure/index.ts` | Export `isNovaTemporalOrModuleEntityNoise` |
| `src/lib/ai/nova-format.ts` | Delivery-delay block keys off `/delay/i` focus (canonical + legacy) |
| `src/lib/ai/nova-tools.ts` | Non-attendance-late guard also matches `delay`/`delayed` |
| `src/lib/nova/query-structure/index.test.ts` | Guard lock tests (temporal/module/quantifier + SE hint null) |
| `src/lib/ai/nova.test.ts` | Canonical delivery-delay formatter lock; POL-1 vendor-bank test corrected |
| `src/lib/nova/presentation/presentation-polish.test.ts` | Money-guard mode-map convergence corrected |

---

## Top recommended follow-ups
1. **Fix the multi-turn “recheck” follow-up merge** (finding #6) — highest-value remaining UX bug; needs isolated design + goldens.
2. **Backfill `nova.test.ts` prisma mock** (`staffAdvance.aggregate`, `paymentRequest.groupBy/aggregate`) to remove console noise and restore full skill coverage.
3. **Add month/quantifier goldens to the QI harness** so temporal/quantifier-as-entity misfires are caught at the eval layer, not just unit tests.
4. Consider centralizing entity-span acceptance so `nova-lexicon`’s `extractNovaEntityHint` and `parse-entity-module` share one noise source of truth.
