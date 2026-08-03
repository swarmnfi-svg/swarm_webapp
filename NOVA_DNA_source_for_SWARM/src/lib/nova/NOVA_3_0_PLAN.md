# NOVA AI 3.0 — independent best-path plan

**Implemented as of tip 3.0.1:** see [`NOVA_3_IMPLEMENTATION.md`](./NOVA_3_IMPLEMENTATION.md) (sprint map, packs, report plane, My reports, audit, open DBA ops). Live health may lag tip — check `/api/health`.

**Deliverable:** tracked strategy for emPOWER’s niche (project / EPC / CBG / SME), not a Power BI clone.  
**Baseline:** tip / live **~2.136.6** — DialogState, SearchEngine + gated Think, dual write preflight, answer guards, Finding, recipes, metrics dictionary, aliases.  
**Related:** [`NOVA_FINAL_ARCHITECTURE.md`](./NOVA_FINAL_ARCHITECTURE.md) · [`NOVA_COMMERCIAL_READY_PLAN.md`](./NOVA_COMMERCIAL_READY_PLAN.md) · [`NOVA_DIALOG_STATE_PLAN.md`](./NOVA_DIALOG_STATE_PLAN.md) · [`NOVA_3_IMPLEMENTATION.md`](./NOVA_3_IMPLEMENTATION.md)

**Positioning (freeze):** *Trusted operational brain for project/EPC/CBG SMEs — private reports on its own plane — never changes the ERP.*

**Citations (light):** ThoughtSpot’s agentic semantic layer emphasizes governed definitions + deterministic query generation over free text-to-SQL ([Spotter Semantics](https://www.thoughtspot.com/product/spotter-semantics)); Verified Liveboards / Pulse-style Monitor alerts are steward-marked trust + KPI notifications — patterns to steal selectively, not productize wholesale ([Verified Liveboards](https://www.thoughtspot.com/blog/verified-liveboards), [Monitor](https://docs.thoughtspot.com/cloud/26.3.0.cl/monitor)).

---

## 1. Executive verdict (independent)

**NOVA 3.0 is not a BI platform program.** It is the maturation of emPOWER’s **controlled ERP intelligence**: ask in natural language → catalog skills under RBAC → evidence-backed Finding → guarded narration → optional **downloadable snapshot report** in a separate NOVA plane → thin **system-selected** visuals bound to certified metrics. The competitive wedge is *trustworthy answers for directors and ops on live ERP*, inside the product they already use — not search-analytics, process mining, or a seven-brand suite.

**Freeze the invariants, not the product.**

| Freeze forever | Do **not** freeze yet |
|----------------|------------------------|
| Read-only on operational ERP | Follow-up / period / multi-entity polish |
| Catalog tools only (no free SQL / LLM tool pick) | Slot combo validation + eval coverage |
| Rules-first + gated Think | Pack composition + Project Command depth |
| Dual write guards + answer guards | Report / snapshot plane (NOVA-only writes) |
| Session memory T0–T2; no sticky ₹ RAG | Certified metric library expansion |
| No dashboard builder / free viz studio | Which 2–3 chart bindings ship with Month pack |

**Commercial-ready chat (P0–P1 in the prior plan) is largely landed on ~2.136.6.** The next risk is **over-scoping into Tableau/ThoughtSpot/Celonis territory** before daily director/ops asks are boringly reliable. That would dilute the niche and burn trust capital.

**Affirm (sound):** NOVA never writes emPOWER operational data; it may create chat / dialog / findings / reports / chart datasets **only** in a separate NOVA plane (metadata + object prefix/bucket); downloads re-check permissions; retention applies. DB-level `nova_readonly` is a **parallel hardening track** (not a Month-pack blocker, not a distant P3 afterthought) — see §5.

---

## 2. What the ChatGPT / user addenda got right vs wrong

### Critique decisions (this revision)

| # | Proposal | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Limited visual intelligence (KPI/trend/ageing/SVS/tables/funnel/concentration/timeline); no dashboard builder; system-selected governed charts | **ACCEPT_MODIFIED** | Yes early, but **thin**. Ship **2–3** governed chart bindings with Month pack (KPI strip + one trend + one ageing/attention). Reject shipping all eight chart types day one. No builder forever. |
| 2 | Semantic layer comprehensive internally (full metric contract); not a product brand | **ACCEPT** | Keep Trust-layer internal. Contract must be deep enough that certified answers are auditable — underbuilding semantics recreates “is this FY?” distrust. |
| 3 | Project intelligence rivals Collection; signature “tell me everything important about this project” | **ACCEPT** | EPC spine is the long-term differentiator vs generic AR bots. Elevate **Project Command** to named pack #2. |
| 4 | Move `nova_readonly` earlier; six isolation layers | **ACCEPT_MODIFIED** | Parallel track during Phases 2–4; does not block Month pack exit. Six layers codified in §5 — app guards stay primary until role is live. |
| 5 | Report plane contents (metadata…files); not full ledgers; immutability + regenerate | **ACCEPT** | Snapshots are answer artifacts. Immutable once saved; regenerate = new report row. No shadow ledger. |
| 6 | Three packs: Month → Project Command → Collection; CBG as section | **ACCEPT** | Refines prior “Director first / Collection #2.” Collection remains deepest *cash* recipe and Month chapter; third *named* pack. CBG never a fourth pack. |
| 7 | Feel target: July going? + narrative + 3 attentions + buttons; follow-up Why Tata… | **ACCEPT** | Becomes the UX success bar (§12). |
| 8 | Positioning: trusted brain / private reports / never change ERP | **ACCEPT** | Locked in header + §15. |

### Accept (keep the idea)

| Idea | Why it fits emPOWER |
|------|---------------------|
| Governed semantics / metric definitions | Already Phase A (`NOVA_METRICS`, ontology). Deepen the **internal contract** — don’t rebuild as a product brand. |
| Deterministic query path vs free text-to-SQL | Matches SearchEngine + skills; ThoughtSpot’s lesson is correct for trust. |
| Certified / verified answers | Steward-approved metric+skill bindings (“this is how we define collection”). High leverage, low surface area. |
| Data trust before glamorous BI | Correct order. |
| Separate artifact plane (chat, reports, snapshots) | Correct boundary; refine storage + snapshot schema below. |
| Read-only ERP + permission re-check on export | Immutable rule. |
| Domain “intelligence packs” (bounded recipes+) | Correct shape — three named packs (§9). |
| System-selected governed visuals | Trust-preserving; charts are metric bindings, not exploration. |
| Pulse-like alerts *later* | Useful as thin notifications on packs — not a branded product yet. |

### Modify (right instinct, wrong packaging / order)

| Idea | Modification |
|------|----------------|
| “7 products” | Collapse to **one product (NOVA)** with **3 layers** + **packs** (see §6). |
| 8 BI phases | Replace with **trust → conversational excellence → packs → thin visuals → report plane → optional Pulse**. No dashboard-builder phase. |
| First 15 ships | Cut to **10 ruthless ships** with exit criteria (§11). |
| Collection as first pack | **Director Month Performance** first. Prior plan had Collection as #2; **revised:** Project Command #2, Collection Attention #3 (Collection still deepest money chapter inside Month). |
| “All chart types with packs” | **2–3** with Month pack; more bindings only after certified metrics + eval gates. |
| “Lens” as exploration product | Become **Report / Snapshot UX** on the NOVA AI page — not a separate brand. |
| “Query” as product | Already the chat core — do not rename or market separately. |
| Semantic as product | Keep as **internal Trust layer** (comprehensive metric contract + certified bindings). |
| `nova_readonly` as late P3 | **Parallel track** — target live around report plane, not year-end. |
| Forecast / Process as roadmap items | **Defer** until certified facts + packs have months of trust (§8). |

### Reject (over-scoped or wrong for SME-ERP)

| Idea | Why reject |
|------|------------|
| Power BI / Tableau / Looker clone | Users already need ERP truth in chat; building viz platforms is a different company. |
| Celonis-style process mining | Event-log mining is heavy, wrong data maturity, weak SME ROI. |
| Palantir / Oracle Analytics ambition | Wrong scale and sales motion for project/EPC SME. |
| Free / agentic SQL generation as a product surface | Violates NOVA invariants; ThoughtSpot itself markets *against* naive text-to-SQL. |
| Writeback / “act in ERP from chat” | Forbidden. Screens own mutations. |
| Sticky behavioral / money memory (NovaMind) | Already rejected; keep rejected. |
| Seven separately marketed product names | Confuses buyers and the team; SME buys “NOVA in emPOWER,” not a suite. |
| BI megaprogram before daily-use gaps close | Wrong order; trust debt compounds. |
| **Dashboard / report designer** | Forever non-goal; system selects charts from certified bindings. |
| **Eight chart types on day one** (KPI + trend + ageing + SVS + project tables + CBG funnel + concentration + milestone timeline) | Overscoped. Month pack ships **KPI + trend + one attention/ageing**; SVS/funnel/concentration/timeline only after pack metrics are certified and eval-gated. |
| **CBG as a fourth named pack** | Niche win as a **section** inside Month (and optionally Project); not a standalone product surface. |
| **Full ledger copy inside reports** | Violates “answer artifact not shadow ERP”; report holds facts digests + metric versions + chart datasets only. |

---

## 3. Gaps that still hurt daily use (before any BI megaprogram)

Honest vs tip ~2.136.6 — what directors/ops still feel:

| Gap | Why it hurts | Priority |
|-----|--------------|----------|
| Multi-turn period / entity / topic edge cases | Month → “and last month”, party → project still need goldens beyond Tata `"1"` | P0 |
| Slot family/metric/entity combo matrix | Illegal plans still possible via Think edge paths | P1 |
| Director “how is this month?” as one coherent pack | Skills exist (`director_dashboard`, receivables, overdue, projects, CBG) but not one trusted composition + Finding set + feel target | P0 |
| Project Command (“everything important about this project”) | `project_health` recipe is thin vs EPC spine (SO/PO/delivery/invoice/cash/milestones per project) | P0→P1 |
| Provenance + “why this number” UX | Facts exist; users still ask “is this FY or calendar?” | P1 |
| Thin governed visuals | Directors skim numbers; need KPI/trend/ageing bound to certified metrics — not a viz studio | P1 |
| Exportable snapshot (PDF/CSV) of a NOVA answer | Directors want to forward month performance; no NOVA report plane yet | P1 |
| Eval / telemetry for clarify + guards | Regressions will return without CI gates | P1 |
| Alias ops workflow | Confirmed aliases exist; day-to-day confirmation UX still light | P2 |
| Physical `nova_readonly` DB role | Ideal hardening; start **parallel** with packs/reports — not Month blocker, not distant P3 | **P1 parallel** |

**Verdict:** Do **not** freeze conversational core development. Freeze **architecture invariants**. Spend the next 90 days making the core *boring and correct*, ship Month Performance (+ thin visuals), stand up report plane + `nova_readonly` in parallel, then Project Command.

---

## 4. Architecture — read-only ERP + NOVA plane

```mermaid
flowchart TB
  subgraph UI["emPOWER UI"]
    Chat["NOVA AI page / Bubble"]
    Viz["System-selected charts<br/>metric-bound only"]
    Dl["Download snapshot / report"]
  end

  subgraph Core["NOVA Core — understand → plan → control → execute"]
    Inf["infer + DialogState + ClarifyResolver"]
    Rules["SearchEngine rules-first"]
    Think["Think iff low confidence"]
    Plan["Plan + recipes + dual write guards"]
    Rbac["RBAC filterNovaToolsForUser"]
    Skills["Catalog skills · Prisma READ"]
    Find["NovaFinding"]
    Narr["Narrate + answer guards"]
    Sem["Metric contract + certified bindings"]
  end

  subgraph ERP["empower_app_db — operational ledger"]
    Op[(Customers · Invoices · Projects · HR · …)]
    Role["Postgres role nova_readonly<br/>parallel track"]
  end

  subgraph Plane["NOVA plane — only place NOVA writes"]
    Meta[(nova_system metadata<br/>conversations · dialogState<br/>aliases · findings · report rows)]
    Bucket[("nova_bucket / prefix<br/>PDF · CSV · snapshot JSON")]
  end

  Chat --> Inf --> Rules --> Think --> Plan --> Rbac --> Skills
  Sem --> Plan
  Skills -->|SELECT only| Op
  Role -.->|enforces SELECT| Op
  Skills --> Find --> Narr --> Chat
  Find --> Viz
  Sem --> Viz
  Narr -->|persist T0–T2| Meta
  Chat -->|Save as report| Meta
  Meta -->|render artifact| Bucket
  Dl -->|re-check can(...) + ownership| Meta
  Dl --> Bucket
```

### Chat → report flow (target)

1. User gets a guarded answer (facts + Finding + provenance + optional system charts).
2. **Save report** creates `NovaReport` metadata in NOVA plane (see snapshot schema below — **not** a copy of the whole ledger).
3. Renderer writes PDF/CSV/JSON to **nova_bucket** under `nova/reports/{org}/{user}/{id}`.
4. Download endpoint: auth → ownership/share ACL → **re-run permission check** against current RBAC → stream object or 403.
5. Retention job deletes objects + rows (sensitive shorter).
6. **Immutable once saved**; “refresh” / regenerate creates a **new** report id (as-of advances).

NOVA never `INSERT`/`UPDATE`/`DELETE` on operational ERP tables.

### Report snapshot schema (v1)

| Include | Exclude |
|---------|---------|
| Report metadata (id, owner, org, title, createdAt, retention) | Full invoice / ledger / party tables |
| Filters applied (period, entity, project, pack id) | Raw skill dumps wholesale |
| Fact digests (typed facts used in answer) | Salary / bank account identifiers in long-lived bodies |
| Metric IDs + **versions** + certification flags | Unbounded CSV of all ERP rows |
| Findings (observation + evidence refs + deep links) | Mutable “live” embeds that silently change |
| Chart datasets for **system-selected** bindings only | User-authored chart configs / dashboard layouts |
| Narrative text (guarded) | Sticky chat memory as authority |
| Provenance (“from ledger” / skill ids) | |
| As-of timestamp | |
| File pointers (PDF/CSV/JSON in nova_bucket) | |

**Regenerate rule:** edits to underlying ERP after save do **not** mutate the snapshot; user regenerates → new row + new objects.

---

## 5. Storage, permissions & isolation (immutable)

### Logical planes

| Plane | Contents | NOVA access |
|-------|----------|-------------|
| **empower_app_db** | All operational ERP | **READ only** via skills + `can(...)`. Harden with Postgres role `nova_readonly` on parallel track. |
| **nova_system** | `NovaConversation`, `NovaMessage`, `dialogState`, `NovaEntityAlias`, future `NovaReport`, `NovaCertifiedAnswer`, Finding archives, chart dataset refs | **READ/WRITE** (app role scoped to these tables/schema). |
| **nova_bucket** | Report PDFs, CSV exports, frozen snapshot JSON | **READ/WRITE** only under `nova/` prefix (or dedicated bucket). |

### Six isolation layers (hierarchy)

Defense in depth — outer layers ship first; DB role catches escapes.

| # | Layer | When |
|---|-------|------|
| 1 | **Catalog skills only** — no free SQL / LLM tool pick | Live (invariant) |
| 2 | **Dual write preflight + code review** — NOVA paths cannot mutate ERP models | Live |
| 3 | **Answer guards** — narration cannot invent ₹ / soft-fuzzy money entities | Live |
| 4 | **RBAC `can(...)` on every skill** + `filterNovaToolsForUser` | Live |
| 5 | **Export ACL + RBAC re-check** on download (current perms, not save-time) | Report plane v1 |
| 6 | **Postgres `nova_readonly` role** for skill DB connections | **Parallel track** Phases 2–4; target before/with report plane hardening |

Layers 1–5 remain mandatory even after layer 6 lands. `nova_readonly` is **not** a Month Performance exit criterion, but it is **not** deferred to a vague P3 either — schedule work alongside certified metrics / report plane.

### Refinement of the user idea

| Today (~2.136.6) | 90-day target | 12-month north star |
|------------------|---------------|---------------------|
| Nova* tables live in the **same** Postgres as ERP (already true) | Keep **one database**, enforce **schema or table-prefix discipline** + app-level write ban; **start `nova_readonly` role** for skill queries | Optional physical split: `nova_system` DB **or** schema `nova` + role separation; dedicated bucket/prefix |
| Chat/messages already NOVA-owned | Add `NovaReport` (+ Finding archive + chart dataset refs) | Steward UI for certified answers |
| Object storage shared (`STORAGE_*`) | Use dedicated prefix `nova/` (or `NOVA_STORAGE_PREFIX`) | Dedicated `nova_bucket` if isolation/compliance demands |

**Do not** invent a second ERP warehouse for 3.0. Skills stay live Prisma reads. Snapshots are **answer artifacts**, not a shadow ledger.

### Permission rules (immutable)

1. **No operational writes** — dual write guards + code review + `nova_readonly` (parallel).
2. **Every skill** gated by `can(...)` / org-finance helpers already used.
3. **Export re-check** — download uses *current* RBAC, not the RBAC at save time (deny if revoked).
4. **No salary/bank identifiers** in long-lived report bodies; sensitive flags → shorter retention.
5. **Shares** (if any) are explicit ACL rows in nova_system — never “link with ERP cookie.”
6. **Retention** — conversations ≤ existing policy; reports default finite (e.g. 90 days) unless director marks keep.
7. **Snapshot immutability** — saved reports do not auto-update; regenerate = new id.

---

## 6. Critique of “7 products” — merge

ChatGPT’s seven: Semantic · Query · Lens · Insight · Pulse · Process · Forecast.

**Too many brands for one SME assistant.** Buyers and the team need one name.

### NOVA 3.0 naming (one product, three layers, packs)

| Layer | Internal name | Maps from | User-visible? |
|-------|---------------|-----------|---------------|
| **Core** | Dialog + SearchEngine + skills + guards | Query + Insight (Finding) | “NOVA” chat |
| **Trust** | Metric contract + certified bindings + answer guards + provenance | Semantic + certified answers | Badges: “Certified metric” / “From ledger” |
| **Packs** | Bounded recipe compositions | Domain intelligence | **Month Performance · Project Command · Collection Attention** |
| **Reports** | Snapshot export on NOVA AI page | Lens (modified) | “Save / Download report” |
| **Visuals** | System-selected chart bindings | (none — do not brand) | Inline charts only when pack/metric warrants |
| **Watch** (later) | Threshold/scheduled alerts on pack metrics | Pulse (thin) | Optional “Notify me” — not a product line |
| **—** | — | **Process** | **Killed for 12 months** |
| **—** | — | **Forecast** | **Deferred** — labeled prediction only inside packs (Phase G style), never a product |

Insight is not a product: **`NovaFinding` is a stage** between facts and narration (already exists).

### Internal semantic / metric contract (comprehensive, not underbuilt)

Not a marketed “Semantics” product — but the Trust layer must be **complete enough to audit**. Every certified (and pack-critical) metric carries:

| Field | Purpose |
|-------|---------|
| `id` / `version` | Stable identity; drift breaks CI |
| `definition` | Human-readable meaning |
| `calculation` | Deterministic formula / skill mapping |
| `source` | Skill id(s) / ledger objects |
| `unit` | ₹, count, %, days, … |
| `aggregation` | sum / count / avg / latest — explicit |
| `periodRule` | Calendar month vs FY vs as-of — never ambiguous |
| `gstTreatment` | Inclusive / exclusive / n/a |
| `emptyMeaning` | What “no rows” means (zero vs unknown) |
| `access` | `can(...)` / role prerequisites |
| `certification` | steward-approved | draft | deprecated |
| `owner` | Steward / team accountable |
| `lastValidated` | When binding was last checked against skill output |

UI can stay admin-simple; **depth lives in the contract**, not in a brand.

### Limited visual intelligence (governed, thin)

| Rule | Detail |
|------|--------|
| **Allowed** | System picks charts from a **small catalog** of metric-bound templates when a pack/Finding warrants them. |
| **Forbidden** | Dashboard builder, drag-drop viz, user-authored chart configs, free exploration BI. |
| **Month pack v1 (ship)** | (1) KPI strip, (2) period trend for certified sales/collection, (3) ageing or attention breakdown — **only these**. |
| **Later bindings (not day one)** | SVS, project tables, CBG funnel, concentration, milestone timeline — add only after metric certification + eval gates for that pack. |
| **Reports** | May embed the same chart datasets that were shown (frozen); no new viz surface in the report plane. |

---

## 7. Capability maturity (honest vs tip)

| Capability | Tip ~2.136.6 | 90-day bar | 12-month north star |
|------------|--------------|------------|---------------------|
| Rules-first + gated Think | **Live** | Harden goldens | Same invariant |
| DialogState bind-by-id | **Live** | Edge-case suite green | Stable |
| Dual write guards | **Live** | Keep + audit path | + `nova_readonly` live |
| Answer guards | **Live** | Deterministic + LLM parity | Same |
| Metric contract | **v1 dictionary** | Full contract fields on pack metrics | Certified bindings UI |
| Recipes / Finding | **Partial** | Month Performance pack + feel target | 3 named packs |
| Governed visuals | **Absent** | 2–3 bindings on Month pack | More bindings per pack; still no builder |
| Project Command | **Thin** | Recipe + “everything important” spine started | Pack #2 mature |
| Collection Attention | **Recipe v1** | Deepen as Month chapter | Named pack #3 |
| Collection delay prediction | **Labeled only** | Stay labeled | Still not “Forecast product” |
| Proactive insights | **v1 live** | Tie into packs / 3 attentions | Watch/alerts thin |
| Reports / snapshots | **Absent** | Save + download + re-check + schema | Retention + share ACL + regenerate |
| `nova_readonly` | **Absent** | Parallel track in progress / live | Default for all skill DB access |
| Process mining | **Absent** | **Out** | **Out** |
| Free SQL / BI builder | **Forbidden** | **Forbidden** | **Forbidden** |

---

## 8. Ruthless prioritization

### 90-day path (best for the niche)

1. **Conversational trust hardening** — follow-ups, period grain, slot combos, eval gates.  
2. **Signature pack: Director Month Performance** — feel target (§12) + **2–3 governed charts**.  
3. **NOVA report plane v1** — snapshot schema + save/download + immutability/regenerate + RBAC re-check.  
4. **Certified metric contract for that pack** — 8–15 steward-defined bindings with full contract fields.  
5. **`nova_readonly` parallel track** — role + skill connection cutover (does not block #2 exit).  
6. **Project Command pack started** — “tell me everything important about this project” composition.  
7. **Collection Attention deepened** as Month chapter + prep for named pack #3.

Exit the 90 days when a director can ask *“how is July going?”*, get the feel-target answer, see thin governed charts, save an immutable report, and download it tomorrow under the same RBAC — without NOVA ever writing ERP rows — with `nova_readonly` either live or clearly mid-flight.

### 12-month north star

- **Three packs:** Month Performance → Project Command → Collection Attention (CBG stays a section).  
- Reports + retention + optional share + regenerate.  
- Governed visuals expanded **per pack**, still no builder.  
- Thin Watch (Pulse-like) on pack KPIs via existing notification channels.  
- `nova_readonly` default; optional physical nova schema split.  
- Still **no** Process product, **no** Forecast product, **no** dashboard builder.

### Kill / defer explicitly

| Item | Decision |
|------|----------|
| Process (Celonis-like) | **Kill for 12 months** |
| Forecast product | **Defer** — labeled estimates only inside packs |
| BI phase program / viz studio / dashboard builder | **Kill** |
| Eight chart types day one | **Kill** — thin 2–3 with Month pack |
| CBG as fourth named pack | **Kill** — section only |
| Full ledger in reports | **Kill** |
| Seven product brands | **Kill** |
| Text-to-SQL surface | **Kill forever** |
| ERP writeback from chat | **Kill forever** |
| NovaMind sticky money memory | **Kill forever** |

---

## 9. Three-pack strategy

**Order (named packs):**

| # | Pack | Role | Verdict |
|---|------|------|---------|
| **1** | **Director Month Performance** | Commercial success bar; cash + projects + CBG section in one ask | **Ship first** |
| **2** | **Project Command** | Signature EPC ask: *“tell me everything important about this project”* — SO/PO/delivery/invoice/cash/milestones/attention | **Elevate** — long-term differentiator vs generic BI/AR |
| **3** | **Collection Attention** | Deepest money ops pack; project-aware outstanding/overdue/receipts | **Ship third** as named pack; still a **chapter inside Month** from day one |

| Not a pack | Treatment |
|------------|-----------|
| **CBG Pipeline** | Section inside Month (and optionally Project) — niche win, not pack #4 |
| Pure HR attendance | Defer as pack; skills already strong |

**Why Project Command over Collection as #2?** Collection is financially critical and already has a recipe — it deepens early *inside* Month. Project Command is what makes NOVA *emPOWER-native* (EPC spine) rather than a generic receivables chatbot. Collection remains pack #3 by name and the deepest cash subsystem.

**Why not Collection alone first?** Collection without month context and project linkage under-sells EPC. Month Performance *includes* collection Findings and teaches the certified-metric + report + thin-visual pattern once.

---

## 10. Phased roadmap with exit criteria

### Phase 0 — Invariant freeze (week 0)

**Ship:** Doc + CI markers that write paths / free SQL / sticky ₹ memory / dashboard builder are forever-forbidden.  
**Exit:** Architecture + this plan linked from `NOVA_FINAL_ARCHITECTURE.md`; no code regression on `read_only_guard` goldens.

### Phase 1 — Conversational excellence (weeks 1–4)

**Ship:** Follow-up/period/entity goldens; slot combo validation; clarify telemetry.  
**Exit:** Director-style multi-turn suite green in CI (incl. *Why Tata…* after month ask); no re-fuzzy after bind; illegal Think combos rejected.

### Phase 2 — Month Performance pack + thin visuals (weeks 3–7)

**Ship:** Bounded recipe → Finding set → deterministic-first narration → **KPI + trend + ageing/attention** chart bindings only.  
**Exit:** Feel target (§12) met; charts only from certified/pack metric ids; no builder surface.

### Phase 3 — Report plane v1 (weeks 5–9)

**Ship:** `NovaReport` per snapshot schema; bucket objects; download RBAC re-check; immutability + regenerate; retention.  
**Exit:** Save from NOVA AI page; download works; revoked permission → 403; no ERP writes in audit; regenerate creates new id.

### Phase 4 — Certified metric contract + `nova_readonly` (weeks 7–11)

**Ship:** Steward bindings with full contract fields (§6); CI drift checks; **parallel** Postgres `nova_readonly` for skill connections.  
**Exit:** Month pack shows certified badges; binding drift fails CI; skill queries run as readonly role (or cutover date committed).

### Phase 5 — Project Command + Collection deepen (weeks 9–14)

**Ship:** Project Command recipe (“everything important”); project-aware Collection chapter → named pack #3 prep.  
**Exit:** Project ask trusted for EPC spine; “Collection attention for project X” not theatre.

### Phase 6 — Watch lite (post-90 / optional)

**Ship:** Threshold or daily digest on pack KPIs via existing notifications — not a Pulse product.  
**Exit:** Opt-in only; same RBAC; no spam defaults.

---

## 11. First 10 ships only (ruthless)

| # | Ship | Why |
|---|------|-----|
| 1 | **Follow-up & period golden suite** | Daily use breaks here more than in missing BI; includes *Why Tata…* after month. |
| 2 | **Slot combo validation matrix** | Stops illegal plans before tools run. |
| 3 | **Director Month Performance recipe** | Niche success bar; feel target composition. |
| 4 | **Thin governed visuals (KPI + trend + ageing)** | Trust-preserving skim layer; **not** eight chart types. |
| 5 | **NovaReport metadata + snapshot schema + save** | Starts the NOVA write plane properly (no ledgers). |
| 6 | **Snapshot render + nova_bucket + immutability/regenerate** | Downloadable artifact directors can forward. |
| 7 | **Download ACL + RBAC re-check** | Security boundary that makes reports safe. |
| 8 | **Certified metric contract (pack set) + `nova_readonly` cutover start** | Semantics depth without a product brand; isolation layer 6. |
| 9 | **Project Command v1 recipe** | EPC differentiator pack #2. |
| 10 | **Eval/telemetry gate (clarify + guards + pack + chart bindings)** | Prevents silent regression while ambition grows. |

**Out of the first 10:** Pulse product, Process, Forecast product, viz studio, eight chart types, CBG-as-pack, full ledger exports, physical DB split (beyond readonly role), alias CRM, multi-tenant semantic marketplace, Collection as a separately marketed second brand. Collection deepens inside Month / ships as pack #3 after #9–10.

---

## 12. Success bar — feel target + director month ask

**Canonical ask:** *“How is July going?”* / *“How is this month going?”* (also: *“Month performance”*, *“Director brief for this month”*).

### Feel target (UX)

1. **Short narrative** — period-explicit, guarded, director-voice (not a wall of tables).  
2. **Exactly three attention items** — Finding-backed; each actionable.  
3. **Buttons** — deep links / “Save report” / follow-ups (e.g. open overdue, open project).  
4. **Follow-up works:** *“Why Tata?”* / *“Why is Tata in attention?”* binds to the party already in dialog — no re-fuzzy, fact-backed why.

### Must return (permission-filtered)

1. Period label explicit (calendar month vs FY — never ambiguous).  
2. Sales + collections for the period (certified metrics).  
3. Receivables / overdue attention (counts + ₹ when allowed).  
4. Bank / today in-out if director dashboard permitted.  
5. Project or CBG highlight Findings (not empty theatre).  
6. Thin system charts when metrics warrant (KPI / trend / ageing only in v1).  
7. Deep links into ERP screens.  
8. Optional **Save report** → immutable downloadable snapshot.

**Must never:** invent ₹, write ERP, soft-fuzzy a money party, present prediction as ledger fact, or open a chart builder.

---

## 13. Quality gates (packs + visuals + reports)

| Gate | Fail if |
|------|---------|
| Pack goldens | Month / Project / Collection canonical asks regress narration or facts |
| Metric contract CI | Certified binding `version` / skill output drift undetected |
| Chart binding gate | Chart rendered for non-certified / wrong periodRule metric |
| Report schema gate | Snapshot contains ledger-scale row dumps or mutable live embeds |
| Isolation gate | Skill path can write ERP; or (once cut over) not using `nova_readonly` |
| Feel-target gate | Month ask returns ≠3 attentions without explicit overflow rule; follow-up *Why Tata…* re-fuzzies |
| RBAC export gate | Download succeeds after permission revoke |

---

## 14. Non-goals (stronger than ChatGPT’s)

NOVA 3.0 will **not**:

1. Become Power BI / Tableau / Looker / Qlik.  
2. Ship free text-to-SQL or LLM-picked tools.  
3. Write operational ERP data (create invoice, approve, post, delete).  
4. Build Celonis-style process mining.  
5. Market seven product brands.  
6. Ship a Forecast *product* (labeled estimates inside packs only).  
7. Store sticky party/₹ memory or embed prior answers as ledger authority.  
8. Build a general dashboard / report designer.  
9. Ship eight chart types on day one (thin 2–3 only with Month pack).  
10. Treat CBG as a fourth named pack.  
11. Copy full ledgers into the report plane.  
12. Replace Tally / director screens — it **summarizes and deep-links**.  
13. Require a separate analytics warehouse in the first year.  
14. Auto-email the company without opt-in Watch.  
15. Treat chat history as source of truth over skills.

---

## 15. Relation to prior tip docs

| Doc | Role after this plan |
|-----|----------------------|
| `NOVA_FINAL_ARCHITECTURE.md` | Remains **canonical runtime flow**; update status line to note DialogState / guards largely live on 2.136.6; point here for 3.0 product strategy. |
| `NOVA_COMMERCIAL_READY_PLAN.md` | Chat readiness P0–P1 largely done; remaining P3–P5 fold into Ships 1–2 and 10. |
| `NOVA_DIALOG_STATE_PLAN.md` | Still the DialogState contract. |
| **This file** | **Product + plane + pack strategy for NOVA 3.0.** |

---

## 16. One-line north star

**NOVA 3.0 = trusted operational brain for project/EPC/CBG SMEs inside emPOWER — private reports on its own plane, pack-smart for directors, thin governed visuals, never a BI suite, never changes the ERP.**
