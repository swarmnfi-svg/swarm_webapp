# NOVA commercial AI-chat readiness plan

**Purpose:** Critique ChatGPT’s seven corrections against emPOWER’s invariants, fold in DialogState work, and roadmap to commercial-quality chat — **without** becoming ChatGPT-with-a-database.

**Canonical architecture:** [`NOVA_FINAL_ARCHITECTURE.md`](./NOVA_FINAL_ARCHITECTURE.md)  
**DialogState detail:** [`NOVA_DIALOG_STATE_PLAN.md`](./NOVA_DIALOG_STATE_PLAN.md)  
**Live flow sketch:** [`NOVA_FLOW.md`](./NOVA_FLOW.md)

**Baseline:** tip / live **~2.136.3+**. Ship A stash (`ship-a-security-acl-park-for-nova`) stays parked.

---

## Explicit product stance

| Do | Do not |
|----|--------|
| Rules-first slots + catalog tools only | Free LLM tool picking |
| Prisma skills under `can(...)` | Free SQL / ad-hoc query generation |
| Read-only + dual write guards | Silent or conversational writes |
| DialogState bind-by-id for `"1"` | Re-fuzzy display names after clarify |
| Session memory T0–T2 (acts, slots, redacted turns) | NovaMind / sticky party / ₹ RAG memory |
| Optional light prefs later | Behavioral profiling across sessions |

**Privacy:** Dialog state stores ids/labels already shown — never invoice lists or salary. Resume re-checks RBAC. Retention ≤ conversation memory; sensitive tools shorter.

---

## Verdict on ChatGPT’s seven items

| # | Proposal | Verdict | Why |
|---|----------|---------|-----|
| 1 | Rules-first; Think only when low confidence | **ACCEPT** | Already the tip behavior; flow/architecture docs now say so explicitly. Do not invert to Think-first. |
| 2 | Early write-deny preflight + post-plan guard | **ACCEPT_MODIFIED** | Keep SearchEngine `deny_write` + `read_only_guard`; add an explicit dual-checkpoint API so both always run in order (preflight before plan commit, guard after plan). No third LLM “write classifier.” |
| 3 | Post-narration answer guards (money/count/identity/period) | **ACCEPT_MODIFIED** | Money/identity helpers already exist on the LLM path. Formalize a single **answer guard** stage after narration for all paths (incl. deterministic). Do not re-ask the LLM to “fix” itself. |
| 4 | Bounded recipes in execution registry | **ACCEPT_MODIFIED** | Partially exists (`recipeMatchesQuery`, collection attention, etc.). Polish coverage/docs; do not grow into an open-ended planner. |
| 5 | NovaFinding between facts and narration | **ACCEPT_MODIFIED** | Finding v1 + Phase G prediction exist. Widen use for multi-fact packs; never invent Finding without evidence. |
| 6 | Tighten entity resolution (no soft fuzzy on money/sensitive) | **ACCEPT** | Ambiguous money asks must clarify; bound ClarifyAct skips fuzzy entirely. Soft contains only for non-money / low-risk when product already allows. |
| 7 | Expand slot validation (family/metric/entity combos) | **DEFER** (P3) | Current `validateNovaSearchSlots` is necessary but incomplete. Expand as a matrix after DialogState + write/answer guards — high leverage but not the `"1"` loop. |

**Rejected / over-scoped**

| Idea | Verdict | Why |
|------|---------|-----|
| NovaReplySense as the continued-conversation engine | **REJECT** | Too broad; DialogState + ClarifyResolver are the precise names. |
| NovaMind long-term behavioral memory | **REJECT** (defer forever unless re-specified) | Sticky party / money bleed / privacy risk. Optional **NovaUserPrefs** only (verbosity, period grain) — explicit, editable, non-monetary. |
| Embedding prior ₹ answers as RAG memory | **REJECT** | Ledger authority stays in tools. |
| Blind ChatGPT agent with ERP credentials | **REJECT** | Violates every NOVA invariant. |

---

## Target end-state flow

See the full mermaid in [`NOVA_FINAL_ARCHITECTURE.md`](./NOVA_FINAL_ARCHITECTURE.md). Summary path:

`UI → gates → load DialogState → pending ClarifyResolver? → infer → short-circuit → follow-up → rules-first slots → (Think iff low confidence) → validate → plan → slot checks → clarify/recipe → dual write guards → RBAC → entity (bound or permission-aware) → skills → facts → Finding → narrate → answer guards → UI → persist T0–T2`

---

## Gap vs tip 2.136.x

| Capability | Exists on tip | Missing / weak |
|------------|---------------|----------------|
| SearchEngine + gated Think | Yes | Doc alignment only |
| `read_only_guard` / deny_write family | Yes | Explicit dual ordered preflight |
| Recipes + Finding v1 | Partial | Broader Finding; recipe polish |
| Clarify cards + prose parse | Yes | **Structured ClarifyAct + bind-by-id** |
| `"1"` after customer↔project clash | Broken loop | DialogState + skip fuzzy (**P0**) |
| Client history when `conversationId` set | Hole | Always send client prior |
| Answer money/identity checks | Partial on LLM path | Formal post-narration stage |
| Slot combo validation | Basic | Expanded matrix (**P3**) |
| Telemetry / eval goldens for dialog | Sparse | P5 |

---

## Ship roadmap

### P0 — DialogState (this ship)

**Ship:** `NovaDialogState` + `NovaClarifyResolver`; persist `NovaConversation.dialogState`; history fallback; skip re-fuzzy when bound; Tata goldens.

**Acceptance**

- [ ] Tata Steels clarify → `1` → customer C0014, **no** second Did-you-mean; resumes original intent (e.g. projects)
- [ ] `2` → project bind; no re-clarify
- [ ] `conversationId` + empty server history → client prior still resolves `1`
- [ ] Topic switch (`leave balance`) cancels pending
- [ ] OOB `9` / ambiguous `yes` → soft re-ask, no fuzzy `"9"`
- [ ] Existing Acme `1` → sales golden still passes
- [ ] Ship A stash untouched

### P1 — Write preflight + answer guard

**Ship:** Ordered dual write checkpoints; single `guardNovaAnswer(facts, text)` for money/count/identity/period.

**Acceptance**

- [ ] Create/approve/delete phrasing denied before tools and after plan
- [ ] Narrated ₹ / counts must match fact pack or fall back to deterministic
- [ ] Subject identity (self vs other) cannot swap in narration

### P2 — Entity sensitive policy

**Ship:** No soft fuzzy for money/sensitive when multi-match; prefer clarify; aliases remain confirmed-only.

**Acceptance**

- [ ] Ambiguous party + sales → clarify, never silent pick
- [ ] Bound id path never calls `contains` name search

### P3 — Slot validation expand

**Ship:** Family/metric/entity combo matrix in validate / plan finalize.

**Acceptance**

- [ ] Invalid combos clarify or downgrade; Think cannot invent illegal pairs

### P4 — Recipe registry polish

**Ship:** Documented recipes, tests, no open planner creep.

**Acceptance**

- [ ] Phrase → fixed skill id; unknown phrases fall through to plan, not invent

### P5 — Telemetry / evals

**Ship:** Dialog + guard goldens in catalog; clarify-loop regression suite; light dashboards on `toolsUsed` (`clarify_bound`, `clarify_reask`, `read_only_guard`).

**Acceptance**

- [ ] CI fails if Tata-style loop returns
- [ ] Eval catalog ids for dialog + answer guard

---

## Memory tiers (session only)

| Tier | Store | ERP-safe contents |
|------|--------|-------------------|
| T0 | `dialogState` pending act | Options ids/labels, resume query — no ₹ |
| T1 | Bound slots on dialogState | entityId/type/code |
| T2 | `NovaMessage` redacted | Prose UX; not sole clarify truth |
| T3 | NovaUserPrefs (later) | Verbosity / default grain — never party totals |
| T4 | ERP via skills | Authoritative facts |

---

## References

- Architecture: `NOVA_FINAL_ARCHITECTURE.md`
- Dialog plan: `NOVA_DIALOG_STATE_PLAN.md`
- Flow sketch: `NOVA_FLOW.md`
