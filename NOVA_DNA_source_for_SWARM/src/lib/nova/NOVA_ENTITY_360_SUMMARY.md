# NOVA Entity 360

Cross-module, RBAC-aware "entity 360" resolver. When a user names a specific
record by its code (starting with **payment requests**), NOVA recognises the
identifier, resolves what kind of entity it is, and returns a consolidated
multi-module summary with actionable next steps — scoped to exactly what the
asking user is permitted to see.

## Files

- `src/lib/nova/entity-360/recognize.ts` — generic, table-driven identifier
  recogniser (`recognizeEntity360Id`, `queryNamesEntity360`).
- `src/lib/nova/entity-360/payment-request-360.ts` — RBAC-aware payment-request
  loader + fact builder (`buildPaymentRequest360Fact`).
- `src/lib/nova/entity-360/index.ts` — the `entity_360` skill handler
  (`runEntity360`) + the per-kind dispatch (extension point).
- Wiring: registered in `src/lib/nova/skills/registry.ts`; permission floor in
  `src/lib/ai/nova-tool-permissions.ts`; routed in `selectNovaTools`
  (`src/lib/ai/nova-tools.ts`); presented deterministically via
  `NOVA_DETERMINISTIC_POLISHED_TOOLS` + `formatEntity360Fact`
  (`src/lib/ai/nova-format.ts`); redaction allow-list in
  `src/lib/ai/nova-llm-sanitize.ts`.

## Identifier recognition + routing

`recognizeEntity360Id(query)` scans the query for a supported record code and
returns `{ kind, id, raw }`. Recognised payment-request formats (see
`src/lib/ids.ts`):

| Format | Example | Source |
| --- | --- | --- |
| Project-linked bank reference `{projectRef}-{txnType}{seq}` (txnType ∈ R/VP/E/PO/TR/IN/SI) | `C0028-P001-E002`, `C0028-P001-VP001` | `nextBankReference` |
| Non-project series `{PREFIX}/{FY}/{seq}` (PREFIX ∈ ADV/EXP/REIM/SAL/SALPAY/TRF/DIR/OTH) | `OTH/26-27/0011`, `ADV/26-27/0007` | `nextPaymentRequestSeriesId` |

Bare project ids (`C0028-P001`) and customer ids (`C0028`) are deliberately
**not** matched (they resolve through the normal entity-resolve path — no
regression risk).

`selectNovaTools` short-circuits to `["entity_360"]` when a supported code is
present, ahead of recipes / search / lexicon. That plan becomes the forced tool,
so the skill runs and is presented deterministically.

## Modules aggregated for a payment-request 360

- **Identity / money:** request id, status (+ human label), request type, amount.
- **People:** posted by (`requestedBy`), on-behalf-of (`requestedForUserId`),
  paid by (`paidBy`) — resolved to display names.
- **Party:** vendor / staff / free-text party label (with deep link).
- **Classification:** purpose, expense category, urgency, GST/TDS flags.
- **Project link:** project id + name (or raw `projectRef`).
- **Purchase bill link** when present.
- **Approval chain:** manager / admin approval status, payment status,
  reconciliation status, admin-override flag, and recent approval history.
- **Payment posting:** paid-from bank label, and payment narration (posting
  details) for permitted viewers.
- **Vendor beneficiary details:** UPI id / bank account number / IFSC / account
  name — RBAC-gated (see below).
- **Suggested next actions:** derived from status + time-in-state, e.g.
  "Pending manager verification for 9 days", "Approved — ready to mark paid",
  "Paid but not yet reconciled".

## RBAC + money / redaction behaviour

Existing guards are reused (no duplicated policy):

- **Record visibility:** `paymentRequestListWhereForUser` scopes the lookup.
  STAFF see only requests they created / are on-behalf-of / are the payee for,
  unless they hold `paymentrequest.view_all`; ADMIN / SUPER_ADMIN / DIRECTOR /
  MANAGER see all. A record outside the caller's scope returns a neutral
  "not visible to you" — NOVA never confirms it exists.
- **Tool floor:** `entity_360` requires `paymentrequest.read` or
  `paymentrequest.create`. It is intentionally **not** an org-finance aggregate
  (it is self-scoped), so STAFF can see their own request amounts — matching the
  detail page.
- **Vendor bank / UPI:** gated by `canSeeVendorBankDetails` (same gate as the
  vendor page / SoD bank write path: ADMIN/SUPER_ADMIN, `vendorbank.read`,
  `bank.viewfullaccount`, or the per-user flag). Unauthorised users get a masked
  note — the raw UPI / account number is **never loaded or shown**.
- **Payment narration:** gated by `canViewPaymentPostingDetails` (privileged
  roles + the requesting staff, PAID only).

### Who sees UPI / bank

| Role / grant | Vendor UPI / account / IFSC |
| --- | --- |
| ADMIN, SUPER_ADMIN | Visible |
| `vendorbank.read` or `bank.viewfullaccount` (or per-user flag) | Visible |
| Everyone else (incl. plain STAFF / MANAGER without the grant) | Masked note only |

### Money-guard / LLM safety

The 360 is always **deterministic** (`entity_360` ∈
`NOVA_DETERMINISTIC_POLISHED_TOOLS`), rendered by `formatEntity360Fact` — its
facts are never sent to the LLM. Defense-in-depth for any future hybrid path:

- The LLM sanitiser (`sanitizeNovaFactsForLlm`) has an `entity_360` allow-list
  that drops `vendorPaymentDetails` and `paymentNarration` entirely; and the
  global sensitive-key regex additionally redacts `upiId` / `ifsc` /
  `accountNumber` / `bankAccount` / `narration` shaped keys.
- Money values use the exact `*Inr` fact strings, so the answer-money guard sees
  consistent totals.

## Extension point (other entity types)

`recognize.ts` is a table (`ENTITY_360_PATTERNS`) keyed by `Entity360Kind`. To
add a new kind:

1. Add its identifier regex(es) with `supported: true`.
2. Add a `case` in `runEntity360` (`index.ts`) that calls a new
   `build<Kind>360Fact(user, id)` loader (mirror `payment-request-360.ts`,
   reusing that module's existing list-scope guard).
3. Add any new fact fields to `formatEntity360Fact` and the sanitiser allow-list.

Reserved (recognised-capable but 360 not yet built): project, customer, vendor,
sales order, invoice, purchase bill, purchase order, staff advance. These fall
back to a friendly "not available yet" message rather than leaking data.

## Follow-ups (not yet covered)

- 360 builders for project / customer / vendor / sales order / delivery /
  invoice (loaders + formatter sections + tests).
- First-class recognition of other record codes (invoice `BPG/FY/SI/NNNN`,
  receipt `BPG/FY/RCPT/NNNN`, sales order `…-SO001`, PO `…-PO001`, PB `…-PB001`,
  staff advance `ADV/FY/NNNN`) — noting `ADV/FY/NNNN` overlaps the staff-advance
  series and would need kind disambiguation.
- Optional: surface a compact 360 chip inside pack/recipe answers.
