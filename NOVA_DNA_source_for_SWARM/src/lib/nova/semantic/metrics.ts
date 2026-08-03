/**
 * NOVA metrics dictionary v1 — lean contracts for plans / evals / recipes.
 * Required fields: emptyMeaning, sourceOfTruth, deterministicRequired.
 */

export type NovaMetricUnit =
  | "inr"
  | "count"
  | "days"
  | "ratio"
  | "timestamp"
  | "status"
  | "text";

export type NovaMetricPeriodRule =
  | "day"
  | "month"
  | "fy"
  | "rolling"
  | "point_in_time"
  | "none";

export type NovaMetricRbacClass =
  | "money"
  | "hr_sensitive"
  | "ops"
  | "system"
  | "public_meta";

export type NovaMetricDefinition = {
  id: string;
  /** Human label for evals / findings */
  label: string;
  unit: NovaMetricUnit;
  periodRule: NovaMetricPeriodRule;
  /** What NOVA must say when the skill returns empty / zero */
  emptyMeaning: string;
  /** Authoritative skill(s) or ERP surface — never "LLM" */
  sourceOfTruth: string;
  /** If true, preferDeterministic / COUNT_FIRST path; LLM may not recalculate */
  deterministicRequired: boolean;
  rbacClass: NovaMetricRbacClass;
  sourceToolIds: string[];
  currencyMode?: "inr_only" | "native";
  freshnessSla?: string;
};

function m(
  partial: NovaMetricDefinition
): NovaMetricDefinition {
  return partial;
}

/** Canonical metrics for daily_brief packs + collection_attention (+ related BIOPOWER). */
export const NOVA_METRICS: readonly NovaMetricDefinition[] = [
  m({
    id: "sales.period_total",
    label: "Sales (period total)",
    unit: "inr",
    periodRule: "month",
    emptyMeaning: "No posted sales invoices in this period.",
    sourceOfTruth: "sales_summary skill (SalesInvoice aggregates)",
    deterministicRequired: true,
    rbacClass: "money",
    sourceToolIds: ["sales_summary"],
    currencyMode: "inr_only",
  }),
  m({
    id: "receipts.period_collected",
    label: "Receipts collected",
    unit: "inr",
    periodRule: "month",
    emptyMeaning: "No posted receipts in this period.",
    sourceOfTruth: "receipts_summary skill (SalesReceipt aggregates)",
    deterministicRequired: true,
    rbacClass: "money",
    sourceToolIds: ["receipts_summary"],
    currencyMode: "inr_only",
  }),
  m({
    id: "ar.customer_outstanding",
    label: "Customer outstanding",
    unit: "inr",
    periodRule: "point_in_time",
    emptyMeaning: "No open receivable balance for this filter.",
    sourceOfTruth: "customer_outstanding skill (getReceivables)",
    deterministicRequired: true,
    rbacClass: "money",
    sourceToolIds: ["customer_outstanding"],
    currencyMode: "inr_only",
  }),
  m({
    id: "ar.overdue_invoice_count",
    label: "Overdue invoices",
    unit: "count",
    periodRule: "point_in_time",
    emptyMeaning: "No overdue invoices.",
    sourceOfTruth: "overdue_invoices skill (SalesInvoice)",
    deterministicRequired: true,
    rbacClass: "money",
    sourceToolIds: ["overdue_invoices"],
  }),
  m({
    id: "ar.receivables_open",
    label: "Open receivables",
    unit: "inr",
    periodRule: "point_in_time",
    emptyMeaning: "No open receivables.",
    sourceOfTruth: "receivables_summary skill",
    deterministicRequired: true,
    rbacClass: "money",
    sourceToolIds: ["receivables_summary"],
    currencyMode: "inr_only",
  }),
  m({
    id: "pr.awaiting_action",
    label: "Payment requests awaiting action",
    unit: "count",
    periodRule: "point_in_time",
    emptyMeaning: "No payment requests awaiting action.",
    sourceOfTruth: "payment_requests_summary skill",
    deterministicRequired: true,
    rbacClass: "money",
    sourceToolIds: ["payment_requests_summary"],
  }),
  m({
    id: "accounts.snapshot",
    label: "Accounts snapshot",
    unit: "status",
    periodRule: "point_in_time",
    emptyMeaning: "Accounts snapshot unavailable.",
    sourceOfTruth: "accounts_snapshot skill",
    deterministicRequired: true,
    rbacClass: "money",
    sourceToolIds: ["accounts_snapshot"],
  }),
  m({
    id: "order_book.position",
    label: "Order book",
    unit: "inr",
    periodRule: "fy",
    emptyMeaning: "No order-book position for this FY.",
    sourceOfTruth: "order_book_summary skill",
    deterministicRequired: true,
    rbacClass: "money",
    sourceToolIds: ["order_book_summary"],
    currencyMode: "inr_only",
  }),
  m({
    id: "sales_orders.count",
    label: "Sales orders",
    unit: "count",
    periodRule: "month",
    emptyMeaning: "No sales orders in this period.",
    sourceOfTruth: "sales_orders_summary skill",
    deterministicRequired: true,
    rbacClass: "ops",
    sourceToolIds: ["sales_orders_summary"],
  }),
  m({
    id: "purchase_orders.count",
    label: "Purchase orders",
    unit: "count",
    periodRule: "month",
    emptyMeaning: "No purchase orders in this period.",
    sourceOfTruth: "purchase_orders_summary skill",
    deterministicRequired: true,
    rbacClass: "ops",
    sourceToolIds: ["purchase_orders_summary"],
  }),
  m({
    id: "projects.active_count",
    label: "Active projects",
    unit: "count",
    periodRule: "fy",
    emptyMeaning: "No active projects in scope.",
    sourceOfTruth: "projects_summary skill",
    deterministicRequired: true,
    rbacClass: "ops",
    sourceToolIds: ["projects_summary"],
  }),
  m({
    id: "reports.snapshot",
    label: "Reports snapshot",
    unit: "status",
    periodRule: "month",
    emptyMeaning: "Reports snapshot empty for this period.",
    sourceOfTruth: "reports_snapshot skill",
    deterministicRequired: true,
    rbacClass: "money",
    sourceToolIds: ["reports_snapshot"],
  }),
  m({
    id: "profitability.snapshot",
    label: "Profitability",
    unit: "inr",
    periodRule: "month",
    emptyMeaning: "No profitability figures for this period.",
    sourceOfTruth: "profitability_summary skill",
    deterministicRequired: true,
    rbacClass: "money",
    sourceToolIds: ["profitability_summary"],
    currencyMode: "inr_only",
  }),
  m({
    id: "director.dashboard",
    label: "Director dashboard",
    unit: "status",
    periodRule: "point_in_time",
    emptyMeaning: "Director dashboard pack empty.",
    sourceOfTruth: "director_dashboard_summary skill",
    deterministicRequired: true,
    rbacClass: "money",
    sourceToolIds: ["director_dashboard_summary"],
  }),
  m({
    id: "attendance.period_overview",
    label: "Attendance (late/present/absent)",
    unit: "count",
    periodRule: "day",
    emptyMeaning: "No attendance rows for this period/focus.",
    sourceOfTruth: "attendance_late_summary skill (HrAttendanceDaily)",
    deterministicRequired: true,
    rbacClass: "hr_sensitive",
    sourceToolIds: ["attendance_late_summary"],
  }),
  m({
    id: "leave.summary",
    label: "Leave",
    unit: "count",
    periodRule: "point_in_time",
    emptyMeaning: "No leave balances / pending leave in scope.",
    sourceOfTruth: "leave_summary skill",
    deterministicRequired: true,
    rbacClass: "hr_sensitive",
    sourceToolIds: ["leave_summary"],
  }),
  m({
    id: "overtime.pending",
    label: "Pending overtime",
    unit: "count",
    periodRule: "point_in_time",
    emptyMeaning: "No pending overtime approvals.",
    sourceOfTruth: "overtime_summary skill",
    deterministicRequired: true,
    rbacClass: "hr_sensitive",
    sourceToolIds: ["overtime_summary"],
  }),
  m({
    id: "regularisation.pending",
    label: "Pending regularisation",
    unit: "count",
    periodRule: "point_in_time",
    emptyMeaning: "No pending regularisation requests.",
    sourceOfTruth: "regularisation_summary skill",
    deterministicRequired: true,
    rbacClass: "hr_sensitive",
    sourceToolIds: ["regularisation_summary"],
  }),
  m({
    id: "tasks.open",
    label: "Open tasks",
    unit: "count",
    periodRule: "point_in_time",
    emptyMeaning: "No open tasks in scope.",
    sourceOfTruth: "tasks_summary skill",
    deterministicRequired: true,
    rbacClass: "ops",
    sourceToolIds: ["tasks_summary"],
  }),
  m({
    id: "delivery.summary",
    label: "Deliveries",
    unit: "count",
    periodRule: "month",
    emptyMeaning: "No deliveries in this period.",
    sourceOfTruth: "delivery_summary skill",
    deterministicRequired: true,
    rbacClass: "ops",
    sourceToolIds: ["delivery_summary"],
  }),
  m({
    id: "stock.summary",
    label: "Stock",
    unit: "count",
    periodRule: "point_in_time",
    emptyMeaning: "No stock movements / items in scope.",
    sourceOfTruth: "stock_summary skill",
    deterministicRequired: true,
    rbacClass: "ops",
    sourceToolIds: ["stock_summary"],
  }),
  m({
    id: "kpi.summary",
    label: "KPI",
    unit: "status",
    periodRule: "month",
    emptyMeaning: "No KPI period / reviews available.",
    sourceOfTruth: "kpi_summary skill",
    deterministicRequired: true,
    rbacClass: "ops",
    sourceToolIds: ["kpi_summary"],
  }),
  m({
    id: "kpi.report_card",
    label: "KPI report card",
    unit: "status",
    periodRule: "month",
    emptyMeaning: "No KPI scorecard to explain.",
    sourceOfTruth: "kpi_report skill + buildKpiReportCard",
    deterministicRequired: true,
    rbacClass: "ops",
    sourceToolIds: ["kpi_report"],
  }),
  m({
    id: "my_work.summary",
    label: "My work",
    unit: "count",
    periodRule: "point_in_time",
    emptyMeaning: "Nothing assigned to you right now.",
    sourceOfTruth: "my_work_summary skill",
    deterministicRequired: true,
    rbacClass: "ops",
    sourceToolIds: ["my_work_summary"],
  }),
  m({
    id: "incentives.summary",
    label: "Incentives",
    unit: "count",
    periodRule: "month",
    emptyMeaning: "No incentives in scope.",
    sourceOfTruth: "incentives_summary skill",
    deterministicRequired: true,
    rbacClass: "hr_sensitive",
    sourceToolIds: ["incentives_summary"],
  }),
  m({
    id: "bank_recon.summary",
    label: "Bank reconciliation",
    unit: "count",
    periodRule: "month",
    emptyMeaning: "No recon rows for this period.",
    sourceOfTruth: "bank_recon_summary skill",
    deterministicRequired: true,
    rbacClass: "money",
    sourceToolIds: ["bank_recon_summary"],
  }),
  m({
    id: "expenses.staff",
    label: "Staff expenses",
    unit: "inr",
    periodRule: "month",
    emptyMeaning: "No staff expenses in this period.",
    sourceOfTruth: "staff_expense_summary skill",
    deterministicRequired: true,
    rbacClass: "money",
    sourceToolIds: ["staff_expense_summary"],
    currencyMode: "inr_only",
  }),
  m({
    id: "gstr.snapshot",
    label: "GSTR snapshot",
    unit: "status",
    periodRule: "month",
    emptyMeaning: "No GSTR snapshot data for this period.",
    sourceOfTruth: "gstr_snapshot skill",
    deterministicRequired: true,
    rbacClass: "money",
    sourceToolIds: ["gstr_snapshot"],
  }),
  m({
    id: "gst_docs.summary",
    label: "GST documents",
    unit: "count",
    periodRule: "month",
    emptyMeaning: "No e-invoice / e-way bill rows in scope.",
    sourceOfTruth: "gst_docs_summary skill",
    deterministicRequired: true,
    rbacClass: "money",
    sourceToolIds: ["gst_docs_summary"],
  }),
  m({
    id: "tally.connection_status",
    label: "Tally sync status",
    unit: "status",
    periodRule: "point_in_time",
    emptyMeaning: "No Tally connection configured.",
    sourceOfTruth: "tally_status skill",
    deterministicRequired: true,
    rbacClass: "system",
    sourceToolIds: ["tally_status"],
  }),
  m({
    id: "notifications.unread",
    label: "Notifications",
    unit: "count",
    periodRule: "point_in_time",
    emptyMeaning: "No unread notifications.",
    sourceOfTruth: "notifications_open skill",
    deterministicRequired: true,
    rbacClass: "public_meta",
    sourceToolIds: ["notifications_open"],
  }),
  m({
    id: "cbg.quotation_count",
    label: "CBG quotations",
    unit: "count",
    periodRule: "month",
    emptyMeaning: "No CBG quotations in this period.",
    sourceOfTruth: "cbg_quotations_summary skill",
    deterministicRequired: true,
    rbacClass: "ops",
    sourceToolIds: ["cbg_quotations_summary"],
  }),
];

const BY_ID = new Map(NOVA_METRICS.map((x) => [x.id, x]));

export function getNovaMetric(id: string): NovaMetricDefinition | undefined {
  return BY_ID.get(id);
}

export function listNovaMetrics(): readonly NovaMetricDefinition[] {
  return NOVA_METRICS;
}

/** Metrics that cite a given skill toolId. */
export function novaMetricsForToolId(toolId: string): NovaMetricDefinition[] {
  return NOVA_METRICS.filter((m) => m.sourceToolIds.includes(toolId));
}

/** Every toolId that must be covered for Gate A (daily_brief ∪ collection_attention). */
export function novaGateARequiredToolIds(
  dailyBriefToolIds: readonly string[],
  collectionAttentionToolIds: readonly string[] = [
    "customer_outstanding",
    "overdue_invoices",
    "receipts_summary",
  ]
): string[] {
  return [...new Set([...dailyBriefToolIds, ...collectionAttentionToolIds])];
}

export function novaMetricsCoverToolIds(toolIds: readonly string[]): {
  covered: string[];
  missing: string[];
} {
  const covered: string[] = [];
  const missing: string[] = [];
  for (const t of toolIds) {
    if (novaMetricsForToolId(t).length > 0) covered.push(t);
    else missing.push(t);
  }
  return { covered, missing };
}

export function assertNovaMetricContract(mdef: NovaMetricDefinition): string[] {
  const errors: string[] = [];
  if (!mdef.id) errors.push("id required");
  if (!mdef.label) errors.push("label required");
  if (!mdef.emptyMeaning) errors.push("emptyMeaning required");
  if (!mdef.sourceOfTruth || /llm/i.test(mdef.sourceOfTruth)) {
    errors.push("sourceOfTruth must be ERP/skill — never LLM");
  }
  if (typeof mdef.deterministicRequired !== "boolean") {
    errors.push("deterministicRequired required");
  }
  if (!mdef.sourceToolIds?.length) errors.push("sourceToolIds required");
  return errors;
}
