/**
 * Analysis module registry — P0 loaders live; P1/P2 planned rows (no loader yet).
 */
import type { NovaAnalysisModuleDef } from "@/lib/nova/analysis/module-contract";
import { isNovaAnalysisModuleLive } from "@/lib/nova/analysis/module-contract";
import type { NovaAnalysisDomain } from "@/lib/nova/analysis/factor-schema";
import {
  loadAttendanceAnalysisBundle,
  loadKpiAnalysisBundle,
  loadOutstandingAnalysisBundle,
  loadProjectAnalysisBundle,
  loadTasksAnalysisBundle,
} from "@/lib/nova/analysis/loaders";

export const NOVA_ANALYSIS_MODULES: readonly NovaAnalysisModuleDef[] = [
  // —— P0 shipped ——
  {
    id: "kpi",
    label: "KPI report-card",
    priority: "shipped",
    sourceToolIds: ["kpi_report", "kpi_summary"],
    cues: ["why is my kpi low", "kpi analysis", "explain kpi"],
    rbacNote: "canViewKpiScorecard (kpi.read.all / team / self)",
    load: loadKpiAnalysisBundle,
  },
  {
    id: "tasks",
    label: "Tasks overdue",
    priority: "shipped",
    sourceToolIds: ["tasks_summary"],
    cues: ["why overdue", "why are tasks overdue", "why are {entity} tasks overdue"],
    rbacNote: "task.read.self (+ skill team/org mode)",
    load: loadTasksAnalysisBundle,
  },
  {
    id: "outstanding",
    label: "AR / outstanding",
    priority: "shipped",
    sourceToolIds: ["customer_outstanding", "overdue_invoices", "receipts_summary"],
    cues: ["why outstanding", "why is outstanding high", "why receivables"],
    rbacNote: "invoice.read + canViewOrgFinanceAggregates; receipts need receipt.read",
    load: loadOutstandingAnalysisBundle,
  },
  {
    id: "attendance",
    label: "Attendance",
    priority: "shipped",
    sourceToolIds: ["attendance_late_summary"],
    cues: ["attendance analysis", "why so many late", "why late"],
    rbacNote: "via attendance_late_summary can()",
    load: loadAttendanceAnalysisBundle,
  },
  {
    id: "project",
    label: "Project",
    priority: "shipped",
    sourceToolIds: ["tasks_summary", "projects_summary"],
    cues: ["analyze this project", "project analysis"],
    rbacNote: "project.read and/or task.read.self",
    load: loadProjectAnalysisBundle,
  },

  // —— P1 planned ——
  {
    id: "approvals",
    label: "Approvals queue",
    priority: "P1",
    sourceToolIds: ["approvals_summary"],
    cues: ["why approvals stuck", "approval analysis"],
    rbacNote: "approval.read.self / team / all",
  },
  {
    id: "leave",
    label: "Leave",
    priority: "P1",
    sourceToolIds: ["leave_summary"],
    cues: ["why leave pending", "leave analysis"],
    rbacNote: "hr.leave.* / attendance.team",
  },
  {
    id: "delivery",
    label: "Delivery",
    priority: "P1",
    sourceToolIds: ["delivery_summary"],
    cues: ["why deliveries delayed", "delivery analysis"],
    rbacNote: "delivery.read",
  },
  {
    id: "stock",
    label: "Stock",
    priority: "P1",
    sourceToolIds: ["stock_summary"],
    cues: ["why low stock", "stock analysis"],
    rbacNote: "stock.read",
  },
  {
    id: "bank_recon",
    label: "Bank reconciliation",
    priority: "P1",
    sourceToolIds: ["bank_recon_summary"],
    cues: ["why unreconciled", "bank recon analysis"],
    rbacNote: "bank.reconcile / bank.read + money-hide where applicable",
  },
  {
    id: "incentives",
    label: "Incentives",
    priority: "P1",
    sourceToolIds: ["incentives_summary"],
    cues: ["why incentives unpaid", "incentive analysis"],
    rbacNote: "incentive.read.self / team / all",
  },
  {
    id: "sales",
    label: "Sales / billing",
    priority: "P1",
    sourceToolIds: ["sales_summary"],
    cues: ["why sales low", "billing analysis"],
    rbacNote: "invoice.read + org finance aggregates",
  },
  {
    id: "collection",
    label: "Collection attention",
    priority: "P1",
    sourceToolIds: ["collection_attention"],
    cues: ["collection analysis", "why collections slow"],
    rbacNote: "invoice.read + receipt.read",
  },

  // —— P2 planned ——
  {
    id: "salary",
    label: "Salary / payroll",
    priority: "P2",
    sourceToolIds: ["salary_summary"],
    cues: ["salary analysis", "why payroll blocked"],
    rbacNote: "hr.salary.read / payslip.* — no Staff money leak",
  },
  {
    id: "grn",
    label: "GRN",
    priority: "P2",
    sourceToolIds: ["grn_summary"],
    cues: ["grn analysis", "why grn pending"],
    rbacNote: "stock/PO/PR read; period usually required",
  },
  {
    id: "purchase",
    label: "Purchase",
    priority: "P2",
    sourceToolIds: ["purchase_orders_summary", "purchase_bills_summary"],
    cues: ["purchase analysis", "why bills pending"],
    rbacNote: "purchaseorder / purchasebill read",
  },
  {
    id: "gst",
    label: "GST",
    priority: "P2",
    sourceToolIds: ["gstr_snapshot", "gst_docs_summary"],
    cues: ["gst analysis", "why gstr gaps"],
    rbacNote: "reports.read / invoice.read",
  },
  {
    id: "cash_banking",
    label: "Cash & banking pack",
    priority: "P2",
    sourceToolIds: ["cash_banking"],
    cues: ["cash banking analysis"],
    rbacNote: "bank.read",
  },
  {
    id: "month_performance",
    label: "Month performance",
    priority: "P2",
    sourceToolIds: ["month_performance"],
    cues: ["why month soft", "month analysis"],
    rbacNote: "ai.assistant.read + pack internal ACL",
  },
  {
    id: "documents",
    label: "Documents",
    priority: "P2",
    sourceToolIds: ["documents_search"],
    cues: ["document analysis"],
    rbacNote: "documents.read — metadata only",
  },
];

export function listNovaAnalysisModules(): readonly NovaAnalysisModuleDef[] {
  return NOVA_ANALYSIS_MODULES;
}

export function listShippedNovaAnalysisModules(): NovaAnalysisModuleDef[] {
  return NOVA_ANALYSIS_MODULES.filter(isNovaAnalysisModuleLive);
}

export function getNovaAnalysisModule(
  id: string
): NovaAnalysisModuleDef | undefined {
  return NOVA_ANALYSIS_MODULES.find((m) => m.id === id);
}

export function resolveNovaAnalysisModuleForDomain(
  domain: NovaAnalysisDomain | string
): NovaAnalysisModuleDef | undefined {
  const hit = getNovaAnalysisModule(domain);
  if (hit && isNovaAnalysisModuleLive(hit)) return hit;
  if (domain === "generic") return getNovaAnalysisModule("kpi");
  return hit;
}
