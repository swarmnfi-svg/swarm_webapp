# NOVA system flowchart (with NOVA Reader)

**Audience:** product + engineering  
**Engine count:** **12** product engines — see [`NOVA_ENGINES_FLOWCHART.md`](./NOVA_ENGINES_FLOWCHART.md) for the named inventory.  
**Sources of truth:** live chat path (`answerNovaQuery` / `NOVA_FLOW.md`), DialogState sticky/clarify, Analysis/Trend skills, Reader ACL + fillable registry + CustomEvent bridge (`nova-reader/*`).

NOVA = **read-only ERP chat** (facts via catalog tools).  
NOVA Reader = **assistive OCR → form prefill** (never posts ledger rows). They share session/platform gates and LLM keys in places, but **Reader does not go through `answerNovaQuery`**.

---

## 1. High-level chat plane

User message → intent/structure → resolve → sticky → tools/skills → Analysis/Trend → reply.

```mermaid
flowchart TD
  UI["User message<br/>NovaAiChat / Bubble"]
  ACT["askNovaAiAction<br/>session · ai.assistant.read · quota"]
  ANS["answerNovaQuery"]

  PEND{"Pending ClarifyAct?"}
  BIND["Bind option by id/code/label<br/>skip fuzzy · resume originalQuery"]
  INF["inferNovaQuery<br/>meta · erp · follow_up · unclear · garbage"]
  SHORT{"Short-circuit?<br/>help · greeting · access · garbage"}
  STRUCT["Query structure / SearchEngine<br/>slots: family · entity · metric · period · depth"]
  THINK{"Low confidence + Think on?"}
  LLM["NovaThink → validate slots"]
  PLAN["buildNovaPlan → finalizeNovaPlan"]
  STICKY{"Sticky / topic switch<br/>keep bind · clear HR · TTL"}
  CLAR{"Clarify needed?<br/>entity · metric · sticky module-only"}
  WRITE{"Write cue?<br/>deny_write / read_only_guard"}
  RBAC["RBAC filter tools"]
  RES["Entity resolve<br/>0 · 1 · many · or bound id"]
  SKILL["runNovaTools → skills"]
  DEPTH{"Depth / cue?"}
  ANAL["nova_analysis skill<br/>Analysis engine"]
  TREND["nova_trend skill<br/>Trend engine"]
  OTHER["Other catalog skills<br/>money · tasks · HR · open-*"]
  FACTS["Fact pack + provenance"]
  NARR["Narrate · answer guards"]
  OUT["NovaAnswer → UI"]

  UI --> ACT --> ANS --> PEND
  PEND -->|yes · match| BIND --> RES
  PEND -->|no / cancel| INF --> SHORT
  SHORT -->|yes| OUT
  SHORT -->|no| STRUCT --> THINK
  THINK -->|yes| LLM --> PLAN
  THINK -->|no| PLAN
  PLAN --> STICKY --> CLAR
  CLAR -->|ask chips| OUT
  CLAR -->|ready| WRITE
  WRITE -->|deny| OUT
  WRITE -->|ok| RBAC --> RES
  RES -->|ambiguous| OUT
  RES -->|ok| SKILL --> DEPTH
  DEPTH -->|analysis| ANAL --> FACTS
  DEPTH -->|trend| TREND --> FACTS
  DEPTH -->|else| OTHER --> FACTS
  FACTS --> NARR --> OUT
```

### Chat-plane notes

- **Rules-first:** `NovaSearchEngine` (+ shared `query-structure`) fill slots; Think only when plan confidence is low.
- **Sticky:** bound party/project can ride short module follow-ups (`pending tasks`, invoices, …). HR families and self/org-wide cues clear the bind. Module-only follow-up with prior hint but **no** bind → clarify (not silent org-wide).
- **ClarifyAct:** reply `"1"` / code / label binds by id — does **not** re-fuzzy the name.
- **Analysis / Trend:** selected as tools (`nova_analysis` / `nova_trend`) from depth cues or lexicon; still read-only skills under RBAC.

---

## 2. Clarify + entity bind loop

```mermaid
flowchart TD
  ASK["Plan / resolve needs choice"]
  PUSH["Push ClarifyAct<br/>options: id · type · code · label<br/>+ originalQuery"]
  UI["Clarify chips / numbered list"]
  REPLY["User reply"]
  MATCH{"Resolver hit?<br/>1 / code / label / deixis"}
  BIND["Bind entityId · type · code<br/>clear pending"]
  SKIP["Skip fuzzy search<br/>use bound id"]
  SKILL["Continue → skills"]
  REASK["Re-ask: pick a number"]
  TOPIC{"Long unmatched / topic switch?"}
  CANCEL["Cancel pending · run new intent"]
  STICKY_KEEP["Later: short module follow-up<br/>keep sticky bind"]
  STICKY_ASK["Module-only + hint · no bind<br/>→ clarify again"]

  ASK --> PUSH --> UI --> REPLY --> MATCH
  MATCH -->|yes| BIND --> SKIP --> SKILL
  MATCH -->|short miss| REASK --> UI
  MATCH -->|no| TOPIC
  TOPIC -->|cancel| CANCEL
  TOPIC -->|continue party| STICKY_KEEP --> SKILL
  STICKY_KEEP -.->|lost bind| STICKY_ASK --> PUSH
```

---

## 3. NOVA Reader plane

Page open → Reader ACL → chat bubble / Assist → form fill / CustomEvent bridge → registry.

```mermaid
flowchart TD
  PAGE["User opens ERP page<br/>or uses chat paperclip"]
  REG["fillable-form-registry<br/>resolveFillableForm pathname"]
  INTENT{"On fillable create/edit?"}
  SEL["selectChatReaderIntent<br/>page intent OR preview"]
  UI_IN["UI entry<br/>NovaReaderAssist · bubble · DocumentSection"]
  ACT["readWithNovaReaderAction"]
  GATES["Feature gates<br/>aiAssistantEnabled · LLM keys<br/>NOVA_READER / INVOICE_OCR kill switch"]
  ACL["assertNovaReaderIntentAccess<br/>create/write per intent<br/>preview = Assist money-doc OR-set"]
  HEAVY["Heavy-job lock + 25 MB allowlist"]
  READ["readDocument<br/>PDF text fast path or vision OCR"]
  MAP["Intent mappers → draft<br/>PB · billing · receipt · PR · expense"]
  PREV["Preview panel<br/>thumbnails + fields + raw text"]

  FILL_PAGE["Page Assist: applyDraft on form"]
  FILL_CHAT{"Chat on fillable route?"}
  CHIPS["Yes / Review / Dismiss chips"]
  BRIDGE["dispatchFillRequest<br/>nova-reader-fill-request"]
  SUB["useNovaReaderFormFill subscriber<br/>formId + intent match"]
  APPLY["Same applyDraft as Assist<br/>editable fields only"]
  OPEN["Off-route: kind-aware Open module chips<br/>navigate → rematerialize → re-prompt"]
  LEDGER["Never create bill / voucher / ledger row"]

  PAGE --> REG --> INTENT
  INTENT -->|yes| SEL
  INTENT -->|no| SEL
  SEL --> UI_IN --> ACT --> GATES --> ACL --> HEAVY --> READ --> MAP --> PREV
  PREV --> FILL_PAGE
  PREV --> FILL_CHAT
  FILL_CHAT -->|yes| CHIPS --> BRIDGE --> SUB --> APPLY
  FILL_CHAT -->|no · preview| OPEN
  FILL_PAGE --> LEDGER
  APPLY --> LEDGER
  OPEN --> PAGE
```

### Reader ACL (accurate)

| Intent | Gate (authoritative in `read-action`) |
|--------|----------------------------------------|
| `purchase_bill` | `purchasebill.create` |
| `receipt` | `receipt.create` |
| `payment_request` | `paymentrequest.create` |
| `sales_invoice` | `invoice.create` |
| `sales_order` | `salesorder.write` |
| `purchase_order` | `purchaseorder.create` |
| `manual_expense` | accounts dashboard + ADMIN/ACCOUNTANT/SUPER_ADMIN |
| `preview` (chat off fillable page) | **same OR-set as Assist money-doc creates** — not bare `*.read` (Staff money-hide / POL-1) |

Registry `permissionHint` is **UX only**; server `assertNovaReaderIntentAccess` is source of truth.

### Fillable registry + bridge

| Piece | Role |
|-------|------|
| `fillable-form-registry.ts` | Path → `formId` / intent / title / href; `selectChatReaderIntent`; Open-module suggestions by document kind |
| `form-fill-bridge.ts` | In-memory subscriber Map + `nova-reader-fill-request` / `…-result` CustomEvents; retries for mount races; **no sessionStorage drafts** |
| `useNovaReaderFormFill` | Form registers `applyDraft` for matching `formId` + intent |

---

## 4. How Reader relates to main chat

```mermaid
flowchart LR
  subgraph shared["Shared (platform)"]
    PLAT["PlatformSettings.aiAssistantEnabled"]
    LLMK["LLM / vision keys"]
    SESS["Signed-in session"]
  end

  subgraph chat["Main chat plane — answerNovaQuery"]
    DST["DialogState · sticky · ClarifyAct"]
    SE["SearchEngine · Think · plan"]
    TOOLS["Catalog skills · Analysis · Trend"]
    RBAC["ai.assistant.read + tool RBAC"]
    REPLY["Narrated ERP answer"]
  end

  subgraph reader["Reader plane — readWithNovaReaderAction"]
    OCR["readDocument OCR/LLM extract"]
    IACL["Intent ACL create/write"]
    DRAFT["Mapped drafts + preview"]
    FILL["Page-local applyDraft / bridge"]
  end

  shared --> chat
  shared --> reader
  chat -.->|paperclip uses Reader<br/>not answerNovaQuery| reader
  reader -.->|does not feed sticky<br/>or Analysis/Trend| chat
```

| Concern | Main chat | NOVA Reader |
|---------|-----------|-------------|
| Orchestrator | `answerNovaQuery` | `readWithNovaReaderAction` → `readDocument` |
| Goal | Answer questions with facts | Prefill editable forms / show preview |
| Writes | Forbidden (deny_write) | Forbidden (assistive drafts only) |
| Entity memory | DialogState sticky + ClarifyAct | Page-local draft match (vendor/customer lists for mapping) |
| Analysis / Trend | Skills in chat plane | Not used |
| UI | Chat / bubble text | Assist strip, preview panel, bubble CamScanner, fill chips |
| Cross-wire | Bubble paperclip → Reader | Bridge → form `applyDraft` on same tab |

---

## 5. Legend (boxes)

| Box / node | Meaning |
|------------|---------|
| **askNovaAiAction** | Chat entry: session, `ai.assistant.read`, quota before answer. |
| **answerNovaQuery** | Main chat orchestrator (not Reader). |
| **ClarifyAct** | Pending numbered/code choice; bind-by-id, no re-fuzzy. |
| **Query structure / SearchEngine** | Deterministic slots (family, entity, metric, period, depth). |
| **Sticky** | Keep bound entity across short module follow-ups; clear on HR / org-wide / TTL. |
| **nova_analysis / nova_trend** | Read-only depth skills after plan/RBAC/resolve. |
| **fillable-form-registry** | Client path → fill intent for bubble + Open-module chips. |
| **assertNovaReaderIntentAccess** | Server ACL: create/write per intent; preview = Assist OR-set. |
| **readDocument** | Shared OCR pipeline (PDF text fast path or vision). |
| **dispatchFillRequest** | Chat → live form subscriber (CustomEvent + Map). |
| **applyDraft** | Set form fields only; user still saves in ERP. |

---

## Related docs

- [`NOVA_ENGINES_FLOWCHART.md`](./NOVA_ENGINES_FLOWCHART.md) — **12 engines** inventory + compact mermaid  
- [`NOVA_FLOW.md`](./NOVA_FLOW.md) — live chat request sketch  
- [`NOVA_FINAL_ARCHITECTURE.md`](./NOVA_FINAL_ARCHITECTURE.md) — commercial-ready hybrid target  
- [`../nova-reader/NOVA_READER_ARCHITECTURE.md`](../nova-reader/NOVA_READER_ARCHITECTURE.md) — Reader pipeline, surfaces, limits  
