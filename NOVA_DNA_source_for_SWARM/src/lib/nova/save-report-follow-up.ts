/**
 * Chat follow-up: "save report" / "give report" → NOVA pack snapshot save,
 * never ERP reports_snapshot / GSTR skills.
 */

import type { NovaPackResult } from "@/lib/nova/pack-result";
import {
  isNovaLastSavablePackExpired,
  NOVA_LAST_SAVABLE_PACK_TTL_MS,
  type NovaDialogState,
} from "@/lib/nova/dialog-state";

export const NOVA_SAVEABLE_PACK_IDS = [
  "month_performance",
  "project_command",
  "collection_attention",
  "attendance_month",
  "cash_banking",
  "delivery_delay_report",
  "receivables_report",
  "staff_advances_report",
  "staff_expense_report",
  "project_pl_report",
  "attendance_late_report",
  "kpi_trend_report",
  "tasks_report",
  "sales_billing_report",
  "purchase_stock_report",
  "tally_summary_report",
  "receipts_report",
  "payment_requests_report",
  "staff_directory_report",
  "customers_report",
  "vendors_report",
  "bank_recon_report",
  "bank_accounts_report",
  "gst_docs_report",
  "cbg_quotations_report",
  "projects_portfolio_report",
  "delivery_status_report",
  "gstr_report",
  "leave_report",
  "overtime_report",
  "regularisation_report",
  "salary_report",
  "sales_orders_report",
  "purchase_orders_report",
  "grn_report",
  "credit_notes_report",
  "party_outstanding_report",
] as const;

export type NovaSaveablePackId = (typeof NOVA_SAVEABLE_PACK_IDS)[number];

export const NOVA_SAVE_REPORT_CLARIFY =
  "Save report works after NOVA attaches a pack — director packs (**Month / Project / Collection / Attendance / Cash / Delivery delay**) or module PDF/chart packs (receivables, receipts, sales, …).\n\nAsk with **report**, **PDF**, or **with charts**, then tap **Save report** (or say “save report” again).";

export const NOVA_SAVEABLE_PACK_HINT =
  "For a savable pack ask: **How is this month going?**, **receivables report with charts**, or **delivery delay report**.";

/** Phrases users use when they mean “freeze the last NOVA pack”, not ERP /reports. */
export function isNovaSaveReportFollowUp(query: string): boolean {
  const t = query
    .trim()
    .toLowerCase()
    .replace(/[!?.,…]+$/g, "")
    .replace(/\s+/g, " ");
  if (!t || t.length > 80) return false;

  // Typos: report/reprot/raport; give/giv; download/donwload
  if (
    /^(please\s+)?(save|giv+|give|download|donwload|dl)\s+(me\s+)?(a\s+|the\s+|this\s+)?(report|reprot|raport|pdf)s?$/.test(
      t
    )
  ) {
    return true;
  }
  if (/^(please\s+)?(save|download|donwload)\s+this(\s+(one|pack|answer|snapshot))?$/.test(t)) {
    return true;
  }
  if (/^(please\s+)?(save|download)\s+(the\s+)?(pack|snapshot)$/.test(t)) {
    return true;
  }
  // Soft phrasing still clearly about persisting, not opening ERP registers
  if (
    /^(can\s+(you|u)\s+)?(please\s+)?(save|download)\s+(me\s+)?(a\s+|the\s+|this\s+)?(report|reprot|raport|pdf)s?\??$/.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

export function isNovaSaveablePackId(id: string | null | undefined): id is NovaSaveablePackId {
  return Boolean(id && (NOVA_SAVEABLE_PACK_IDS as readonly string[]).includes(id));
}

export function dialogHasRecentSaveablePack(
  state: NovaDialogState | null | undefined,
  opts?: { now?: Date; maxAgeMs?: number }
): boolean {
  return recentSaveablePackFromDialog(state, opts) != null;
}

export function recentSaveablePackFromDialog(
  state: NovaDialogState | null | undefined,
  opts?: { now?: Date; maxAgeMs?: number }
): { pack: NovaPackResult; narrative: string } | null {
  const snap = state?.lastSavablePack;
  if (!snap?.pack || !isNovaSaveablePackId(snap.pack.packId)) return null;
  const now = opts?.now ?? new Date();
  const maxAge = opts?.maxAgeMs ?? NOVA_LAST_SAVABLE_PACK_TTL_MS;
  if (isNovaLastSavablePackExpired(snap, now, maxAge)) return null;
  return {
    pack: snap.pack,
    narrative: typeof snap.narrative === "string" ? snap.narrative : "",
  };
}

export function titleForNovaSaveablePack(pack: NovaPackResult): string {
  if (pack.packId === "month_performance") {
    return `Month performance — ${pack.period?.label ?? "period"}`;
  }
  if (pack.packId === "project_command") {
    return `Project command — ${pack.period?.label ?? "scope"}`;
  }
  if (pack.packId === "collection_attention") {
    return `Collection attention — ${pack.period?.label ?? "scope"}`;
  }
  if (pack.packId === "attendance_month") {
    return `Attendance month — ${pack.period?.label ?? "period"}`;
  }
  if (pack.packId === "cash_banking") {
    return `Cash / banking — ${pack.period?.label ?? "period"}`;
  }
  if (pack.packId === "delivery_delay_report") {
    return `Delivery delay report — ${pack.period?.label ?? "scope"}`;
  }
  if (pack.packId === "receivables_report") {
    return `Receivables report — ${pack.period?.label ?? "scope"}`;
  }
  if (pack.packId === "receipts_report") {
    return `Receipts report — ${pack.period?.label ?? "period"}`;
  }
  if (pack.packId === "payment_requests_report") {
    return `Payment requests report — ${pack.period?.label ?? "scope"}`;
  }
  if (pack.packId === "staff_advances_report") {
    return `Staff advances report — ${pack.period?.label ?? "scope"}`;
  }
  if (pack.packId === "staff_expense_report") {
    return `Staff expenses report — ${pack.period?.label ?? "period"}`;
  }
  if (pack.packId === "project_pl_report") {
    return `Project P&L report — ${pack.period?.label ?? "scope"}`;
  }
  if (pack.packId === "attendance_late_report") {
    return `Attendance late report — ${pack.period?.label ?? "period"}`;
  }
  if (pack.packId === "kpi_trend_report") {
    return `KPI report — ${pack.period?.label ?? "period"}`;
  }
  if (pack.packId === "tasks_report") {
    return `Tasks report — ${pack.period?.label ?? "scope"}`;
  }
  if (pack.packId === "sales_billing_report") {
    return `Sales billing report — ${pack.period?.label ?? "period"}`;
  }
  if (pack.packId === "purchase_stock_report") {
    return `Purchase / stock report — ${pack.period?.label ?? "scope"}`;
  }
  if (pack.packId === "tally_summary_report") {
    return `Tally status report — ${pack.period?.label ?? "scope"}`;
  }
  if (pack.packId === "staff_directory_report") {
    return `Staff directory report — ${pack.period?.label ?? "scope"}`;
  }
  if (pack.packId === "customers_report") {
    return `Customers report — ${pack.period?.label ?? "scope"}`;
  }
  if (pack.packId === "vendors_report") {
    return `Vendors report — ${pack.period?.label ?? "scope"}`;
  }
  if (pack.packId === "bank_recon_report") {
    return `Bank reconciliation report — ${pack.period?.label ?? "scope"}`;
  }
  if (pack.packId === "bank_accounts_report") {
    return `Bank accounts report — ${pack.period?.label ?? "scope"}`;
  }
  if (pack.packId === "gst_docs_report") {
    return `GST documents report — ${pack.period?.label ?? "scope"}`;
  }
  if (pack.packId === "cbg_quotations_report") {
    return `CBG quotations report — ${pack.period?.label ?? "period"}`;
  }
  if (pack.packId === "projects_portfolio_report") {
    return `Projects portfolio report — ${pack.period?.label ?? "period"}`;
  }
  if (pack.packId === "delivery_status_report") {
    return `Delivery status report — ${pack.period?.label ?? "scope"}`;
  }
  if (pack.packId === "gstr_report") {
    return `GSTR report — ${pack.period?.label ?? "period"}`;
  }
  if (pack.packId === "leave_report") {
    return `Leave report — ${pack.period?.label ?? "period"}`;
  }
  if (pack.packId === "overtime_report") {
    return `Overtime report — ${pack.period?.label ?? "scope"}`;
  }
  if (pack.packId === "regularisation_report") {
    return `Regularisation report — ${pack.period?.label ?? "scope"}`;
  }
  if (pack.packId === "salary_report") {
    return `Salary report — ${pack.period?.label ?? "period"}`;
  }
  if (pack.packId === "sales_orders_report") {
    return `Sales orders report — ${pack.period?.label ?? "scope"}`;
  }
  if (pack.packId === "purchase_orders_report") {
    return `Purchase orders report — ${pack.period?.label ?? "scope"}`;
  }
  if (pack.packId === "grn_report") {
    return `GRN report — ${pack.period?.label ?? "period"}`;
  }
  if (pack.packId === "credit_notes_report") {
    return `Credit notes report — ${pack.period?.label ?? "period"}`;
  }
  if (pack.packId === "party_outstanding_report") {
    return `Party outstanding report — ${pack.period?.label ?? "scope"}`;
  }
  return `${pack.packId} report`;
}

/** Append hint after non-pack money answers (e.g. FY sales). */
export function withNovaSavablePackHint(answer: string, toolsUsed: string[]): string {
  const moneyOnly =
    toolsUsed.includes("sales_summary") ||
    toolsUsed.includes("receipts_summary") ||
    toolsUsed.includes("receivables_summary");
  const isPack = toolsUsed.some((t) => isNovaSaveablePackId(t));
  if (!moneyOnly || isPack) return answer;
  if (/savable (?:director )?pack/i.test(answer)) return answer;
  return `${answer.trim()}\n\n_${NOVA_SAVEABLE_PACK_HINT}_`;
}
