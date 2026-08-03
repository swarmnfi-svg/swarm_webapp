# Cash / Banking — PREP HANDOFF

**Branch:** `nova-attendance-cash-prep` only  
**Status:** PREP (metrics + RBAC + stub + goldens) — **not** merge-ready to `main`  
**Pack id:** `cash_banking` (or Month cash chapter deepen — see ship options)

---

## Dependency gate (blocking)

| Depends on | Why | Gate |
|------------|-----|------|
| **Save / give report follow-up live** | If shipped as named pack, Save report must freeze `NovaPackResult` — never ERP Reports/GSTR. | **REQUIRED** — merge only after **sole deployer health-matches** save-report fix live, then pulls this prep. |
| **Report plane + Month bank chapter** | Month Performance already fans out `bank_accounts_summary` + `receipts_summary`. Named pack deepens recon / payment requests; month_chapter reuses same metric ids. | REQUIRED (on tip). |
| **Certified money metrics** | New draft bank.* / cash.* ids need dictionary + drift; `receipts.period_collected` + `bank_recon.summary` already exist. | IDEAL. |

**Hard rule:** No push to `main`, no Railway, **no version bump** from this prep.

---

## Ship options (implementer / deployer choice)

| Option | When | Save report |
|--------|------|-------------|
| **`named_pack`** (`cash_banking`) | Directors ask cash/banking as a first-class brief | Yes — add to `NOVA_SAVEABLE_PACK_IDS` |
| **`month_chapter`** | Prefer deepening Month Performance cash section only | No new pack id; metrics still certified for Month |

PREP freezes **both**: stub uses pack id `cash_banking`; narrativeHints record `shipAs`. Prefer named pack when “how is cash this week?” should be independently savable.

---

## Pack / chapter contract (frozen in PREP)

| Field | Value |
|-------|--------|
| **Pack id** | `cash_banking` (`NovaPackId`) |
| **Prep module** | `src/lib/nova/packs/cash-banking-prep.ts` |
| **Live runner** | *none yet* — or deepen `month-performance.ts` cash chapter |
| **Stub builder** | `buildCashBankingPackStub()` → `NovaPackResult` |
| **Signature ask** | *“how is cash this week?”* |
| **Attentions** | ≤ 3 primary via `selectCashBankingAttentions`; empty if nothing material |

### Questions

See `CASH_BANKING_QUESTIONS` — cash week/month, bank balances, recon, receipts+bank.

### Metrics (draft)

| Family | Metric id(s) | Notes |
|--------|----------------|-------|
| Accounts | `bank.accounts_count` | From `bank_accounts_summary` |
| Book | `bank.book_balance` | Only when `balancesVisible` |
| Statement | `bank.statement_balance` | Only when visible |
| Operational | `bank.operational_balance` | Only when visible |
| Receipts | `receipts.period_collected` | Shared with Month / Collection |
| Recon | `bank_recon.summary` | Existing dictionary id |
| Payments | `pr.awaiting_action` | Existing dictionary id |
| Position | `cash.period_position` | Narrative synthesis label — never invent ₹ |

Stub: `certification: "draft"`, `value: null`. When balances hidden, leave value null and narrate **hidden** — never coerce to ₹0.

### RBAC (critical)

See `CASH_BANKING_RBAC`:

| Concern | Permission(s) |
|---------|----------------|
| Open pack / chapter | `bank.read` |
| Show balances / last4 | `bank.viewfullaccount` **or** `canViewOrgFinanceAggregates(user)` |
| Recon chapter | `bank.read` + `bank.reconcile` |
| Receipts | `receipt.read` / `invoice.read` (existing skill) |
| Payment requests | `paymentrequest.read` / `.create` |

**Rules:**

1. Missing `bank.read` → omit cash chapter (`permission_omission`); no invented balances.  
2. `balancesVisible=false` → display “hidden”, never ₹0 theatre.  
3. Save report `permissionsUsed` must include every chapter that contributed facts; download ACL re-check.  
4. Vendor full account / bank SMS are **out of scope** for v1 (`vendorbank.*`, `bank.sms.read`).

### Finding shapes

See `CASH_BANKING_FINDING_SHAPES` — permission gap, bank position, balances hidden, receipts, recon/payment material, quiet.

### Chapters / tools

`bank_accounts_summary`, `bank_recon_summary`, `receipts_summary`, `payment_requests_summary`.

### Charts (thin)

- `kpi_strip` ← book / operational / receipts  
- `ageing_or_attention` ← recon + payment requests  

---

## Goldens

`CASH_BANKING_GOLDENS` — signature cash ask, balances, recon, receipts+bank, director Month stays `#1`, thin `bank accounts` skill, no invented cash-on-hand.

Wire into CI when routing lands; if `month_chapter` only, goldens may expect `month_performance` for cash asks that stay inside Month.

---

## Implementer checklist (post–save-report health-match)

1. Deployer: health-match save-report fix; pull this branch.  
2. Choose `named_pack` vs `month_chapter`; document in release notes.  
3. If named pack: recipe + runner + `NOVA_SAVEABLE_PACK_IDS` + Save button title.  
4. If month chapter: map finding shapes into Month Performance cash section; reuse metric ids.  
5. Add draft metrics to dictionary (`bank.*`, `cash.period_position`); reuse `pr.awaiting_action` + `bank_recon.summary`.  
6. RBAC smoke: no `bank.read` → omission; no balance visibility → “hidden”.  
7. No version bump in prep — deployer owns semver.

---

## Explicit non-goals (this PREP)

- No version bump, no Railway, no push/merge to `main`
- No balance invention / ₹0 for hidden
- No vendor bank PII / bank SMS chapter in v1
- No ERP writes / free SQL
- No CBG-as-fourth-pack product surface

---

## Files in this PREP

- `src/lib/nova/packs/cash-banking-prep.ts`
- `src/lib/nova/packs/CASH_BANKING_HANDOFF.md` — this document
- `src/lib/nova/pack-result.ts` — `NovaPackId` includes `cash_banking`
- `src/lib/nova/packs/packs.test.ts` — stub + RBAC constant smoke
