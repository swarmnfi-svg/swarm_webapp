# Collection Attention — Sprint 6 HANDOFF

**Branch:** `nova-3-sprint6-prep` only  
**Status:** PREP (contract + stub + goldens) — **not** merge-ready to `main`  
**Plan:** [`NOVA_3_0_PLAN.md`](../NOVA_3_0_PLAN.md) §9 pack #3 · Phase 5 · Collection deepen

---

## Dependency gate (blocking)

| Depends on | Why | Gate |
|------------|-----|------|
| **Sprint 3 — report plane live** | Collection answers must be saveable as immutable `NovaReport` snapshots (pack → envelope → bucket → download ACL re-check). Without a health-matched report plane, shipping the pack creates answers directors cannot forward safely. | **REQUIRED** — do **not** push/merge this branch to `main` until the **deployer confirms Sprint 3 is health-matched** (save + download + regenerate + RBAC 403 path green on the live version). |
| **Sprint 4 — certified metrics** | Pack metric refs (`COLLECTION_ATTENTION_METRIC_IDS`) need draft→certified badges and CI drift checks for the collection set (receivables, ageing, concentration, receipt trend, unallocated, priorities). Shared ids with Month (`receipts.period_collected`, `ar.overdue_invoice_count`, `ar.customer_outstanding`, …). | **REQUIRED** — merge only after Sprint 4 is live (or steward-certified for the Collection metric set). Implement against dictionary + draft refs now. |
| **Sprint 5 — Project Command** | Project-aware Collection (“collection attention for this project”) benefits from Project Command DialogState / spine, but Collection is pack #3 by name and already has a recipe. | **OPTIONAL parallel after Sprint 3** — Sprint 5 may proceed in parallel once Sprint 3 is live; **do not block** Collection PREP work on Sprint 5 merge. Still **do not** merge Collection to `main` before Sprint 3+4. |

**Hard rule for integrators / parent agents:** stay on `nova-3-sprint6-prep`. No `git push` to `main`, no Railway, no version bump from this prep. Merge only after Sprint **3 + 4** are live (Sprint 5 optional parallel after 3).

---

## Pack contract (frozen in PREP)

| Field | Value |
|-------|--------|
| **Pack id** | `collection_attention` (`NovaPackId` + recipe id) |
| **Prep module** | `src/lib/nova/packs/collection-attention-prep.ts` |
| **Live runner (baseline on tip)** | `src/lib/nova/packs/collection-attention.ts` — recipe deepen exists; wire metrics + finding shapes below |
| **Stub builder** | `buildCollectionAttentionPackStub()` → `NovaPackResult` (no skill dispatch, no invented facts) |
| **Signature ask** | *“collection attention for {party}”* |
| **Attentions** | ≤ `NOVA_MONTH_ATTENTION_PRIMARY_MAX` (3) primary via `selectCollectionAttentions` / `selectNovaPackAttentions`; `overflowCount` for the rest; **empty** if nothing material (no theatre) |

### Questions (routing / examples)

See `COLLECTION_ATTENTION_QUESTIONS` — signature, aliases, project-aware, ageing/concentration, unallocated/priorities.

### Metrics list (draft)

See `COLLECTION_ATTENTION_METRIC_IDS`:

| Family | Metric id(s) |
|--------|----------------|
| **Receivables** | `ar.receivables_open`, `ar.customer_outstanding` |
| **Ageing** | `ar.overdue_invoice_count`, `ar.ageing_buckets` |
| **Concentration** | `ar.concentration_top` |
| **Receipt trend** | `receipts.period_collected`, `receipts.period_trend` |
| **Unallocated** | `ar.unallocated_advances` |
| **Priorities** | `ar.collection_priorities` |

Stub emits these as `certification: "draft"`, `value: null`. Live pack must fill from catalog skill facts only. New ids (`ar.ageing_buckets`, `ar.concentration_top`, `receipts.period_trend`, `ar.unallocated_advances`, `ar.collection_priorities`) need Sprint 4 dictionary + skill deepen before certification.

### Finding shapes

See `COLLECTION_ATTENTION_FINDING_SHAPES`:

| Shape id | Chapter | Material? | Notes |
|----------|---------|-----------|--------|
| `party_resolve_gap` | Resolve | yes | Clarify / refuse inventing risk scores |
| `receivables_open` | Receivables | no | Open AR summary |
| `ageing_buckets` | Ageing | no | Bucketed AR from reports/receivables |
| `overdue_material` | Overdue | yes | Attention candidate |
| `concentration_top` | Concentration | yes | Top-party share — supported_inference only |
| `receipt_trend` | Receipts | no | Period collected + trend label |
| `unallocated_advances` | Unallocated | yes | Advances on account |
| `collection_priorities` | Priorities | yes | Ranked follow-ups (feeds ≤3 + overflow) |
| `no_material_attention` | Quiet | no | Explicit empty — no theatre |

### Chapters / tools

`COLLECTION_ATTENTION_CHAPTER_TOOLS` — catalog-only fan-out (`customer_outstanding`, `receivables_summary`, `overdue_invoices`, `receipts_summary`, `reports_snapshot`). Tip recipe is still the 3-tool core; deepen toward this list at implement time.

### Chart bindings (thin)

- `ageing_or_attention` ← ageing buckets + priority attentions  
- `period_trend` ← receipt trend  

No concentration chart type day one (plan: concentration after metric certification + eval gates). No dashboard builder.

---

## Goldens

`COLLECTION_ATTENTION_GOLDENS` in the prep module — party/project/portfolio queries for SearchEngine / recipe routing evals (signature, aliases, project-aware, ageing/concentration, unallocated/priorities, Month chapter stays Month, ambiguous → clarify, no risk-score theatre).

Wire into CI when Sprint 6 implementer lands; do not claim green until Sprint 3 report save path can round-trip a Collection Attention `NovaPackResult` and Sprint 4 can drift-check the collection metric set.

---

## Overflow rule (frozen)

```
materialFindings → selectNovaPackAttentions(material, 3)
  primary.length ≤ 3
  overflowCount = max(0, material.length − 3)
  nothing material → primary [] + overflowCount 0
```

Feel-target gate: never invent a 4th primary attention; never pad empty attentions.

---

## Implementer checklist (post–Sprint 3+4 live)

1. Confirm deployer: Sprint 3 `/api/health` version matches report plane (save, download ACL, regenerate = new id).
2. Confirm Sprint 4: collection metric set in dictionary with draft→certified path + CI drift checks.
3. Expand live `collection-attention.ts` metrics to `COLLECTION_ATTENTION_METRIC_IDS`; fill from skill facts only.
4. Map facts → Finding shapes only; never invent ₹ or payment risk scores.
5. Ensure “Save report” from a Collection answer uses the same report plane as Month / Project Command.
6. Add goldens to CI; keep Collection as Month chapter **and** named pack #3.
7. Project-aware asks: reuse DialogState project slot (Sprint 5 optional — do not invent EPC theatre).

---

## Explicit non-goals (this PREP)

- No version bump, no Railway, no push/merge to `main`
- No payment risk score / Forecast product branding
- No dashboard builder / free viz / concentration chart type before certification
- No ERP writes — pack is read-only catalog skills only
- No blocking on Sprint 5 merge (optional parallel after Sprint 3)

---

## Files in this PREP commit

- `src/lib/nova/packs/collection-attention-prep.ts` — id, questions, metrics, finding shapes, goldens, stub, attention helper
- `src/lib/nova/packs/COLLECTION_ATTENTION_HANDOFF.md` — this document
- `src/lib/nova/packs/packs.test.ts` — stub + contract + overflow smoke

Baseline `collection-attention.ts` on tip may already deepen the recipe; treat PREP as the **contract authority** until implementer aligns metrics/findings to shapes above **after** Sprint 3+4 gate.
