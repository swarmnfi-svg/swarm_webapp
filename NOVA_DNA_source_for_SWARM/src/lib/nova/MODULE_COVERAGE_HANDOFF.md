# NOVA 3 — Cross-module entity + lexicon map (PREP)

**Branch:** `nova-3-module-coverage-prep` (tip == `main` after rebase 2026-07-13)  
**Status:** Artifacts **already on `main`** (landed in `4c564e6` / tip `e1110b3`) — **no further merge required** from this branch. Matrix + gap checklist below remains the authority for follow-on work.  
**Authority stub:** [`module-coverage-prep.ts`](./module-coverage-prep.ts)  
**Plan refs:** [`NOVA_3_0_PLAN.md`](./NOVA_3_0_PLAN.md) · [`NOVA_DIALOG_STATE_PLAN.md`](./NOVA_DIALOG_STATE_PLAN.md) · [`NOVA_FLOW.md`](./NOVA_FLOW.md)

---

## Hard rule for integrators / parent agents

**No** `git push` to `main` from prep agents, **no** Railway, **no** version bump from this prep. Sole deployer owns merge/release.

**Reconcile note (2026-07-13):** Rebase onto latest `main` dropped the unique prep commit — patch contents were already upstream. Branch tip equals `main` (`e1110b3`). Same commit that added these files (`4c564e6`) also shipped staff-profile routing / sticky-money clears — re-verify §2 gaps (G1/G2) against live tip before treating them as open.

---

## 1. Coverage matrix

**Axes:** Empower module → ontology / resolve entity types → catalog skills (`toolId`) → `NovaSkillDataClass` (RBAC / provider routing).

Live skill defs: `src/lib/nova/skills/registry.ts`.  
Ontology Gate A: `src/lib/nova/semantic/ontology.ts`.  
Nav → topic bridge (smoke only): `src/lib/ai/nova-module-bridge.ts`.

Typed rows: `NOVA_MODULE_COVERAGE_MATRIX` in the prep stub.

| Module | Entity types (resolve path) | Skills / tools (today) | Data class(es) |
|--------|----------------------------|-------------------------|----------------|
| **HR — attendance** | `employee` via **personHint** only (not `resolveNovaEntityHint`) | `attendance_late_summary` | `hr_attendance`, `hr_pii` |
| **HR — leave / OT / reg** | personHint | `leave_summary`, `overtime_summary`, `regularisation_summary` | `hr_pii` ± `hr_attendance` ± `ops_summary` |
| **HR — salary / advances** | personHint | `salary_summary`, `staff_advances_summary` | `hr_pii`, `finance_money` |
| **HR — staff master** | **none** (org headcount only) | `staff_summary` | `hr_pii`, `ops_summary` |
| **Finance — AR / sales** | `customer` \| `project` via `resolveNovaEntityHint` | `sales_summary`, `receipts_summary`, `receivables_summary`, `overdue_invoices`, `customer_outstanding`, `credit_notes_summary`, … | `finance_money` (± `ops_summary`) |
| **Finance — AP / purchase** | `vendor` \| `project` | `purchase_orders_summary`, `purchase_requests_summary`, `purchase_bills_summary`, `payment_requests_summary`, `vendors_summary` | `finance_money` ± `ops_summary` |
| **Finance — bank / ledger** | (party rarely) | `bank_accounts_summary`, `bank_recon_summary`, `accounts_snapshot`, `gstr_snapshot`, `tally_status`, … | `finance_money` / `system_admin` |
| **Ops — projects / tasks** | `project` (+ personHint for assignee) | `projects_summary`, `tasks_summary`, `my_work_summary`, `delivery_summary` | `ops_summary` (± `hr_pii`) |
| **Ops — stock / GRN** | none / vendor soft | `stock_summary`, `grn_summary` | `ops_summary` |
| **Ops — KPI / incentives** | personHint | `kpi_summary`, `incentives_summary` | `ops_summary`, `hr_pii` (± `finance_money`) |
| **Ops — approvals / workflow** | none | `approvals_summary`, `pending_workflow_counts` | `ops_summary` ± `finance_money` |
| **Ops — packs / recipes** | `project` / party from resume | `daily_brief`, `proactive_insights`, `month_performance`, `project_command`, `collection_attention`, … | mixed |
| **System / docs** | `document` (search kind) | `documents_*`, `*_open`, `search_entities` | `documents` / `public_meta` / `system_admin` |

**Global data-search (3.0.41):** `search_entities` / `searchBusinessData` also cover CBG quotations, approvals (ACL-scoped), manual expenses, leave (team/self), bank accounts (identity only), plus prior CRM/purchase/billing/task kinds. Typed SearchEngine entities include `quotation` / `purchase_*` / `receipt` / `expense` / `approval` / `leave` / `bank_account` — find/search only; money & bare-approvals summaries unchanged.

### Bindable vs searchable entity types (as of tip)

| Type | Ontology | SearchEngine | `resolveNovaEntityHint` | DialogState bind | Clarify option |
|------|----------|--------------|-------------------------|------------------|----------------|
| customer | ✓ | ✓ | ✓ | ✓ | ✓ |
| vendor | ✓ | ✓ | ✓ | ✓ | ✓ |
| project | ✓ | ✓ | ✓ | ✓ | ✓ |
| employee / staff | ✓ aliasable | ✓ (`Staff` kind) | **✗ filtered out** | **✗** (`isNovaBindableEntityType` excludes) | ✓ (`staff`, kind `person`) |
| invoice / PO / PR / … | ✓ (non-aliasable) | ✗ | ✗ | ✗ | ✗ |
| document | ✗ ontology | ✓ | ✗ | ✗ | ✓ |

---

## 2. Gaps (must-fix before claiming “module coverage”)

### G1 — Staff resolve missing (P0)

**Symptom:** Named staff cannot travel the same path as customer/vendor/project.

| Surface | Today | Gap |
|---------|-------|-----|
| `resolveNovaEntityHint` | customer \| vendor \| project only; **employee aliases explicitly filtered** | No staff bind into `resolvedEntityDbId` / `resolvedEntityType` |
| `NovaSkillHandlerContext.resolvedEntityType` | `"customer" \| "vendor" \| "project" \| null` | No `"employee"` / `"staff"` |
| `NovaDialogBound` / `isNovaBindableEntityType` | party/project only | Clarify pick on staff cannot bind-by-id into resume tools |
| `staff_summary` | Org headcount; **ignores** `personHint` / resolved id | “Staff Zeeshan” / “who is EMP-012” → list, not profile |
| Person path | `resolveNovaPersonHint` + per-skill ad-hoc Prisma | Parallel to entity resolve; no DialogState bind; attendance duplicates fuzzy logic |

**Implementer direction (not in this PREP):**

1. Extend prefer/bind types to include `employee` (or keep `staff` clarify type ↔ ontology `employee`).
2. Stop filtering employee aliases in `resolveNovaEntityHint` when tools are HR-scoped; or unify into one resolver with `preferTypes`.
3. Teach `staff_summary` (and optionally leave/attendance) to accept bound `staffId`.
4. Persist `personUserId` / staff id on DialogState bind for numbered clarify picks (already sketched on `NovaDialogBound.personUserId`).

### G2 — Sticky money on “staff X” (P0)

**Symptom:** After a money turn (`family: money`, tools like `receipts_summary`), a short staff pivot can inherit money slots / tools instead of clearing to HR.

| Mechanism | Why it sticks |
|-----------|----------------|
| `detectNovaSlotFamily` | Knows `money`, `attendance`, `leave`, `tasks`, `approvals`, `projects` — **no `staff` / HR-directory family**. Utterances like `staff Zeeshan`, `employee EMP-012`, `who is Ravi` often return `null` → **no topic-switch clear**. |
| Follow-up / bare entity | Bare name after receipts binds as **party** via `resolveNovaEntityHint`, never staff. |
| SearchEngine money family | Clears `entityType: employee` unless metric is salary/payroll/payslip/incentive/advance — good for money asks, but the **converse** (staff ask after money) relies on topic-switch which misses staff keywords. |
| Lexicon | `staff` synonyms are list/headcount oriented; weak person+staff patterns. |

**Goldens to add (implementer):**

1. `today receipts` → `staff Zeeshan` → **not** `receipts_summary`; prefer person resolve / staff or attendance clarify.
2. `today receipts` → `who is Zeeshan` → topic switch; no sticky ₹.
3. `Zeeshan's leave` after money → `leave_summary` (already partly covered by `leave` family).
4. Bound customer money → `staff list` → clear bound party.

**Implementer direction:** Add `staff` (or `hr_people`) to `NovaSlotFamily` + `detectNovaSlotFamily` keywords; treat staff/employee lexicon hits as topic-switch; never inherit money tools when personHint/employee entityType wins.

### G3 — Secondary coverage holes (P1)

| Hole | Notes |
|------|-------|
| PO / GRN / invoice as first-class resolve | Ontology has types; no SearchEngine entityType / bind path — code/number lookup is skill-internal if any |
| Attendance day | Ontology only; not resolve-target |
| Module bridge vs lexicon drift | Bridge is smoke catalog; some nav rows share topics (e.g. finance_dashboard) |

---

## 3. Proposed lexicon + topic-switch keywords

Typed lists: `NOVA_MODULE_LEXICON_PROPOSALS` + `NOVA_TOPIC_SWITCH_KEYWORDS` in the prep stub.

### Topic-switch families (proposed additions marked ★)

| Family | Keywords (proposed) | Clears money slots? |
|--------|---------------------|---------------------|
| money | sales, revenue, receipts, collections, invoices, billing, outstanding, receivables, payables, PO value, … | — |
| attendance | attendance, late, punched, absent, present, who was late, … | yes |
| leave | leave, payroll, salary, advances, incentives, OT, regularisation, … | yes |
| **staff ★** | staff, employee(s), headcount, workforce, directory, “who is \<name\>", staff code / EMP- | **yes (G2)** |
| tasks | tasks, todos, my work | yes |
| approvals | approvals, pending approval | yes |
| projects | project(s) | yes (keep entity only if referenced) |
| **procurement ★** | PO, purchase order, PR, indent, GRN, MRN, goods receipt, material inward | yes |
| **stock ★** | stock, inventory, SKU, warehouse, reorder | yes |

### Per-module synonym additions (proposal — do not paste blindly into `nova-lexicon.ts`)

| Topic id | Add synonyms / patterns |
|----------|-------------------------|
| `staff` | `staff <Name>`, `employee <Name>`, `who is <Name>`, `staff code`, `EMP-####`, `directory for <Name>` |
| `attendance` | `did <Name> punch`, `<Name> present?`, `punch status` |
| `leave` | `<Name> leave balance`, `CL/SL/EL for <Name>` |
| `purchase_orders` | `PO ####`, `open PO for <vendor>`, `pending PO` |
| `grn` | `GRN ####`, `MRN`, `goods inward today` |
| `stock` | `SKU ####`, `low stock alert` |
| `tasks` | `tasks for <Name>`, `<Name>'s todos` |
| `salary` | keep confidential; person-scoped only with RBAC |

---

## 4. Implementer checklist

1. Land staff bind path (G1) before expanding staff lexicon synonyms that imply profile lookup.
2. Add `staff` slot family + topic-switch (G2); goldens above must go green.
3. Optionally extend `resolveNovaEntityHint` preferTypes for HR tools; keep money path refusing silent employee bind (SearchEngine already does).
4. Keep forever-forbidden: sticky ₹ memory / NovaMind (`NOVA_INVARIANTS.foreverForbidden`).
5. Sync `NOVA_MODULE_BRIDGE` smoke phrases when lexicon topics land.
6. Do **not** invent PO/GRN entity resolve theatre without catalog skills + RBAC.

---

## 5. Explicit non-goals (this PREP)

- No version bump, no Railway, no push from prep agents (sole deployer owns release)
- Original prep intent was docs + stub only; runtime staff-routing may already be on tip via `4c564e6` — confirm before re-implementing
- No new ERP writes; no sticky money memory product
- No fourth CBG pack / dashboard builder

---

## 6. Files in this PREP

| File | Role |
|------|------|
| `src/lib/nova/MODULE_COVERAGE_HANDOFF.md` | This document |
| `src/lib/nova/module-coverage-prep.ts` | Matrix rows, gap ids, lexicon/topic-switch proposals, goldens placeholders |
| `src/lib/nova/module-coverage-prep.test.ts` | Contract smoke (row shape + gap markers) |
