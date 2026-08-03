# NOVA Report Capability — PDF / charts across modules

## How chat vs PDF/chart is chosen

1. User query is routed to a catalog skill (e.g. `receivables_summary`, `delivery_summary`).
2. If the query matches **report intent** (`report`, `reports`, `pdf`, `chart(s)`, `download`, `export`, `with charts`, or `save report/pdf/pack`), the skill builds a versioned `NovaPackResult` and attaches it on the fact as `data.pack`. Bare “save” alone is **not** report intent (avoids false packs).
3. `answerNovaQuery` extracts that pack via `extractNovaSavablePack` when the tool is in `SAVEABLE_PACK_TOOLS`.
4. The chat UI shows **Save report** for answers with `answer.pack`. Verbal “save report” uses `lastSavablePack` when the pack id is in `NOVA_SAVEABLE_PACK_IDS` (director packs + skill report packs).
5. Save freezes an immutable `NovaReport` snapshot; download (`?format=pdf|csv|txt|json`) re-checks RBAC witnesses and renders from the frozen pack (metrics, charts, tables, findings).

Ordinary asks (no report intent) stay **chat-only** — same facts, no pack.

Shared helpers: `src/lib/nova/reports/skill-report.ts`  
PDF renderer: `src/lib/nova/reports/render-artifacts.ts` (generic `pack.tables[]` + legacy delivery fallback)

## Supported modules (report packs)

| Module | Skill tool | Pack id | Charts | Notes |
|--------|------------|---------|--------|-------|
| Delivery / installation delays | `delivery_summary` | `delivery_delay_report` | Delay days by project; status distribution | Report intent + delay focus |
| Delivery / installation status | `delivery_summary` | `delivery_status_report` | Stage distribution | Report intent without delay focus |
| Receivables / overdue | `receivables_summary` | `receivables_report` | Amount by customer; days overdue | Requires `invoice.read` + org finance aggregates |
| Staff advances | `staff_advances_summary` | `staff_advances_report` | Balance/amount by staff | Self vs org scope preserved |
| Staff expenses / reimbursements | `staff_expense_summary` | `staff_expense_report` | Spend by type; by staff when ranking | Paid totals; org finance gate |
| Project P&L / loss | `profitability_summary` | `project_pl_report` | Margin by project; status mix | Money hidden without org finance aggregates |
| Attendance / latecomers | `attendance_late_summary` | `attendance_late_report` | Late minutes by person | Self/team/all scope preserved |
| KPI scores | `kpi_summary` / `nova_trend` (kpi_score) | `kpi_trend_report` | Score over periods (`period_trend`) + top scores strip; parameters table (period / person / scope) | Self/team/all scope preserved; SoT = `KpiReview.totalScore` |
| Tasks | `tasks_summary` | `tasks_report` | Completed by assignee; open vs overdue | ACL + KPI self-assigned rules preserved |
| Sales / billing | `sales_summary` | `sales_billing_report` | Invoice amounts (sample) | Tax invoices; org finance gate |
| Purchase bills | `purchase_bills_summary` | `purchase_stock_report` | Amount by vendor | Shares pack id with stock |
| Stock | `stock_summary` | `purchase_stock_report` | Low stock levels | `stock.read` |
| Tally (read-only) | `tally_status` | `tally_summary_report` | Active vs total connections | No invented TB/ledger |
| Receipts / collections | `receipts_summary` | `receipts_report` | Amount by customer; receipt sample | Posted receipts; org finance gate |
| Payment requests outstanding | `payment_requests_summary` | `payment_requests_report` | Amount by party; status mix | List ACL (org vs self) preserved |
| Staff directory | `staff_summary` | `staff_directory_report` | Active by department | Named profile lookups stay chat-only |
| Customers | `customers_summary` | `customers_report` | Active by billing state | Master directory — not outstanding |
| Vendors | `vendors_summary` | `vendors_report` | Active vs total | Master directory — not payables |
| Bank reconciliation | `bank_recon_summary` | `bank_recon_report` | Aging buckets | Balances gated; reconcile ACL for aging |
| Bank accounts | `bank_accounts_summary` | `bank_accounts_report` | Book balance by account | Balances gated |
| GST e-invoice / e-way | `gst_docs_summary` | `gst_docs_report` | Status counts | Org finance gate; not GSTR totals |
| CBG quotations | `cbg_quotations_summary` | `cbg_quotations_report` | By status | Costs gated by org finance |
| Projects portfolio | `projects_summary` | `projects_portfolio_report` | Value / status mix | Contract value visibility preserved |
| GSTR taxable / payable | `gstr_snapshot` | `gstr_report` | Money totals + GSTR-1 doc counts | Calendar month; org finance; soft-fail never invents ₹0 |
| Leave | `leave_summary` | `leave_report` | Approved days by type | Self/team/all scope preserved |
| Overtime | `overtime_summary` | `overtime_report` | Status mix; OT minutes sample | Self/team/all scope preserved |
| Regularisation | `regularisation_summary` | `regularisation_report` | Status mix; by request type | Self/team/all scope preserved |
| Salary / payroll | `salary_summary` | `salary_report` | Paid by staff (sample) | Confidential salary gate / self payslip — never widens |
| Sales orders | `sales_orders_summary` | `sales_orders_report` | Open by status; value when visible | Values need project-value or finance aggregates |
| Purchase orders | `purchase_orders_summary` | `purchase_orders_report` | Open by status; value by vendor | Values need org finance aggregates |
| GRN / material receipts | `grn_summary` | `grn_report` | Count by project (sample) | stock/PO/PR read |
| Credit / debit notes | `credit_notes_summary` | `credit_notes_report` | CN vs DN totals; CN amounts | Org finance gate |
| Party outstanding (AR) | `customer_outstanding` | `party_outstanding_report` | By customer; days overdue | Open invoice AR; org finance gate |
| Month / collection / cash / attendance month / project command | Named packs | `month_performance`, `collection_attention`, `cash_banking`, `attendance_month`, `project_command` | Pack-specific | Existing recipe packs |

## Gaps (still chat-only or partial)

| Module | Notes |
|--------|-------|
| ERP `reports_snapshot` / filing JSON export | Chat / ERP Reports UI — not a separate NOVA pack (use `gstr_report` for taxable totals) |
| Advances “detail” beyond sample table | `staff_advances_report` already includes sample/top-staff tables on report intent |
| Soft FP: bare “export …” / “download …” (non-meta) | Still intentional true positives for artifact asks; meta how/where/did-we questions excluded |
| KPI report-card PDF polish | Staff `/api/kpi/scorecard-pdf` layout polished (score callout, page breaks, headers/footers); download button surfaces real errors |

## RBAC / money guards

- Skill handlers keep their existing `can(...)` / `canViewOrgFinanceAggregates` checks.
- Save snapshots `permissionsUsed` from pack id witnesses (`snapshotNovaPackPermissionsUsed`).
- Download re-checks those witnesses; revoked perm → 403.
- Money reports use deterministic `*Inr` display strings in metrics/tables; charts use numeric values from the same skill facts (no LLM-invented totals).
- Self/team/all scopes for advances, expenses, attendance, KPI, leave, OT, regularisation, salary must not widen on report intent.
- Bank / CBG / GST docs / projects / GSTR / credit notes / party outstanding / PO hide money or balances when the matching visibility gate fails.

## Fallback

If a module is not wired and the user clearly asked for a report/PDF/chart, prefer an explicit not-wired message (`NOVA_REPORT_NOT_WIRED_MESSAGE`) over silent chat-only. Wired modules always return a pack or a deny. Empty sample rows still produce a ready pack (`isEmptySkillReportPack` helper).

## Tests

- `src/lib/nova/reports/skill-report.test.ts` — intent detection, pack builder, PDF tables
- `src/lib/nova/reports/skill-report-tip2.test.ts` — tip-2 pack ids + intent phrases
- `src/lib/nova/reports/skill-report-tip3.test.ts` — receipts + payment requests pack ids
- `src/lib/nova/reports/skill-report-tip4.test.ts` — directory/bank/GST/delivery-status pack ids + empty pack
- `src/lib/nova/reports/skill-report-tip5.test.ts` — GSTR/HR/SO/PO/GRN/CN/party outstanding pack ids + RBAC floors
- `src/lib/ai/nova.test.ts` — delivery + receivables end-to-end pack exposure
- `src/lib/nova/skills/finance/profitability.report.test.ts` — P&L report pack
- `src/lib/nova/skills/finance/receivables.report.test.ts` — receivables report pack
- `src/lib/nova/skills/hr/staff.report.test.ts` — staff directory report pack
- `src/lib/nova/skills/finance/party-directory.report.test.ts` — customers + vendors report packs
- `src/lib/nova/reports/report-plane.test.ts` — delivery PDF legacy path
