/**
 * NI-01 — single source of truth: toolId → RBAC permission floor (any-of).
 *
 * Consumed by:
 * - `nova-suggest` (`novaCanRunTool` / suggest chips)
 * - `nova-lexicon` (topic soft/hard-deny rows)
 * - skill registry metadata
 *
 * Handler `can(...)` checks remain defense-in-depth. Extra gates
 * (org-finance aggregates, vendor-bank SoD, backup flag, admin roles)
 * live beside the floor in `novaCanRunTool`.
 */
import type { Permission } from "@/lib/rbac";

/** Tools → minimum permissions (any match allows the tool to be selected). */
export const NOVA_TOOL_PERMISSIONS: Record<string, Permission[]> = {
  sales_summary: ["invoice.read"],
  receipts_summary: ["receipt.read"],
  overdue_invoices: ["invoice.read"],
  collection_delay_estimate: ["invoice.read"],
  pending_workflow_counts: ["paymentrequest.read", "purchasebill.read", "approval.read.self"],
  projects_summary: ["project.read"],
  staff_expense_summary: ["accounts.dashboard.read", "accounts.read", "accounts.reports.read"],
  kpi_summary: ["kpi.read.self", "kpi.read.team", "kpi.read.all"],
  kpi_report: ["kpi.read.self", "kpi.read.team", "kpi.read.all"],
  purchase_bills_summary: ["purchasebill.read"],
  bank_recon_summary: ["bank.reconcile", "bank.read"],
  receivables_summary: ["invoice.read"],
  tasks_summary: ["task.read.self"],
  attendance_late_summary: ["hr.attendance.read", "hr.attendance.team", "hr.punch.self"],
  stock_summary: ["stock.read"],
  delivery_summary: ["delivery.read"],
  vendors_summary: ["vendor.read"],
  payment_requests_summary: ["paymentrequest.read", "paymentrequest.create"],
  /** Entity 360 record lookup — self-scoped via paymentRequestListWhereForUser, so NOT an org-finance aggregate. */
  entity_360: ["paymentrequest.read", "paymentrequest.create"],
  customers_summary: ["customer.read"],
  staff_summary: ["staff.read", "hr.employee.read"],
  leave_summary: [
    "hr.leave.create",
    "hr.leave.read",
    "hr.leave.approve",
    "hr.attendance.team",
    "hr.attendance.read",
  ],
  overtime_summary: [
    "hr.overtime.read",
    "hr.overtime.approve",
    "hr.overtime.create",
    "hr.attendance.team",
  ],
  regularisation_summary: [
    "hr.regularisation.read",
    "hr.regularisation.approve",
    "hr.regularisation.create",
    "hr.attendance.team",
  ],
  staff_advances_summary: [
    "staffadvance.read",
    "staffadvance.self.create",
    "staffadvance.self.settle",
  ],
  sales_orders_summary: ["salesorder.read"],
  purchase_orders_summary: ["purchaseorder.read"],
  purchase_requests_summary: ["purchaserequest.read", "purchaserequest.create"],
  approvals_summary: ["approval.read.self", "approval.read.team", "approval.read.all"],
  bank_accounts_summary: ["bank.read"],
  incentives_summary: ["incentive.read.self", "incentive.read.team", "incentive.read.all"],
  cbg_quotations_summary: ["cbgquotation.read"],
  my_work_summary: ["task.read.self", "kpi.read.self", "hr.leave.create", "ai.assistant.read"],
  daily_brief: ["ai.assistant.read"],
  proactive_insights: ["ai.assistant.read"],
  /** Floor — `novaCanRunTool` also requires a domain-read (kpi/task/AR/attendance/project). */
  nova_analysis: ["ai.assistant.read"],
  nova_trend: ["ai.assistant.read"],
  collection_attention: ["invoice.read", "receipt.read"],
  month_performance: ["ai.assistant.read"],
  attendance_month: ["hr.attendance.read", "hr.attendance.team", "hr.punch.self"],
  cash_banking: ["bank.read"],
  project_command: ["project.read"],
  delivery_delay_report: ["delivery.read"],
  receivables_report: ["invoice.read"],
  staff_advances_report: [
    "staffadvance.read",
    "staffadvance.self.create",
    "staffadvance.self.settle",
  ],
  staff_expense_report: ["accounts.dashboard.read", "accounts.read", "accounts.reports.read"],
  project_pl_report: ["project.profitability.view"],
  attendance_late_report: ["hr.attendance.read", "hr.attendance.team", "hr.punch.self"],
  kpi_trend_report: ["kpi.read.self", "kpi.read.team", "kpi.read.all"],
  tasks_report: ["task.read.self"],
  sales_billing_report: ["invoice.read"],
  purchase_stock_report: ["purchasebill.read", "stock.read", "purchaseorder.read"],
  tally_summary_report: ["tally.dashboard.view"],
  receipts_report: ["receipt.read"],
  payment_requests_report: ["paymentrequest.read", "paymentrequest.create"],
  staff_directory_report: ["staff.read", "hr.employee.read"],
  customers_report: ["customer.read"],
  vendors_report: ["vendor.read"],
  bank_recon_report: ["bank.reconcile", "bank.read"],
  bank_accounts_report: ["bank.read"],
  gst_docs_report: ["invoice.read"],
  cbg_quotations_report: ["cbgquotation.read"],
  projects_portfolio_report: ["project.read"],
  delivery_status_report: ["delivery.read"],
  gstr_report: ["reports.read", "invoice.read"],
  leave_report: [
    "hr.leave.create",
    "hr.leave.read",
    "hr.leave.approve",
    "hr.attendance.team",
    "hr.attendance.read",
  ],
  overtime_report: [
    "hr.overtime.read",
    "hr.overtime.approve",
    "hr.overtime.create",
    "hr.attendance.team",
  ],
  regularisation_report: [
    "hr.regularisation.read",
    "hr.regularisation.approve",
    "hr.regularisation.create",
    "hr.attendance.team",
  ],
  salary_report: ["hr.salary.read", "hr.payslip.read", "hr.payslip.self"],
  sales_orders_report: ["salesorder.read"],
  purchase_orders_report: ["purchaseorder.read"],
  grn_report: ["stock.read", "purchaseorder.read", "purchaserequest.read"],
  credit_notes_report: ["invoice.read"],
  party_outstanding_report: ["invoice.read"],
  cbg_pipeline: ["cbgquotation.read"],
  project_health: ["project.read"],
  salary_summary: ["hr.salary.read", "hr.payslip.read", "hr.payslip.self"],
  accounts_snapshot: ["accounts.dashboard.read", "accounts.reports.read"],
  tally_status: ["tally.dashboard.view"],
  grn_summary: ["stock.read", "purchaseorder.read", "purchaserequest.read"],
  credit_notes_summary: ["invoice.read"],
  order_book_summary: ["project.read", "salesorder.read", "director.dashboard"],
  director_dashboard_summary: [
    "director.dashboard",
    "finance.dashboard.read",
    "accounts.dashboard.read",
  ],
  reports_snapshot: ["reports.read"],
  gstr_snapshot: ["reports.read", "invoice.read"],
  gst_docs_summary: ["invoice.read"],
  profitability_summary: ["project.profitability.view"],
  customer_outstanding: ["invoice.read"],
  /** Hub entry — module row ACL remains in readableDocumentModules */
  documents_open: ["documents.read"],
  /** Phase E — permission-filtered metadata search; fail closed without documents.read */
  documents_search: ["documents.read"],
  /** NOVA Pulse — recorded change facts; task ACL / doc ACL applied in handler */
  nova_pulse_search: ["task.read.self", "documents.read"],
  settings_open: ["settings.write"],
  /** Personal theme/language — `/settings/appearance` is ungated for all signed-in users. */
  appearance_open: ["ai.assistant.read"],
  vendor_bank_open: ["vendorbank.read", "bank.viewfullaccount"],
  notifications_open: ["ai.assistant.read"],
  whatsapp_open: ["whatsapp.read"],
  portal_open: ["portal.read"],
  automation_open: ["automation.read"],
  links_open: ["links.read"],
  bank_sms_open: ["bank.sms.read"],
  /** Floor only — `novaCanRunTool` also requires canViewBackupHistory. */
  backup_open: ["director.dashboard"],
  /** Floor only — `novaCanRunTool` also requires ADMIN/SUPER_ADMIN/DIRECTOR. */
  system_tools_open: ["director.dashboard"],
  audit_log_open: ["audit.read"],
  search_entities: ["ai.assistant.read"],
};

/**
 * Money / org-finance tools: permission floor alone is not enough —
 * also require `canViewOrgFinanceAggregates` (Staff money-hide).
 * Exceptions for director-only tools are applied in `novaCanRunTool`.
 */
export const NOVA_ORG_FINANCE_TOOL_IDS = new Set<string>([
  "sales_summary",
  "receipts_summary",
  "receivables_summary",
  "purchase_bills_summary",
  "overdue_invoices",
  "collection_delay_estimate",
  "credit_notes_summary",
  "reports_snapshot",
  "gstr_snapshot",
  "gst_docs_summary",
  "customer_outstanding",
  "collection_attention",
  "month_performance",
  "cash_banking",
  "project_command",
  "profitability_summary",
  "order_book_summary",
  "director_dashboard_summary",
  /** Staff money-hide — permission floor alone was leaking org totals */
  "staff_expense_summary",
  "bank_accounts_summary",
  "bank_recon_summary",
  "purchase_orders_summary",
  "accounts_snapshot",
  "purchase_requests_summary",
  /** CBG samples expose costInr / totalProjectCost */
  "cbg_quotations_summary",
  "cbg_quotations_report",
  "gst_docs_report",
  "bank_accounts_report",
  "bank_recon_report",
  "gstr_report",
  "credit_notes_report",
  "party_outstanding_report",
  "purchase_orders_report",
]);

export function novaPermissionsForTool(toolId: string): Permission[] {
  const perms = NOVA_TOOL_PERMISSIONS[toolId];
  return perms ? [...perms] : [];
}

/** Stable unique union of permission floors across tools (lexicon multi-tool topics). */
export function novaPermissionsForTools(toolIds: string[]): Permission[] {
  const seen = new Set<Permission>();
  const out: Permission[] = [];
  for (const id of toolIds) {
    for (const p of novaPermissionsForTool(id)) {
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

export function novaToolRequiresOrgFinance(toolId: string): boolean {
  return NOVA_ORG_FINANCE_TOOL_IDS.has(toolId);
}

/** Sorted copy for drift assertions (order-independent compare). */
export function sortedPermKeys(perms: readonly string[]): string[] {
  return [...perms].map(String).sort();
}
