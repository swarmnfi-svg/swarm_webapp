# NOVA Query Intelligence Upgrade Plan

**Status:** P0 ✅ · P1 ✅ · P2 ✅ **complete** (tip **3.1.5**)  
**Date:** 2026-07-14  
**Live baseline:** **3.1.4** (Hardening→9) → **3.1.5** (Reader/Think/Trend kindHint residuals)  
**Goal:** make **all** NOVA understand engines share one NL→structure contract so party/project/module phrasing works everywhere — not one-off brand hotfixes.  
**Coords with:** `NOVA_FINAL_ARCHITECTURE.md`, `NOVA_FLOW.md`, `NOVA_DIALOG_STATE_PLAN.md`, `NOVA_COMMERCIAL_READY_PLAN.md`, `NOVA_TREND_PLAN.md`, `NOVA_ANALYSIS_ENGINE.md`, `NOVA_ANALYSIS_HANDOFF.md`, `packs/PROJECT_COMMAND_HANDOFF.md`, `nova-reader/NOVA_READER_ARCHITECTURE.md`, Hardening→9  
**Non-goals:** free SQL · free tool pick · write-back · inventing money/people · per-brand if/else · **Android hybrid client** · NovaMind sticky-party memory · full AR-aging / KPI-score Trend **adapters** (planned only; no empty SoT invent) · duplicate harness tip (owned by **3.1.4**)

**Converge:** Single plan file — peer Avaada strip + nascent `src/lib/nova/query-structure/` fold into §5 P0; do not open a second `NOVA_QUERY_*` doc.

---

## 0. Vision & principles

**Spine:** universal **parse → bind → tool**. Source of truth for identity and totals is **ERP data** (Prisma skills under RBAC) — never chat memory or LLM guesswork.

| # | Principle |
|---|-----------|
| P1 | One shared structure (`NovaQueryStructure`) before plan/resolve |
| P2 | SoT = ERP bind (exact / alias / clarify) — not soft invent |
| P3 | **No silent org-wide when entity intended** — bind, clarify, or explicit miss |
| P4 | Kind hint from role words before soft fuzzy across types |
| P5 | Clarify beats wrong bind (money/sensitive always) |
| P6 | Rules-first; Think only fills the same schema |

### 0.1 Product north star

NOVA should understand ERP chat the way a sharp operations assistant does:

| Utterance | Structured meaning |
|-----------|-------------------|
| `avaada project` | **entity** = Avaada · **kind** = project · open Project Command / resolve |
| `james school project task` | **entity** = James School · **kind** = project · **module** = tasks · project-scoped task list/summary |
| `tasks in avaada` | **module** = tasks · **entity** = Avaada · **kind** ≈ project · **never** org-wide silently |
| `avaada invoices this month` | **entity** = Avaada · **kind** ≈ customer · **module** = sales · **window** = this month |
| `aalok tasks` | prefer **person** path when no party exists (demote; never invent org totals) |

**Pattern (universal):** strip **role words** (`project`, `task(s)`, `invoice(s)`, …) → bind **entity span** + **kind hint** → attach **module/metric/window/depth** → resolve under RBAC → run catalog skills/packs. Every engine consumes the **same** structure.

---

## 1. Current architecture (as of tip ~3.0.95)

### 1.1 End-to-end flow

```text
User → NovaAiChat / Bubble
  → askNovaAiAction (session · ai.assistant.read · quota · DialogState)
  → answerNovaQuery (src/lib/ai/nova.ts)
       ├─ ClarifyAct resume / sticky bind (skip fuzzy)
       ├─ inferNovaQuery · follow-up · topic switch (dialog-state.ts)
       ├─ normalizeNovaQuery
       ├─ runNovaSearchEngine → NovaSearchSlots
       ├─ composeNovaIntent / lexicon (fallback)
       ├─ optional NovaThink (gated, same slot schema)
       ├─ buildNovaPlan → finalizeNovaPlan
       ├─ selectNovaTools (recipes → Analysis → Trend → SE → lexicon)
       ├─ RBAC filterNovaToolsForUser
       ├─ resolveNovaEntityHint / resolveNovaPersonHint
       ├─ runNovaTools → dispatchNovaSkill / packs
       └─ format / LLM narrate + answer guards
```

**Entry:** `src/components/nova-ai-chat.tsx` → `src/app/(app)/ai-assistant/actions.ts` → `answerNovaQuery`. No free `/api/nova/chat`.

### 1.2 Engines and what they own today

| Engine | Path | Responsibility | Parses entity? |
|--------|------|----------------|----------------|
| **SearchEngine** | `nova/nova-search-engine.ts` | NL → slots (family, entityHint, tools[]) | Yes (primary) |
| **Lexicon** | `ai/nova-lexicon.ts` | Topics/synonyms → tools; extractors | Yes (duplicate) |
| **Intent / Plan** | `ai/nova-intent.ts`, `nova-plan.ts` | Slot merge, period defaults, clarify | Consumes + re-extracts |
| **Recipes** | `nova/recipes/registry.ts` | Phrase → `project_command`, packs | Own regexes |
| **Entity resolve** | `ai/nova-tools.ts` `resolveNovaEntityHint` | Prisma + aliases → bind/clarify | Normalizes hint |
| **Dialog sticky** | `nova/dialog-state.ts` | Bound id, module follow-ups | Continuations |
| **Skills** | `nova/skills/*` | Prisma facts under `can(...)` | Use resolved ids |
| **Packs** | `nova/packs/*` | Multi-chapter compositions | Same skill ctx |
| **Analysis** | `nova/analysis/*` | “Why …” factor packs | Cue regex; uses **resolved** ctx |
| **Trend** | `nova/trend/*` | “Who/what over time” | Cue + window; weak party matrix |
| **Reader** | `nova-reader/*` | Doc OCR → fields | **Parallel** (not `answerNovaQuery`) |
| **Think** | `nova/nova-think.ts` | Low-confidence LLM slots | Same schema, validated |

**Tool pick order** (`selectNovaTools`): recipes → Analysis cue → Trend cue → decisive SearchEngine → lexicon/heuristics.

### 1.3 What already works well

- Rules-first, catalog-only tools, dual write deny, RBAC on every skill.
- Multimodule `{party} {module}` for many money/docs cases (`Avaada invoices`, `tata steel GRN`).
- ClarifyAct bind-by-id (no re-fuzzy `"1"`).
- Sticky project bind → `pending tasks` keep-scope (when dialog healthy).
- Named multi-word projects (`James School project`) → Project Command recipe.
- Analysis/Trend as sibling engines that **should** consume resolved skill context.

### 1.4 Gaps (root of “NOVA can’t find Avaada tasks”)

| Gap | Symptom | Where |
|-----|---------|--------|
| **G1 Role-word pollution** | Hint = `"Avaada project"` → Prisma `contains "Avaada project"` → not found | Lexicon capture / leading-module span / resolve pre-normalize (partially fixed in P0) |
| **G2 Single-token brand gate** | `"tasks in avaada"` / `"avaada tasks"` failed `looksLikePartyOrProjectName` (≥2 words) → **no entityHint** → org-wide `tasks_summary` | SearchEngine status path |
| **G3 Silent org-wide on party miss** | Scoped tool selected but no entity bound → org totals with top assignees | Plan/tools when `entityHint` null |
| **G4 Parse-order clash** | `"X project task"` may hit named-project (`project_command`) vs leading-module (`tasks_summary`) inconsistently | SE vs `recipeMatchesQuery` |
| **G5 Kind hint unused** | Trailing `project` means kind=project, but resolve still soft-matches customer+project mixed | preferTypes only from SE `entityType` |
| **G6 Duplicated parsers** | SE, lexicon, recipes each invent entity spans | Drift on same utterance |
| **G7 Analysis/Trend under-wired** | Domain from cue regex; don’t re-use multimodule structure | analysis/trend domain inference |
| **G8 Sticky edge cases** | Short module follow-up without bind → org-wide; TTL/topic switch clears early | dialog-state keep rules |
| **G9 Reader isolated** | Fine for OCR; no shared “entity mentioned in chat caption” bridge | future optional |

**Avaada incident (transitional):** tip **3.0.95** still org-wide on `"tasks in avaada"`. Working-tree / P0 slice adds shared strip + single-token status bind + person_fallback for `"aalok tasks"`. That is **not** a brand whitelist — it is the start of G1–G3. Brand-specific if/else is forbidden forever.

---

## 2. Universal NL → structure contract

One object fills once (SearchEngine / Think / follow-up / clarify resume) and is the **only** input to Plan, resolve, skills, packs, Analysis, Trend.

```ts
/** Shared understand output — extend NovaSearchSlots / NovaPlan; do not fork. */
export type NovaQueryStructure = {
  schemaVersion: 1;
  rawQuery: string;
  normalizedQuery: string;
  routingQuery: string; // after sticky / clarify resume

  // classification
  queryFamily: NovaQueryFamily;
  intentId: string; // e.g. tasks_for_entity | named_project_detail
  confidence: "high" | "low";
  source: "search_engine" | "compose" | "think" | "follow_up" | "clarify_bind";

  // entity / person (hints vs binds)
  entitySpan: string | null;          // AFTER role-word strip
  entityKindHint: "project" | "customer" | "vendor" | "staff" | null;
  entityId?: string;                  // bound — skip fuzzy
  entityCode?: string;
  entityLabel?: string;
  suppressPersonHint: boolean;
  personHint: string | null;
  personUserId?: string;

  // module / metric / depth
  moduleHint:
    | "tasks"
    | "invoices"
    | "receipts"
    | "sales_orders"
    | "receivables"
    | "approvals"
    | "documents"
    | "delivery"
    | "grn"
    | "pos"
    | "expenses"
    | "payment_requests"
    | "projects"
    | "attendance"
    | "leave"
    | "kpi"
    | null;
  metric: string | null;
  focus: string | null; // pending | open | overdue | late | …
  tools: string[]; // catalog-only

  // time
  periodLabel: string | null;
  periodGrain: "day" | "week" | "month" | "fy" | "latest" | "open" | null;
  periodSource: "explicit" | "default" | "follow_up" | null;

  // engines
  depth: "thin" | "pack" | "analysis" | "trend";
  recipeId?: string | null;
  analysisDomain?: string | null;
  trendDomain?: string | null;

  clarifyReason?: string | null;
};
```

### 2.1 Invariants (encode once)

1. **Strip before lookup** — never search Prisma with trailing `project|task(s)|invoice(s)|…`.
2. **Kind hint from role words** — `… project` → prefer `project`; `… customer` / money modules → prefer `customer` / `vendor`.
3. **Party token present ⇒ scoped or clarify** — never silent org-wide for `tasks_summary` / money / docs / Project Command when an entity span was parsed.
4. **Bound id skips fuzzy** — ClarifyAct / sticky bind.
5. **Person demotion is explicit** — single-token + tasks + party miss → `person_fallback`; place framing (`tasks in X`) stays not_found clarify.
6. **Analysis / Trend inherit binds** — same `resolvedEntityDbId` / person ids as thin skills.
7. **RBAC before widen** — preferTypes never escalate permissions; staff chips only when `includeStaff` allowed.

---

## 3. Shared parsers (do not duplicate per engine)

New home (**P0 stub already on disk** as `src/lib/nova/query-structure/index.ts` with `parseNovaEntityRoleSpan` / `preferTypesForKindHint` / `acceptsPartyEntitySpan`; grow into split files):

| Module | Responsibility |
|--------|----------------|
| `src/lib/nova/query-structure/index.ts` | P0 entry: role peel + kind/module hints (landed stub) |
| `…/role-words.ts` | Role/module noun lists; strip; classify kind/module from tokens |
| `…/parse-entity-module.ts` | Span extractors: `X project`, `tasks in X`, `X tasks`, `X invoices` |
| `…/normalize-hint.ts` | Re-export / own `normalizeNovaEntityLookupHint` |
| `…/to-slots.ts` | Map structure → `NovaSearchSlots` + Plan fields |
| `src/lib/nova/party-name.ts` | Keep party-vs-person heuristics; strip used by query-structure |

**Consumers (must call shared parsers, not private regexes):**

- SearchEngine
- Lexicon extractors (`extractNovaNamedProjectHint`, `extractNovaEntityHint`)
- `recipeMatchesQuery` named-project arm
- Entity resolve (`preferTypes` from `entityKindHint`)
- Dialog sticky resume (`routingQuery` rebuild)
- Analysis / Trend domain inference (optional P1: read `moduleHint` / `entityKindHint`)

---

## 4. Upgrade each engine

### 4.1 SearchEngine (P0–P1)

- Call shared `parseEntityModuleAsk(query)`.
- Populate `entitySpan`, `entityKindHint`, `moduleHint`, `tools`, `suppressPersonHint`.
- Single-token brands allowed for party modules **and** status/tasks place framing.
- Keep person-shaped first names for later demotion (do not invent org-wide).

### 4.2 Lexicon / Intent / Plan (P1)

- Replace leading/trailing entity regex with shared parse.
- Plan refuses `tasks_summary` without entity/person when structure had an entity span → force clarify or scoped tool.
- Period defaults unchanged (module contracts).

### 4.3 Recipes / Packs (P1)

- Named project detection = shared kindHint project + entitySpan (single- or multi-token).
- `"X project task"` → structure module=tasks + kind=project → either thin `tasks_summary` **scoped** or Project Command Tasks chapter; pick by depth cue (`everything`, `photos`, bare tasks → thin).
- Document depth rule in pack handoffs.

### 4.4 Entity resolve (P0)

- Always `normalizeNovaEntityLookupHint`.
- `preferTypes` from `entityKindHint` (project ahead of customer when trailing `project` / tasks place framing).
- Mixed types → clarify chips (never silent guess).
- `not_found` + scoped module → clarify; leading person-task → person_fallback.
- Confirmed aliases unchanged.

### 4.5 Dialog sticky (P1)

- Module-only follow-ups (`pending tasks`, `invoices`) require `bound` or last structure entity; else clarify “which project/customer?”.
- Never rehydrate org-wide when previous turn had party bind within TTL.

### 4.6 Skills / thin summaries (P0–P1)

- Already filter by `resolvedEntityDbId` when present (`tasks.ts` project scope).
- Add assert: if structure had entitySpan and resolve failed, skill must not run org-wide (orchestrator already returns clarify — keep that gate).

### 4.7 Analysis (P1)

- Prefer `ctx.resolvedEntity*` over re-inferring from cue text.
- When cue is `"why are Avaada tasks overdue"`, domain=project/tasks; loaders use bound project.

### 4.8 Trend (P1–P2)

- Window binder stays; add optional party/project filter when structure has entityKindHint + bind.
- P0 Trend domains (attendance late, task late completion) remain person-ranked; party filter is soft scope when bound.

### 4.9 Reader (P2 optional)

- Optional: if chat caption mentions a party (`attach for Avaada`), pass kindHint into Reader ACL/context — **no** ledger writes.

### 4.10 Think (P1)

- Prompt: emit `entityKindHint` + stripped `entitySpan`; validate against catalog; drop invents.

---

## 5. Phased roadmap

### P0 — Shared strip + kind-hint resolve (this tip / next tip)

**Ship:**

1. Shared strip helpers (`normalizeNovaEntityLookupHint`, role-word lists).
2. Kind hint from trailing `project` / place framing → `preferTypes: ["project", …]`.
3. SearchEngine: single-token brands for tasks/status scopes; strip noise in `cleanHint`.
4. Resolve: strip before Prisma; scoped not_found → clarify; leading `name tasks` person_fallback.
5. Goldens: `tasks in avaada`, `Avaada project task`, `avaada tasks`, `James School project task`, `aalok tasks` (no org-wide invent).

**Acceptance:**

| Query | Must |
|-------|------|
| `tasks in avaada` | entitySpan=avaada · tools include tasks_summary or project_command · **not** org-wide |
| `Avaada project task` | entitySpan=Avaada · kindHint=project · scoped tasks / PC |
| `avaada tasks` | entitySpan=avaada · scoped |
| `avaada project` | entitySpan=Avaada · kindHint=project · resolve/PC/clarify — not FY dump |
| `james school project task` | entitySpan=James School · scoped tasks / PC |
| `aalok tasks` | person path if no party · never silent Madhu/Zeeshan org board |

**Out of P0:** Analysis/Trend deep party matrix, Reader bridge, Think prompt rewrite. (query-structure stub may already land with P0 — keep growing there, do not invent a second package name.)

### P0.1 Rollout & metrics

**Rollout:** sequential tip gate — live `/api/health` green → unique semver → `release:verify` → one deploy trigger (`git push` **or** `railway up`) → poll health version + HTML sanity.

| Metric | Definition | Target |
|--------|------------|--------|
| **Miss rate** | entitySpan parsed ∧ (not_found ∨ unmatched) / asks with entitySpan | ↓ |
| **Wrong-scope rate** | entitySpan parsed ∧ skill ran org-wide (no resolved id) / asks with entitySpan | → **0** on P0 task/project paths |
| Clarify precision | user picks option that succeeds / clarities shown | ↑ |
| False person-steal | party/project span bound as staff | ↓ |
| Sticky success | follow-up keeps same entityId | ↑ |

Log crumbs: `strippedRoleWords`, `entityKindHint`, `entitySpan`, `resolveKind`, `scoped:boolean`.

### P1 — One parser, all consumers

- Expand `query-structure/*` (stub already on disk); delete duplicate lexicon/recipe named-project regex where possible.
- Plan gate: entitySpan + scoped module ⇒ no org-wide tool run.
- Sticky: module-only follow-up without bind → clarify.
- Analysis/Trend read structure fields.
- Expand goldens: 30+ multimodule + sticky sequences.

### P2 — Depth, conflict policy, polish

- Depth picker: thin vs pack vs analysis vs trend from cues.
- Conflict policy table (customer vs project same token) → always clarify when mixed types.
- Hinglish role words (`project ka task`, `kaam`).
- Optional Reader caption entity hint.
- Eval harness: offline JSONL of production-like asks; fail tip if regress org-wide-on-party.

---

## 6. Acceptance tests / goldens (by phase)

| ID | Query | Phase | Expect |
|----|-------|-------|--------|
| QI-01 | `tasks in avaada` | P0 | entity + scoped tasks |
| QI-02 | `Avaada project task` | P0 | stripped Avaada + project kind + scoped |
| QI-03 | `avaada tasks` | P0 | entity + scoped |
| QI-04 | `avaada project` | P0 | kind=project · not projects_summary FY |
| QI-05 | `james school project task` | P0 | James School + tasks |
| QI-06 | `aalok tasks` | P0 | person_fallback · no org invent |
| QI-07 | `Avaada invoices` | P0 (exists) | money + entity |
| QI-08 | sticky: bind Avaada → `pending tasks` | P1 | keep bind |
| QI-09 | `why are avaada tasks overdue` | P1 | Analysis + project filter |
| QI-10 | `late task completion trend for avaada` | P2 | Trend scoped or clarify |
| QI-11 | ambiguous Avaada customer+project | P0/P1 | clarify chips |
| QI-12 | `1` after clarify | exists | bind-by-id |

Gate: unit goldens in `nova-search-engine.test.ts`, `party-name.test.ts`, resolve commercial guards; P1 add dialog-state sticky cases; never only manual chat QA.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| **Over-binding** single-token → wrong party | Soft contains + multi → clarify; sensitiveMoney always clarify; preferTypes narrow; never silent pick across types |
| **Person vs party** (`aalok` vs `avaada`) | person_fallback on leading `name tasks` miss; place framing (`in`/`at`/`on`) stays project clarify |
| **Customer vs project** same brand | Kind hint from `project` word; else clarify mixed |
| **Recipe steals depth** | Document thin vs PC rule; goldens both paths as long as **scoped** |
| **Sticky wrong party** | Topic switch clears; TTL; HR asks drop party bind |
| **RBAC widen** | resolve permission gates unchanged; staff chips only when allowed |
| **Org-wide regression** | Invariant #3 + QI goldens in CI / release:verify subset |

---

## 8. Implementation sketch (P0 shared API)

**Landed stub** (`src/lib/nova/query-structure/index.ts`):

```ts
parseNovaEntityRoleSpan(raw) → { entitySpan, entityKindHint, moduleHint, strippedRoleWords }
preferTypesForKindHint(kind) → ["project","customer"] | …
acceptsPartyEntitySpan(span, allowSingleToken)
normalizeNovaEntityLookupHint("Avaada project tasks") // → "Avaada"
```

Wire:

1. SE `cleanHint` / multimodule → `entitySpan` via `parseNovaEntityRoleSpan`
2. `resolveNovaEntityHint(hint, user, { preferTypes: preferTypesForKindHint(kind) })`
3. Plan/tools: if `entitySpan` && scoped tool && resolve miss → clarify (already for not_found)

---

## 9. Ship / tip protocol

1. Live tip health green (`/api/health` ready + version).
2. Unique next semver (≤3.0.99 then 3.1.0).
3. `npm run release:verify`.
4. **One** trigger: `git push origin HEAD` **or** `railway up` — never both.
5. Poll Railway SUCCESS + health version + HTML `APP_ERROR` false.

**This plan tip:** docs + optional P0 helpers. Brand-only patches are rejected in review.

---

## 10. Doc / code map

| Artifact | Role |
|----------|------|
| This file | Upgrade roadmap + contract |
| `party-name.ts` | Party heuristics + strip (P0) |
| `query-structure/*` | Shared parsers (**P0 stub landed**; expand P1) |
| `nova-search-engine.ts` | Primary slot filler |
| `nova-tools.ts` | Resolve + tool orchestration |
| `dialog-state.ts` | Sticky bind |
| `recipes/registry.ts` | Bounded pack phrases |
| Analysis / Trend plans | Sibling contracts that must consume structure |

---

## 11. Decision log

| Date | Decision |
|------|----------|
| 2026-07-14 | Full engine upgrade over Avaada-only hotfix |
| 2026-07-14 | Shared strip + kind-hint is **P0**; brand lists forbidden |
| 2026-07-14 | Org-wide is illegal when entity span was present |
| 2026-07-14 | Thin scoped tasks vs Project Command both OK if same bind |
| 2026-07-14 | Package name = `query-structure` (not a second `query-understanding`) |
| 2026-07-14 | Metrics: miss rate + wrong-scope rate required for P0 exit |

---

## 12. Transitional note (Avaada incident)

Observed on tip **3.0.95**:

1. `tasks in avaada` → org-wide Task summary (Madhu/Zeeshan…) — **G2/G3**.
2. `Avaada project task` → not_found matching `"Avaada project"` — **G1**.
3. `AvAAda` bare → clarify menu — **acceptable**.

P0 work addresses G1–G3 via **shared** strip + brand-shaped single-token + scoped clarify/person_fallback — Avaada is only a golden, not a special case. Remaining G4–G9 follow P1–P2 above.


---

## 13. Ship status (after P1+P2 + residuals)

| Phase | Status | Notes |
|-------|--------|-------|
| **P0** | ✅ | Shared strip / kind-hint / single-token status bind / person_fallback |
| **P1** | ✅ | `query-structure/*` expanded; lexicon/SE consume shared parse; plan + tool org-wide gate; sticky module follow-ups require bind; Analysis/Trend read structure |
| **P2** | ✅ **complete** | Depth / conflict / Hinglish · Reader caption→kindHint (**3.1.5**) · Think `entityKindHint` (**3.1.5**) · Trend party matrix (**3.1.5**) · QI harness + miss/wrong-scope (**3.1.4** Hardening) |

### Tip series (2026-07-14)

| Tip | Ships |
|-----|-------|
| **3.1.4** Hardening→9 | MFA docs · backup drill evidence · QI eval harness + `qi-metrics` in `release:verify` · freeze |
| **3.1.5** NOVA kindHint residual | Reader caption→`openContext.entityKindHint` · Think prompt/`validateNovaSearchSlots` kindHint peel · Trend party matrix (task soft project+customer) — **no harness re-ship** |

### Micro-residuals only (honest)

| Item | Why deferred |
|------|----------------|
| AR aging / KPI score **Trend adapters** | Domains stay `planned` — no ERP SoT series loader yet |
| Ops miss-rate **dashboard UI** | Counters + crumbs + golden asserts on tip; full admin panel not required |
| Reader caption ERP **bind** (resolve id) | Caption → kindHint + soft draft party prefill only; resolve stays on chat `answerNovaQuery` |
