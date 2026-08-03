# NOVA Staff Advance, Reimbursement, and Expense Semantics

## Source Of Truth

NOVA answers these queries from ERP tables only:

- `StaffAdvance`: advance request/issue/settlement balance. `amountIssued` is advance cash issued/requested; `balancePending` is unsettled balance. Status distinguishes `REQUESTED`, `APPROVED`, `PAID`, `PARTIALLY_SETTLED`, `SETTLED`, `OVERDUE`, `REJECTED`, and `CANCELLED`.
- `PaymentRequest`: workflow reimbursement and expense requests. `STAFF_EXPENSE_REIMBURSEMENT` and `STAFF_ADVANCE_SETTLEMENT_EXTRA_PAYMENT` are reimbursements; `GENERAL_EXPENSE` and `PROJECT_EXPENSE` are expense requests. `manualExpensePayment: null` avoids double counting requests mirrored as manual vouchers.
- `ManualExpensePayment`: paid manual expense vouchers. Staff-linked `EXPENSE` rows count as staff spend. Vendor payments are included only in the generic expense summary, not staff reimbursement ranking.
- `StaffAdvanceSettlementLine`: posted expense lines submitted against an advance. Only lines under `StaffAdvanceSettlement.status = POSTED` count as actual staff spend.

## Query Semantics

- Staff advance requests/rankings: routes to `staff_advances_summary`, ranking by `amountIssued` unless the query asks for balance/pending settlement.
- Pending advance approval: `StaffAdvance.status = REQUESTED`.
- Pending advance settlement: `StaffAdvance.status in (PAID, PARTIALLY_SETTLED, OVERDUE)` with `balancePending > 0`.
- Reimbursement requests/claimants: routes to `staff_expense_summary` and filters `PaymentRequest.requestType in (STAFF_EXPENSE_REIMBURSEMENT, STAFF_ADVANCE_SETTLEMENT_EXTRA_PAYMENT)`.
- Staff spend / staff-wise expense report: combines paid staff manual expenses, paid expense payment requests without mirrored manual vouchers, and posted settlement lines. Staff advances themselves are not spend.
- Employee expense trend: routes to `nova_trend` domain `staff_expense_spend`, using the same staff-linked paid/posting sources over the bound trend window.

## Period And Person Filters

Explicit date phrases use NOVA's normal `parseNovaDateRange` path: today, this month, this year/FY, named months, and FY tokens. All-time phrases (`all time`, `overall`, `ever`) do not add a date filter. Ranking asks without an explicit period prefer all-time for reimbursements/spend and current FY for advances.

Person filters use `resolveNovaPersonHint` and staff profile IDs. Examples: `pending reimbursement for Arif`, `Arif expenses`, and `staff advance pending settlement for Zeeshan`.

## ACL And Money Guard

Advance facts require existing staff advance permissions: `staffadvance.read` for org scope or self advance permissions for self scope. Staff expense/reimbursement facts require accounts read/dashboard/report access and `canViewOrgFinanceAggregates`; otherwise the tool denies instead of exposing money. Facts include provenance and source tables so the LLM is grounded in ERP-backed rows only.

## Remaining Gaps

- Settlement-line trend currently charts posted expenses only. Draft/submitted settlements remain workflow queue data, not spend.
- Manual vouchers without `staffId` are shown in generic samples but excluded from staff-wise rankings because NOVA cannot safely infer a staff member from free-text `partyLabel`.
- Reimbursement status names are mapped from payment request workflow status and payment status; if finance adds a first-class reimbursement status enum, NOVA should switch to that SoT.
