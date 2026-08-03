# NOVA engines inventory + flowchart

**Audience:** product + engineering  
**Verdict:** NOVA has **12 engines / planes** (product vocabulary).  
**Sources:** live chat (`answerNovaQuery`), SearchEngine / query-structure, lexicon/intent, DialogState, entity resolve, skills registry, Analysis / Trend, packs, presentation polish, Reader (`readWithNovaReaderAction`).

**Status note (2026-07-14):** QI **person-task** regression (`aalok tasks` → person_fallback vs false party bind) is being recovered on a **sibling tip** — treat party-module / `acceptsPartyEntitySpan` wording in this doc as target behavior; prefer the recovery tip over further docs polish until that tip lands.

NOVA chat = **read-only ERP Q&A** (facts via catalog tools).  
NOVA Reader = **assistive OCR → form prefill** (never posts ledger rows). Shared session/platform gates; Reader does **not** go through `answerNovaQuery`.

---

## Exact count: **12 engines**  
*(unchanged — QI gate is a Search Engine sub-rule, not a 13th engine)*

| # | Engine (product name) | What it does | Primary code |
|---|----------------------|--------------|--------------|
| 1 | **Search Engine** | Rules-first slot fill: family · entity · metric · period · depth · deny_write | `nova-search-engine.ts` + `query-structure/*` |
| 2 | **Intent & Lexicon** | Topic synonyms → canonical tools when SearchEngine is not decisive | `nova-lexicon.ts`, `composeNovaIntent` / `nova-plan.ts` |
| 3 | **Think** | Gated LLM slot polish **only when plan confidence is low** | `nova-think.ts` |
| 4 | **Dialog / Sticky** | Session DST: bound party/project across short module follow-ups; TTL / HR / org-wide clear | `dialog-state.ts` |
| 5 | **Clarify** | Ask-over-guess chips; `"1"` / code / label binds by id (no re-fuzzy) | `nova-clarify.ts`, ClarifyAct in DialogState |
| 6 | **Entity Resolve** | Permission-aware party / staff / project disambiguation (0 · 1 · many · bound id) | `nova-tools.ts` (`resolveNovaEntityHint`) |
| 7 | **Skills Catalog** | Registered read-only ERP skills + RBAC dispatch | `skills/registry.ts`, `runNovaTools` |
| 8 | **Packs** | Multi-metric business chapters (Month, Collection, Project Command, …) | `packs/*`, recipes → pack skills |
| 9 | **Analysis Engine** | “Why is it here?” — factor pack + ranked drivers (+ optional LLM) | `analysis/engine.ts` · skill `nova_analysis` |
| 10 | **Trend Engine** | “Who/what over time?” — windowed series + rankings | `trend/engine.ts` · skill `nova_trend` |
| 11 | **Present / Narrate** | Deterministic format + guarded LLM polish + answer guards | `nova-format.ts`, `presentation/*` |
| 12 | **Reader Engine** | OCR / vision → mapped drafts → form prefill / preview (separate plane) | `nova-reader/*` · `readWithNovaReaderAction` |

### Technical modules (not counted as separate product engines)

| Module | Role | Bundled under |
|--------|------|---------------|
| `query-structure/*` | Shared normalize / depth / gates / entity-module parse | **Search Engine** |
| **QI gate (party/project only)** | Leading `{entity} {module}` / scoped tasks bind **only** when `acceptsPartyEntitySpan` — person-shaped (`aalok tasks`) → person_fallback, never silent org bind | **Search Engine** (sub-box) |
| `inferNovaQuery` + short-circuits | Meta / help / greeting / garbage before plan | Gate before engines 1–3 |
| `buildNovaPlan` / `finalizeNovaPlan` | Single plan gate (SearchEngine vs lexicon/Think) | Bridges 1–3 → 5–7 |
| Write guards + tool RBAC | `deny_write` / `read_only_guard` / `filterNovaToolsForUser` | Control before 6–7 |
| `recipes/*` | Bounded phrase → fixed skill / pack | **Packs** / Skills |
| `semantic/*` (ontology, aliases) | Typed entity vocabulary for resolve | **Entity Resolve** |
| Report plane (`reports/*`) | Immutable `NovaReport` snapshots of pack answers | Satellite of **Packs** |
| Memory / history | Redacted turns; not authority over ledger | Supports **Dialog / Sticky** |
| Finding / answer guards | Post-facts structure + digit/money/identity checks | **Present / Narrate** |

---

## Compact overview (all 12)

```mermaid
flowchart TB
  subgraph entry["Entry"]
    UI["User · Chat / Bubble"]
    ACT["askNovaAiAction"]
    ANS["answerNovaQuery"]
  end

  subgraph understand["Understand · 1–3"]
    SE["1 Search Engine<br/>+ query-structure"]
    QI["QI gate<br/>party/project only"]
    LEX["2 Intent & Lexicon"]
    THINK["3 Think<br/>low conf only"]
  end

  subgraph control["Control · 4–6"]
    STICKY["4 Dialog / Sticky"]
    CLAR["5 Clarify"]
    ENT["6 Entity Resolve"]
  end

  subgraph execute["Execute · 7–10"]
    SKILLS["7 Skills Catalog"]
    PACKS["8 Packs"]
    ANAL["9 Analysis Engine"]
    TREND["10 Trend Engine"]
  end

  subgraph present["Present · 11"]
    NARR["11 Present / Narrate"]
  end

  subgraph reader["Separate plane · 12"]
    RDR["12 Reader Engine"]
  end

  UI --> ACT --> ANS
  ANS --> STICKY
  STICKY -->|pending clarify reply| CLAR --> ENT
  STICKY -->|new / cancel| SE
  SE --> QI --> LEX
  SE -->|low confidence| THINK --> LEX
  LEX --> CLAR
  CLAR -->|ask chips| UI
  CLAR -->|ready| ENT
  ENT -->|ambiguous| CLAR
  ENT -->|ok| SKILLS
  SKILLS --> PACKS
  SKILLS --> ANAL
  SKILLS --> TREND
  PACKS --> NARR
  ANAL --> NARR
  TREND --> NARR
  SKILLS --> NARR
  NARR --> UI
  UI -.->|paperclip · not answerNovaQuery| RDR
```

---

## Chat plane detail (engines 1–11)

```mermaid
flowchart TD
  UI["User message"]
  ACT["askNovaAiAction"]
  ANS["answerNovaQuery"]
  PEND{"Pending ClarifyAct?"}
  BIND["5 Clarify · bind by id"]
  INF["inferNovaQuery · short-circuit?"]
  SE["1 Search Engine"]
  THINK{"Low conf + Think on?"}
  LLM["3 Think → validate slots"]
  PLAN["Plan gate · 2 Lexicon if needed"]
  STICKY["4 Dialog / Sticky"]
  CLAR{"5 Clarify needed?"}
  WRITE{"Write cue? deny"}
  RBAC["RBAC filter tools"]
  RES["6 Entity Resolve"]
  SKILL["7 Skills Catalog"]
  DEPTH{"Depth / cue?"}
  ANAL["9 Analysis"]
  TREND["10 Trend"]
  PACK["8 Packs / other skills"]
  FACTS["Fact pack + provenance"]
  NARR["11 Present / Narrate"]
  OUT["NovaAnswer → UI"]

  UI --> ACT --> ANS --> PEND
  PEND -->|yes · match| BIND --> RES
  PEND -->|no / cancel| INF
  INF -->|short-circuit| OUT
  INF -->|ERP| SE --> THINK
  THINK -->|yes| LLM --> PLAN
  THINK -->|no| PLAN
  PLAN --> STICKY --> CLAR
  CLAR -->|ask| OUT
  CLAR -->|ready| WRITE
  WRITE -->|deny| OUT
  WRITE -->|ok| RBAC --> RES
  RES -->|ambiguous| OUT
  RES -->|ok| SKILL --> DEPTH
  DEPTH -->|analysis| ANAL --> FACTS
  DEPTH -->|trend| TREND --> FACTS
  DEPTH -->|pack / else| PACK --> FACTS
  FACTS --> NARR --> OUT
```

---

## Reader plane (engine 12)

```mermaid
flowchart TD
  PAGE["Page / chat paperclip"]
  REG["fillable-form-registry"]
  ACT["readWithNovaReaderAction"]
  ACL["Intent ACL create/write"]
  READ["readDocument OCR / vision"]
  MAP["Intent mappers → draft"]
  PREV["Preview panel"]
  FILL["applyDraft / CustomEvent bridge"]
  LEDGER["Never create ledger rows"]

  PAGE --> REG --> ACT --> ACL --> READ --> MAP --> PREV --> FILL --> LEDGER
```

Reader shares platform LLM keys and session gates with chat, but **does not** feed Sticky, Analysis, or Trend.

---

## Related docs

- [`NOVA_FLOWCHART_WITH_READER.md`](./NOVA_FLOWCHART_WITH_READER.md) — chat + Reader sequence diagrams  
- [`NOVA_FLOW.md`](./NOVA_FLOW.md) — live request sketch  
- [`NOVA_FINAL_ARCHITECTURE.md`](./NOVA_FINAL_ARCHITECTURE.md) — commercial hybrid target  
- [`NOVA_ANALYSIS_ENGINE.md`](./NOVA_ANALYSIS_ENGINE.md) · [`NOVA_TREND_PLAN.md`](./NOVA_TREND_PLAN.md)  
- [`../nova-reader/NOVA_READER_ARCHITECTURE.md`](../nova-reader/NOVA_READER_ARCHITECTURE.md)
