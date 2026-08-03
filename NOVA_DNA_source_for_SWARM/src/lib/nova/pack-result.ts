/**
 * Versioned NovaPackResult — common schema driving narration, Findings, charts, PDF/CSV, evals.
 * Packs compose facts → findings → attentions → chart bindings; never invent ledger rows.
 */

import type { NovaFinding } from "@/lib/nova/recipes/finding";
import type { NovaToolFact, NovaToolLink } from "@/lib/nova/core/tool-types";
import {
  NOVA_MONTH_ATTENTION_PRIMARY_MAX,
  NOVA_PACK_RESULT_SCHEMA_VERSION,
} from "@/lib/nova/invariants";

export type NovaPackId =
  | "month_performance"
  | "project_command"
  | "collection_attention"
  | "attendance_month"
  | "cash_banking"
  | "tasks_light"
  | "delivery_delay_report"
  | "receivables_report"
  | "staff_advances_report"
  | "staff_expense_report"
  | "project_pl_report"
  | "attendance_late_report"
  | "kpi_trend_report"
  | "tasks_report"
  | "sales_billing_report"
  | "purchase_stock_report"
  | "tally_summary_report"
  | "receipts_report"
  | "payment_requests_report"
  | "staff_directory_report"
  | "customers_report"
  | "vendors_report"
  | "bank_recon_report"
  | "bank_accounts_report"
  | "gst_docs_report"
  | "cbg_quotations_report"
  | "projects_portfolio_report"
  | "delivery_status_report"
  | "gstr_report"
  | "leave_report"
  | "overtime_report"
  | "regularisation_report"
  | "salary_report"
  | "sales_orders_report"
  | "purchase_orders_report"
  | "grn_report"
  | "credit_notes_report"
  | "party_outstanding_report";

export type NovaPackWarningCode =
  | "freshness"
  | "completeness"
  | "reconciliation"
  | "permission_omission";

export type NovaPackWarning = {
  code: NovaPackWarningCode;
  message: string;
  /** Skill / metric / object that triggered the warning */
  source?: string;
};

export type NovaPackChartBindingId = "kpi_strip" | "period_trend" | "ageing_or_attention";

export type NovaPackChartDataset = {
  bindingId: NovaPackChartBindingId;
  /** Certified / pack metric ids this chart is bound to */
  metricIds: string[];
  title: string;
  /** Frozen series for UI + report — not a live embed */
  points: Array<{ label: string; value: number; unit?: string }>;
};

/** Optional detail table frozen into the pack for PDF/CSV (display strings only). */
export type NovaPackTable = {
  id: string;
  title: string;
  columns: string[];
  /** Pre-formatted cell strings — never invent values at render time */
  rows: string[][];
};

export type NovaPackMetricRef = {
  metricId: string;
  /** Metric contract version string (drift-checked in Sprint 4) */
  version: string;
  certification?: "certified" | "draft" | "deprecated";
  value?: number | string | null;
  display?: string;
  periodLabel?: string;
};

export type NovaPackAttentions = {
  /** Up to NOVA_MONTH_ATTENTION_PRIMARY_MAX material findings; empty if nothing material */
  primary: NovaFinding[];
  /** Count of additional material findings beyond primary cap */
  overflowCount: number;
};

export type NovaPackPeriod = {
  label: string;
  grain: "day" | "week" | "month" | "fy" | "latest" | "open";
  /** calendar_month vs financial_year — never ambiguous in narration */
  calendarKind: "calendar_month" | "financial_year" | "rolling" | "point_in_time" | "day";
  source: "explicit" | "default" | "follow_up";
};

/**
 * Common pack result schema (v1).
 * Narration, Findings UI, charts, PDF/CSV, and evals all consume this shape.
 */
export type NovaPackResult = {
  schemaVersion: typeof NOVA_PACK_RESULT_SCHEMA_VERSION;
  packId: NovaPackId;
  packVersion: string;
  period: NovaPackPeriod;
  dataAsOf: string;
  metrics: NovaPackMetricRef[];
  facts: NovaToolFact[];
  findings: NovaFinding[];
  attentions: NovaPackAttentions;
  charts: NovaPackChartDataset[];
  /** Optional module detail tables for PDF (generic renderer) */
  tables?: NovaPackTable[];
  links: NovaToolLink[];
  warnings: NovaPackWarning[];
  /** Permission-filtered notes when a chapter was omitted */
  omittedNotes: string[];
  /** Deterministic narrative hints (LLM may polish under answer guards) */
  narrativeHints: string[];
};

export function emptyNovaPackAttentions(): NovaPackAttentions {
  return { primary: [], overflowCount: 0 };
}

/**
 * Select up to 3 primary attentions from material findings.
 * Nothing material → empty primary + overflow 0 (no theatre).
 */
export function selectNovaPackAttentions(
  materialFindings: NovaFinding[],
  maxPrimary = NOVA_MONTH_ATTENTION_PRIMARY_MAX
): NovaPackAttentions {
  const cap = Math.max(0, maxPrimary);
  if (!materialFindings.length) return emptyNovaPackAttentions();
  return {
    primary: materialFindings.slice(0, cap),
    overflowCount: Math.max(0, materialFindings.length - cap),
  };
}

export function buildNovaPackResult(
  input: Omit<NovaPackResult, "schemaVersion"> & { schemaVersion?: number }
): NovaPackResult {
  return {
    ...input,
    schemaVersion: NOVA_PACK_RESULT_SCHEMA_VERSION,
    attentions: input.attentions ?? emptyNovaPackAttentions(),
    charts: input.charts ?? [],
    tables: input.tables ?? [],
    warnings: input.warnings ?? [],
    omittedNotes: input.omittedNotes ?? [],
    narrativeHints: input.narrativeHints ?? [],
    findings: input.findings ?? [],
    metrics: input.metrics ?? [],
    facts: input.facts ?? [],
    links: input.links ?? [],
  };
}

/** Assert pack attentions obey the Month Performance rule (≤3 primary). */
export function assertNovaPackAttentions(attentions: NovaPackAttentions): string[] {
  const errors: string[] = [];
  if (attentions.primary.length > NOVA_MONTH_ATTENTION_PRIMARY_MAX) {
    errors.push(
      `attentions.primary length ${attentions.primary.length} exceeds max ${NOVA_MONTH_ATTENTION_PRIMARY_MAX}`
    );
  }
  if (attentions.overflowCount < 0) {
    errors.push("attentions.overflowCount must be >= 0");
  }
  return errors;
}
