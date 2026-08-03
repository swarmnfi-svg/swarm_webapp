# NOVA request flow

**Canonical final proposal:** [`NOVA_FINAL_ARCHITECTURE.md`](./NOVA_FINAL_ARCHITECTURE.md) (commercial-ready hybrid target + full mermaid).

This file is the **live / tip sketch** (~2.136.x): understand → plan → RBAC → resolve → skills → narrate. It stays aligned with the approved hybrid (rules-first, Think only when low confidence). For DialogState, dual write guards, Finding, and answer guards as an end-state, use the architecture doc.

Read-only ERP assistant: understand the question into slots (NovaThink and/or NovaSearchEngine), plan tools, enforce RBAC, resolve entities, run skills for facts, then narrate — never free SQL or writes.

```mermaid
flowchart TD
  UI["User / NovaAiChat · NovaAiBubble"]
  ACT["askNovaAiAction<br/>gates: session · ai.assistant.read · quota"]
  ANS["answerNovaQuery"]
  DS["NovaDialogState<br/>pending ClarifyAct first"]
  INF["inferNovaQuery<br/>meta · erp · follow_up · unclear · garbage"]
  SHORT{"Short-circuit?<br/>help · greeting · access · company · garbage"}
  FU["resolveNovaFollowUp<br/>slot merge when allowed"]

  RULES["NovaSearchEngine rules<br/>runNovaSearchEngine"]
  LOW{"Confidence low<br/>+ Think gated?"}
  LLM_THINK["NovaThink LLM<br/>emit NovaSearchSlots JSON"]
  VAL{"validateNovaSearchSlots<br/>catalog tools only · drop invents"}
  SLOTS["NovaSearchSlots<br/>family · entity · metric · period · tools[]"]

  PLAN["buildNovaPlan → finalizeNovaPlan<br/>SearchEngine decisive → else composeNovaIntent"]
  CLARIFY{"shouldClarifyNovaPlan<br/>or unclear / incomplete?"}
  WRITE{"Write / mutate cue?<br/>queryFamily deny_write<br/>or read_only_guard"}
  RBAC{"RBAC<br/>hard deny · soft deny<br/>filterNovaToolsForUser"}
  RESOLVE{"Entity / person resolve<br/>0 · 1 · many · or bound id"}
  SKILL["runNovaTools → dispatchNovaSkill<br/>Prisma under can(...)"]
  FACTS["Fact pack + links + provenance"]
  NARR{"Narrate<br/>LLM summarize facts only<br/>or formatFactsDeterministic"}
  OUT["NovaAnswer → UI"]
  UNMATCH["Unmatched / lexicon stub<br/>or catalog_suggest / unmatched_review"]
  CLARIFY_UI["Clarify response<br/>chips + push ClarifyAct"]
  DENY_WRITE["Write-deny answer<br/>use ERP screens"]
  DENY_RBAC["rbac_deny / rbac_soft_deny"]

  UI --> ACT --> ANS --> DS
  DS -->|pending match| RESOLVE
  DS -->|no / cancelled| INF --> SHORT
  SHORT -->|yes| OUT
  SHORT -->|no| FU --> RULES --> SLOTS
  RULES --> LOW
  LOW -->|yes| LLM_THINK --> VAL
  VAL -->|valid high / tools| SLOTS
  VAL -->|invalid / fail| RULES
  LOW -->|no| SLOTS

  SLOTS --> PLAN
  PLAN --> CLARIFY
  CLARIFY -->|clarify| CLARIFY_UI --> OUT
  CLARIFY -->|stub / unmatched topic| UNMATCH --> OUT
  CLARIFY -->|ready| WRITE

  WRITE -->|deny| DENY_WRITE --> OUT
  WRITE -->|ok| RBAC
  RBAC -->|denied| DENY_RBAC --> OUT
  RBAC -->|allowed tools| RESOLVE

  RESOLVE -->|many / none ambiguous| CLARIFY_UI
  RESOLVE -->|exact / bound / soft filter| SKILL --> FACTS --> NARR --> OUT
  OUT --> UI
```

## Legend

| Box | Role |
|-----|------|
| **User / NovaAiChat · NovaAiBubble** | Chat UI entry; calls the server action, not a free `/api/nova` route. |
| **askNovaAiAction** | Session, platform flag, `ai.assistant.read`, daily quota / concurrency before answering. |
| **answerNovaQuery** | Main orchestrator in `src/lib/ai/nova.ts`. |
| **NovaDialogState** | Pending clarify acts; `"1"` binds by id before re-fuzzy (see architecture doc). |
| **inferNovaQuery** | Classifies meta vs ERP vs follow-up vs unclear vs garbage before planning. |
| **Short-circuit** | Help, greeting, access map, company knowledge, garbage — return without tools. |
| **resolveNovaFollowUp** | Merges underspecified follow-ups onto prior plan slots (no ₹ copy from history). |
| **NovaThink** | Optional gated LLM understand layer (`nova-think.ts`); **only when plan confidence is low**; same slot schema as SearchEngine; read-only. |
| **validateNovaSearchSlots** | Coerces Think (or any candidate) to safe slots: allowed families, registered tool ids only, strips write-shaped tools. |
| **NovaSearchEngine** | Deterministic rules **first** (`nova-search-engine.ts`): search / status / resolve / deny_write / money cues → slots. |
| **NovaSearchSlots** | Shared understand output: `queryFamily`, entity hint/type, metric, period, `tools[]`, confidence. |
| **buildNovaPlan → finalizeNovaPlan** | Single plan gate: decisive SearchEngine tools win; else lexicon/intent compose; period defaults only when ready. |
| **shouldClarifyNovaPlan / unclear** | Prefer ask-over-guess when metric/period/entity incomplete; clarify chips in UI. |
| **Unmatched / lexicon stub** | Topic recognized but no wired tools — stub message or catalog suggest / unmatched review, not a fake skill. |
| **Write-deny** | Create/update/delete/approve cues → `deny_write` / `read_only_guard`; NOVA never mutates. |
| **RBAC** | Hard deny (confidential), soft deny (matched tools all filtered), plus per-tool `novaCanRunTool`. |
| **Entity / person resolve** | Disambiguate parties/staff before money/HR tools; many matches → clarify; bound ClarifyAct id skips fuzzy. |
| **runNovaTools → skill** | Dispatch registered skill handlers; Prisma reads only; handler `can(...)` defense-in-depth. |
| **Fact pack** | Structured facts + links + provenance for narration. |
| **Narrate** | LLM may only summarize retrieved facts (or deterministic formatter / `preferDeterministic` skills). |
| **NovaAnswer → UI** | Answer text, links, `toolsUsed`, optional clarify chips; logged / memory appended after return. |

**Design notes**

- **Rules-first:** SearchEngine feeds `buildNovaPlan` on every plan; Think (`understandNovaQuery`) only when plan confidence is low (and gated on). Rules always backstop invalid/off Think.
- Full commercial target (Finding, answer guards, dual write preflight, DialogState): **`NOVA_FINAL_ARCHITECTURE.md`**.
- Branches that leave the happy path: **write-deny**, **RBAC deny**, **clarify**, **unmatched/stub**.
