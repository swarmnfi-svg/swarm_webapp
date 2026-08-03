# Customer chapter (Collection Attention) — PREP HANDOFF

**Branch:** `nova-tasks-customer-prep` only  
**Status:** PREP (chapter notes + shapes + goldens) — **not** merge-ready to `main`  
**Pack id:** stays `collection_attention` (no new named pack)

---

## Dependency gate (blocking)

| Depends on | Why | Gate |
|------------|-----|------|
| **Presentation polish live** | Customer / Collection narration should use polished money formatters where applicable. | **REQUIRED** — do **not** merge until the **sole deployer confirms health-match** on the live version that includes presentation polish, then pulls this prep. |
| **Collection Attention pack #3** | Customer chapter is an **inner deepen** of Collection — never a fourth pack. | REQUIRED (on tip). |
| **Save / give report follow-up** | Collection Save report must include `customers_summary` in `permissionsUsed` when the chapter ran. | REQUIRED (on tip). |
| **Certified AR / customer metrics** | New draft `customers.active_count` / `customers.total_count`; reuse `ar.customer_outstanding`. | IDEAL. |

**Hard rule:** No `git push` to `main`, no Railway, **no version bump** from this prep.

---

## Ship options (frozen)

| Option | When | Save report |
|--------|------|-------------|
| **`collection_chapter` only** | Add customer-master context beside Collection money chapters | Same Collection pack id — no new Save surface |

**Do not** invent `customer_attention` / `customers` named pack. Thin master asks stay `customers_summary`.

---

## Chapter contract (frozen in PREP)

| Field | Value |
|-------|--------|
| **Chapter id** | `customer_master` |
| **Parent pack** | `collection_attention` |
| **Prep module** | `src/lib/nova/packs/customer-chapter-prep.ts` |
| **Live runner** | Deepen `collection-attention.ts` fan-out — *no new runner file required* |
| **Stub builder** | `buildCustomerChapterNotesStub()` → `NovaPackResult` with pack id `collection_attention` |
| **Signature** | Collection signature unchanged: *“collection attention for {party}”* |
| **Attentions** | ≤ 3 primary across Collection + customer-inactive; empty if nothing material |

### Questions

See `CUSTOMER_CHAPTER_QUESTIONS` — customer context, master, thin list, Collection signature.

### Metrics (draft)

| Family | Metric id(s) | Notes |
|--------|----------------|-------|
| Master | `customers.active_count`, `customers.total_count` | From `customers_summary` |
| Bridge | `ar.customer_outstanding` | Reuse Collection — do not invent ₹ |

Full Collection metrics stay in `COLLECTION_ATTENTION_METRIC_IDS`; see `COLLECTION_WITH_CUSTOMER_METRIC_IDS` for deepen union.

### RBAC

See `CUSTOMER_CHAPTER_RBAC`:

| Concern | Permission(s) |
|---------|----------------|
| Customer master chapter | `customer.read` |
| Outstanding bridge | existing `customer_outstanding` skill gates |

**Rules:**

1. Missing `customer.read` → omit Customer chapter (`permission_omission`); no invented headcount.  
2. Master chapter never invents outstanding ₹ — money stays on Collection tools.  
3. Save report `permissionsUsed` includes `customers_summary` when it contributed.  
4. No separate customer pack product surface.

### Finding shapes

See `CUSTOMER_CHAPTER_FINDING_SHAPES` — party resolve, customer master, inactive attention, outstanding bridge, quiet.

**Do not duplicate** receivables / ageing / overdue / concentration / priorities — those stay in `COLLECTION_ATTENTION_FINDING_SHAPES`.

### Chapters / tools

- New: `customers_summary`  
- Bridge: `customer_outstanding`  
- Unchanged Collection: `receivables_summary`, `overdue_invoices`, `receipts_summary`, `reports_snapshot`  

See `COLLECTION_WITH_CUSTOMER_CHAPTER_TOOLS`.

### Charts

No new chart type. Collection keeps `ageing_or_attention` + `period_trend`. Customer master is narrative / Finding only.

---

## Goldens

`CUSTOMER_CHAPTER_GOLDENS` — Collection signature, customer context → Collection, thin `customers` / active summary → skill, Month stays #1, ambiguous → clarify, no risk-score theatre.

Wire into CI when implementer merges chapter into live Collection runner.

---

## Implementer checklist (post–presentation polish health-match)

1. Deployer: health-match presentation polish live; pull this branch.  
2. Add `customers_summary` to Collection Attention fan-out when party resolved / customer.read.  
3. Map `CUSTOMER_CHAPTER_FINDING_SHAPES` only; keep Collection money shapes unchanged.  
4. Extend metrics with draft `customers.active_count` / `customers.total_count`; reuse `ar.customer_outstanding`.  
5. Goldens in CI; assert bare “customers” still thin skill.  
6. No version bump in prep — deployer owns semver.

---

## Explicit non-goals (this PREP)

- No version bump, no Railway, no push/merge to `main`
- No `customer_attention` / fourth named pack
- No payment risk score / Forecast branding
- No inventing master or AR facts
- No ERP writes

---

## Files in this PREP

- `src/lib/nova/packs/customer-chapter-prep.ts`
- `src/lib/nova/packs/CUSTOMER_CHAPTER_HANDOFF.md` — this document
- `src/lib/nova/packs/packs.test.ts` — stub + goldens smoke
- (related) `src/lib/nova/packs/tasks-light-prep.ts` — sibling Tasks chapter PREP on same branch
