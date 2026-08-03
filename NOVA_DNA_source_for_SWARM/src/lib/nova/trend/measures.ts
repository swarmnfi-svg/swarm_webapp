/**
 * NOVA Trend measure registry — universal catalog of measurable series.
 * Live adapters ship loaders; planned rows document the next SoT plugs.
 * Product rule: Trend is not money-only — any measurable item can register here.
 */

import type { NovaTrendDomain } from "@/lib/nova/trend/contract";

export type NovaTrendMeasureStatus = "live" | "planned";

export type NovaTrendMeasureDef = {
  id: string;
  domain: NovaTrendDomain;
  label: string;
  category: "people" | "money" | "ops" | "kpi" | "generic";
  status: NovaTrendMeasureStatus;
  /** Example user phrases. */
  examples: string[];
  sourceOfTruth: string;
  /** Adapter module when live. */
  adapter?: string;
};

/**
 * Canonical registry. Add a row before inventing an ad-hoc loader.
 * Future plugs: sales volume, collections, site visits, delivery SLA, stock-outs, …
 */
export const NOVA_TREND_MEASURE_REGISTRY: readonly NovaTrendMeasureDef[] = [
  {
    id: "attendance_late_frequency",
    domain: "attendance_late",
    label: "Late-comers (attendance)",
    category: "people",
    status: "live",
    examples: [
      "who is frequently late",
      "late comers trend last 30 days",
      "late punch trend",
      "attendance late over time",
    ],
    sourceOfTruth: "HrAttendanceDaily + isCredibleLateDay (attendance_late_summary / register)",
    adapter: "adapters/attendance-late.ts",
  },
  {
    id: "task_late_completion_frequency",
    domain: "task_late_completion",
    label: "Late task completions",
    category: "ops",
    status: "live",
    examples: [
      "who completes tasks after overdue most often",
      "task overdue completion trend this month",
    ],
    sourceOfTruth: "Task COMPLETED with completedAt after due calendar day",
    adapter: "adapters/task-late-completion.ts",
  },
  {
    id: "ar_overdue_trajectory",
    domain: "ar_aging",
    label: "AR overdue outstanding trajectory",
    category: "money",
    status: "live",
    examples: [
      "AR aging trend last 90 days",
      "customers whose outstanding is worsening",
      "receivables trend over time",
    ],
    sourceOfTruth: "SalesInvoice + receipts/CN/DN as-of bucket ends (receivables aging math)",
    adapter: "adapters/ar-aging.ts",
  },
  {
    id: "kpi_score_trajectory",
    domain: "kpi_score",
    label: "KPI score trajectory (person or org)",
    category: "kpi",
    status: "live",
    examples: [
      "KPI trend for Amit this quarter",
      "kpi score trend",
      "my kpi trajectory",
    ],
    sourceOfTruth: "KpiReview.totalScore by period (Staff report card SoT)",
    adapter: "adapters/kpi-score.ts",
  },
  {
    id: "kpi_high_score_streak",
    domain: "kpi_score",
    label: "Sustained high KPI streak",
    category: "kpi",
    status: "live",
    examples: [
      "who has high KPI for a long streak",
      "high kpi streak",
      "who stayed high kpi longest",
      "sustained high performers",
    ],
    sourceOfTruth: "Trailing consecutive KpiReview periods with totalScore ≥ 75 (Good+)",
    adapter: "adapters/kpi-score.ts",
  },
  {
    id: "sales_volume_trajectory",
    domain: "generic",
    label: "Sales volume over time",
    category: "money",
    status: "planned",
    examples: ["sales trend last quarter", "billing trend over time"],
    sourceOfTruth: "SalesInvoice period totals (when dedicated adapter ships)",
  },
  {
    id: "collections_trajectory",
    domain: "generic",
    label: "Collections / receipts over time",
    category: "money",
    status: "planned",
    examples: ["collections trend", "receipts over time"],
    sourceOfTruth: "SalesReceipt period totals",
  },
  {
    id: "site_visit_frequency",
    domain: "generic",
    label: "Site visit frequency",
    category: "ops",
    status: "planned",
    examples: ["site visit trend", "who visits sites most often"],
    sourceOfTruth: "Site visit / punch catalog skill when live",
  },
  {
    id: "delivery_lateness",
    domain: "generic",
    label: "Delivery lateness",
    category: "ops",
    status: "planned",
    examples: ["delivery late trend", "dispatch delay over time"],
    sourceOfTruth: "Delivery / dispatch SLA skill when live",
  },
  {
    id: "approvals_sla",
    domain: "generic",
    label: "Approvals SLA age",
    category: "ops",
    status: "planned",
    examples: ["approvals aging trend", "pending approval over time"],
    sourceOfTruth: "Approval queue age skill when live",
  },
  {
    id: "stock_out_frequency",
    domain: "generic",
    label: "Stock-out frequency",
    category: "ops",
    status: "planned",
    examples: ["stock out trend", "which items stock out most"],
    sourceOfTruth: "Inventory stock-out events when live",
  },
] as const;

export function listNovaTrendMeasures(status?: NovaTrendMeasureStatus): NovaTrendMeasureDef[] {
  if (!status) return [...NOVA_TREND_MEASURE_REGISTRY];
  return NOVA_TREND_MEASURE_REGISTRY.filter((m) => m.status === status);
}

export function findNovaTrendMeasure(id: string): NovaTrendMeasureDef | undefined {
  return NOVA_TREND_MEASURE_REGISTRY.find((m) => m.id === id);
}
