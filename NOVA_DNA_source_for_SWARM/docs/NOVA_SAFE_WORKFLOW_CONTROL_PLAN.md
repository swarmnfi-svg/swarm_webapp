# NOVA Safe Workflow Control Plan

**Status:** P1 shipping (tip **3.1.69**) — P0 shipped 3.1.63+  
**Date:** 2026-07-19  
**Implementation tip:** **3.1.69** (P1 tasks, advances, purchase requests, same-tab fill)

---

## 1. Goals / non-goals

### Goals

- Let users say natural create-intent phrases (“create a payment request for vendor X for ₹4000”) and have NOVA **open the correct create form** with **safe prefill**.
- Prefill is **draft UI only** — never save, send, submit, approve, pay, delete, or post ledger rows.
- Keep the existing **write-deny / read-only** invariant for ERP mutations.
- Reuse patterns already in the app: URL query prefills on `/payment-requests/new`, Reader fillable-form bridge (in-memory drafts), howto guides + RBAC path checks.

### Non-goals (explicit)

| Out of scope | Why |
| --- | --- |
| Auto Save Draft / Save & Submit | Money + SoD risk; CSRF / double-submit |
| Approve / reject / mark paid / delete | Forever forbidden for NOVA (W1–W7 audit) |
| Creating DB rows from chat | Skills stay `prisma-readonly`; no ERP writeback |
| Desktop native menu automation | Bridge today is answer-only (`empower-nova-bridge`) |
| Multi-step wizard auto-advance past review | Later phase; still no submit |
| Weakening `preflightNovaWriteDeny` / `guardNovaPlanWrite` | Hard constraint |

**Invariant:** *prefill ≠ commit*. NOVA may navigate + suggest field values; the **user** must click Save / Submit.

---

## 2. Threat model

| Threat | Mitigation |
| --- | --- |
| Accidental money movement | Never call create/submit/approve/pay actions from NOVA tools |
| CSRF via crafted deep-link | Prefill query params only hydrate **client/server form defaults**; form still posts with session + existing action CSRF/session guards |
| Double-submit / “I thought NOVA created it” | UX never says “created” / “submitted”; confirm card: “Opened form — review and submit yourself” |
| Privilege escalation | `canAccessPath` + permission for create path **before** emitting navigate link; refuse + `permission_help` |
| Ambiguous vendor / wrong party | Resolve vendor via existing entity resolve; clarify if ambiguous; never invent vendor id |
| Prefill replay / sticky drafts | Prefer one-shot URL params or in-memory bridge (Reader pattern — **no sessionStorage drafts**) |
| Prompt injection (“ignore rules and submit”) | Workflow skill returns navigate payload only; write-deny checkpoints still fire on approve/delete/please-mutate; no mutation tools in catalog |
| Desktop shell spoof | Web chat owns navigate; native bridge must not gain submit APIs |

---

## 3. Investigation summary (current repo)

### 3.1 Write-deny vs howto_guide

- Dual checkpoints: `src/lib/ai/nova-write-guards.ts`
  - Checkpoint 1: `preflightNovaWriteDeny` before plan commit
  - Checkpoint 2: `guardNovaPlanWrite` after plan
- How-to / create+module → `howto_guide` (steps + read-only refuse prose), **not** bare `read_only_guard`
- Imperative approve / please-mutate / delete / mark paid → stay **deny_write** / `read_only_guard`
- Safe workflow control must be a **new family** (or howto extension) that **opens UI**, not a write tool

### 3.2 Form routing — “payment request” mapping

| User language | Correct form | Path | Notes |
| --- | --- | --- | --- |
| payment request, pay vendor, vendor payment | **Payment Request** | `/payment-requests/new` | P0 target; type `VENDOR_PAYMENT` |
| staff advance, request advance | Payment Request (staff type) | `/payment-requests/new?type=STAFF_ADVANCE` | Same module; different type |
| staff reimbursement / expense claim | Payment Request | `…?type=STAFF_EXPENSE_REIMBURSEMENT` | |
| purchase request, PR, buy material | **Purchase Request** | `/purchase-requests/new` | Materials/qty — **not** money payment |
| mark paid / approve payment | **Deny write** | — | Never open approve UI for auto-action |

Existing deep-links already used in product:

- `?vendor=&project=&bill=&type=` on `/payment-requests/new` (see `new/page.tsx`, bill detail “pay” link, dashboard advance chips)
- **`amount` is not yet a searchParam** — wizard takes `defaultAmount` from bill outstanding only today
- Salary new page has `?staffId=` prefill precedent

### 3.3 Prefill / bridge patterns

| Pattern | Location | Safe for P0? |
| --- | --- | --- |
| URL searchParams → server defaults | payment-requests/new, salary/new | **Yes** — extend with `amount` (+ optional `purpose`) |
| Reader `form-fill-bridge` CustomEvent | `nova-reader/form-fill-bridge.ts` | Yes for same-tab fill after navigate; no sessionStorage |
| Fillable registry | `fillable-form-registry.ts` includes `payment_request_new` | Reuse formId / intent |
| sessionStorage drafts | Explicitly avoided (audit L1/L4) | **Do not use** for prefill |
| Desktop `__EMPOWER_NOVA_BRIDGE__` | Local-final **answers** only | Not for form control in P0 |

### 3.4 RBAC

- `/payment-requests/new` → `paymentrequest.create` (`route-access.ts`)
- STAFF type-gated: `paymentrequest.type.vendor_payment` etc.
- Help guides already filter links via `canAccessPath`
- Soft-deny pattern: refuse open + explain via `permission_help` / howto notes

---

## 4. Architecture

```
User utterance
    ↓
SearchEngine / Aware routing
    ├─ approve|delete|mark paid|please create record → deny_write (unchanged)
    ├─ how to / guide → howto_guide (unchanged)
    └─ create+slots (vendor, amount, type) + feature flag → workflow_open (NEW)
            ↓
   workflow skill (deterministic, read-only)
            ├─ map language → formId + href
            ├─ RBAC: canAccessPath(user, href) + type perm
            ├─ resolve vendor (existing resolve; clarify if ambiguous)
            ├─ build PrefillPayload (ids + amount + type)
            └─ return answer + links[{ title, href: canonicalUrl }]
                    ↓
   Client: user clicks link (or optional auto-navigate when same-origin + flag)
                    ↓
   Form page consumes query once → defaults in wizard
                    ↓
   User reviews → clicks Save Draft / Save & Submit (explicit)
```

### Design choices

1. **Primary transport = stable URL query** (bookmarkable, works across bubble → full page, no sticky memory).
2. **Optional secondary = Reader-style in-memory fill** when already on the form or after client navigate with a one-shot token — not required for P0 if URL covers vendor+amount+type.
3. **No new ERP write tools** in the skill registry; skill name e.g. `open_workflow_form` with `novaPlaneWritesOnly` still true.
4. **Routing carve-out:** utterances that match workflow_open must **not** hit bare `deny_write` *or* stop at howto-only — they return open+prefill. Approve/delete phrasing still deny.

---

## 5. URL / contract (stable)

### Canonical create URLs

```
/payment-requests/new
  ?nova_prefill=1
  &type=VENDOR_PAYMENT
  &vendor=<cuid|vendorId>
  &amount=4000
  &purpose=<urlencoded optional, max 200>
  &project=<projectId optional>
```

| Param | Required | Semantics |
| --- | --- | --- |
| `nova_prefill` | recommended | Marker that values came from NOVA; UI banner “Prefill from NOVA — review before saving” |
| `type` | P0 yes for vendor pay | `PaymentRequestType` enum; default `VENDOR_PAYMENT` when vendor+amount |
| `vendor` | when party known | Match existing: internal `id` or `vendorId` code |
| `amount` | when known | Positive decimal; server clamps / ignores invalid |
| `purpose` | optional | Soft default for purpose field |
| `project` / `bill` | optional | Existing params unchanged |
| `error` | reserved | Existing error codes — never emit from NOVA |

**Rules**

- Unknown / unauthorized vendor id → omit vendor (open blank) or refuse with clarify — never invent.
- Amount non-numeric / ≤0 → omit amount.
- One-shot: no hash fragment required for P0; avoid putting PII in hash if we add client-only later.
- Schema version: if fields grow, add `nova_prefill_v=1` rather than breaking params.

### Response shape (NOVA answer)

```ts
{
  answer: "Opened **New Payment Request** with vendor … and amount ₹4,000 suggested. Review the form and click Save yourself — I did not create or submit anything.",
  links: [{ title: "Open payment request form", href: "/payment-requests/new?..." }],
  toolsUsed: ["workflow_open", "form:payment_request_new", /* resolve tools */],
  // never: createdId, submitted: true
}
```

---

## 6. Language → form mapping

| Cue | Form | Default type |
| --- | --- | --- |
| payment request, pay vendor, vendor payment, pay ₹… to vendor | Payment Request | `VENDOR_PAYMENT` |
| advance, staff advance | Payment Request | `STAFF_ADVANCE` |
| reimbursement, expense claim | Payment Request | `STAFF_EXPENSE_REIMBURSEMENT` |
| purchase request, PR, material indent | Purchase Request | (no payment type) |
| task / todo create | Tasks new | P1 |
| ambiguous “request for vendor” without pay/purchase | Clarify: Payment vs Purchase | — |

P0 acceptance uses the first row only.

---

## 7. RBAC

1. Before emitting href: `canAccessPath(user, "/payment-requests/new")` (implies `paymentrequest.create`).
2. For STAFF + `VENDOR_PAYMENT`: also require `paymentrequest.type.vendor_payment` (mirror page filter).
3. Vendor list already scoped by `vendorListWhere` on the form — prefilled id must still be in allowed set or field stays empty + warning in answer.
4. On refuse: short explanation + `permission_help` / manual link — **do not** leak that the vendor exists if party ACL would hide it (use soft deny patterns from commercial audit).

---

## 8. NOVA UX copy rules

- ✅ “I opened the form and filled what I could — **you** review and submit.”
- ✅ Confirm card / bold line: **Opened form — review and submit yourself**
- ❌ “Created payment request …”
- ❌ “Submitted / sent for approval …”
- ❌ “Paid vendor …”
- Howto answers that only explain steps remain valid when flag off or slots incomplete.

---

## 9. Phases + acceptance criteria

### Phase 0 — Payment request open + prefill (no save)

**Ship surface**

- Feature flag: `NOVA_SAFE_WORKFLOW_OPEN` env (`1`/`true` = all roles; `0`/`false` = off; unset = Admin/Director/SuperAdmin only).
- Extend `/payment-requests/new` to honor `amount` (+ optional `purpose`) alongside existing `vendor`/`type`.
- Deterministic router: create payment request + vendor + amount → `workflow_open` (not deny_write-only, not howto-only).
- Resolve vendor; build canonical URL; return link + honest copy.

**Acceptance**

| # | Criterion |
| --- | --- |
| P0.1 | “create a payment request for vendor keshav raj for 4000” → link to `/payment-requests/new?…&type=VENDOR_PAYMENT&vendor=…&amount=4000` |
| P0.2 | Opening link shows vendor selected + amount filled; **no** new DB row until user Save |
| P0.3 | Network: no call to `createPaymentRequest` from NOVA path |
| P0.4 | User without `paymentrequest.create` → refuse + permission explanation |
| P0.5 | “approve this payment” / “delete payment request” still `read_only_guard` |
| P0.6 | Answer never claims created/submitted |
| P0.7 | Ambiguous vendor name → clarify options (existing DialogState), no silent pick on money |

### Phase 1 — More create forms ✅ (tip 3.1.69)

- Tasks `/tasks/new` (title/assignee soft prefill)
- Staff advance / reimbursement shortcuts (type param already exists)
- Purchase request `/purchase-requests/new` (project + vendor suggestion + amount as estimated price — separate mapping)
- Same-tab fill bridge + shared NovaPrefillBanner
- ✅ Leave / regularisation open + soft prefill (tip 3.1.73+)
- **Deferred:** task **edit** fill

### Phase 2 — Same-tab bridge polish

- After click, optional `dispatchFillRequest` if form already mounted (align with Reader) — **partially done in P1**
- Banner component shared: “Prefill from NOVA” — **done in P1**

### Phase 3 — Multi-step wizards

- Prefill step 1 only; never auto-click Continue/Submit
- Explicit residual: no auto-approve queues

---

## 10. Test plan

| Layer | Cases |
| --- | --- |
| Unit | URL builder: amount rounding, encode purpose, drop invalid vendor |
| Unit | Language map: payment vs purchase vs advance |
| Write-deny regression | CD13–CD17 + Phase0 `wr-*` still green for approve/delete |
| Goldens | Phase0 `wf-pr-*` + P1 `wf-task-open-prefill`, `wf-advance-open`, `wf-purchase-open` |
| Integration | Mock resolve vendor → href contains id + amount |
| Manual smoke | Flag on: utter → click link → see fields → Save creates one row; without Save, zero rows |
| ACL | STAFF without vendor_payment type → open refused or type stripped |

CI: extend `nova-phase0-catalog` / commercial director suite; forbid any skill import of write prisma.

---

## 11. Rollout

1. Land plan (this doc) without behavior change.
2. Implementation tip (after live version known): flag **default off**.
3. Internal smoke on staging with flag on.
4. Enable for Admin/Director first if settings are role-scoped; else env-only.
5. Monitor: no spike in accidental drafts; support tickets claiming “NOVA created payment”.
6. Docs tip note in help guide: “NOVA can open forms with suggestions; you always submit.”

**Version coordination**

- Do **not** bump `package.json` for plan-only.
- Next free tip after confirming `/api/health` (local tip was 3.1.61 at plan write; parallel agents may claim 3.1.62+).
- Prefer single deploy trigger: `git push` + poll health (Railway rule).

---

## 12. Residuals / out of scope (honest)

- Desktop/Android **native** menu clicks / WebView `postMessage` form fill — bridge is answer-only today.
- Auto-approve, auto-mark-paid, auto-delete — never.
- Filling bank transfer both accounts / bill overpay edge cases — form validation stays authoritative.
- Creating vendors/projects mid-flow if missing — clarify or open vendor create as separate future phase (still no auto-save).
- Offline/local LLM submitting forms — forbidden.
- Weakening dual write-deny checkpoints — forbidden.

---

## 13. P0 example flow (summary)

1. User: *“create a payment request for vendor keshav raj for 4000”*
2. Router: workflow_open (flag on) — not deny_write, not howto-only.
3. Skill: RBAC ok → resolve “Keshav Raj” → unique vendor id.
4. Answer + link:  
   `/payment-requests/new?nova_prefill=1&type=VENDOR_PAYMENT&vendor=<id>&amount=4000`
5. User opens form → sees type, vendor, amount → reviews purpose/project → clicks **Save Draft** or **Save & Submit**.
6. NOVA never called `createPaymentRequest`.

---

## 14. Implementation checklist (when building — not now)

- [x] `amount` (+ `purpose`) on payment-requests new page / wizard
- [x] `buildNovaWorkflowPrefillUrl` + language map module
- [x] Route carve-out beside howto / write-deny
- [x] Feature flag gate (`NOVA_SAFE_WORKFLOW_OPEN`; default on for Admin/Director/SuperAdmin)
- [x] Phase0 goldens + write-deny non-regression
- [x] UX banner on form when `nova_prefill=1`
- [x] Help-guide note update
- [x] P1 map/url/answer for task, purchase, staff advance/reimbursement
- [x] Same-tab fill bridge + `useNovaSafeWorkflowFill` on create forms
- [x] Shared `NovaPrefillBanner` component
- [x] P1 goldens + safe-workflow unit tests
- [x] Tip bump + health poll (leave/reg open on 3.1.73+)
- [x] Leave / regularisation open form
- [ ] Task edit fill (deferred)

---

## Related docs

- `src/lib/ai/nova-write-guards.ts` — dual write-deny
- `src/lib/ai/nova-help-guides.ts` — howto vs live
- `src/lib/nova-reader/form-fill-bridge.ts` — in-memory fill precedent
- `src/lib/nova/NOVA_FULL_AUDIT_CHECKLIST.md` — W1–W7 forever forbidden
- `src/lib/nova/NOVA_PERMISSION_HELP_3.1.55.md` — RBAC explain pattern
- `src/app/(app)/payment-requests/new/page.tsx` — existing query prefills
