/**
 * Nova presentation modes — facts stay deterministic; chat wording is polished or hybrid.
 *
 * - deterministic_polished: professional cards/bullets (queues, registers) — no LLM
 * - hybrid_guarded: LLM narration from sanitized facts + answer guards → polished fallback
 * - deterministic_raw: mechanical template (tests/debug only)
 */

import type { NovaToolFact } from "@/lib/ai/nova-tools";
import { factsHaveHeadlineMoney } from "@/lib/ai/nova-money";

export type NovaPresentationMode =
  | "deterministic_polished"
  | "hybrid_guarded"
  | "deterministic_raw";

/** Queues / registers / count cards — polished deterministic, no LLM needed. */
export const NOVA_DETERMINISTIC_POLISHED_TOOLS = new Set([
  "payment_requests_summary",
  // Entity 360 record lookup — deterministic only; sensitive beneficiary details
  // must never be narrated by the LLM.
  "entity_360",
  "pending_workflow_counts",
  "customers_summary",
  "vendors_summary",
  "staff_summary",
  "approvals_summary",
  "purchase_requests_summary",
  "sales_orders_summary",
  "purchase_orders_summary",
  "leave_summary",
  "stock_summary",
  "overtime_summary",
  "regularisation_summary",
  "grn_summary",
  "incentives_summary",
  "kpi_report",
  "delivery_summary",
  "cbg_quotations_summary",
  "daily_brief",
  // Bank cards: polished ERP totals only — hybrid LLM often leads with operational
  // and omits book, which tripped answer_money_guard false positives.
  "bank_accounts_summary",
  "bank_recon_summary",
  // Health / money packs — same facts → same answer (P0 how-is)
  "sales_summary",
  "receipts_summary",
  "overdue_invoices",
  "receivables_summary",
  "customer_outstanding",
  "profitability_summary",
  "month_performance",
  "attendance_month",
  "cash_banking",
  "documents_open",
  "settings_open",
  "notifications_open",
  "whatsapp_open",
  "portal_open",
  "automation_open",
  "links_open",
  "bank_sms_open",
  "backup_open",
  "system_tools_open",
  "audit_log_open",
]);

/** Overviews / money / attendance summaries — hybrid when LLM configured. */
export const NOVA_HYBRID_GUARDED_TOOLS = new Set([
  "attendance_late_summary",
  "tasks_summary",
  "my_work_summary",
  "collection_delay_estimate",
  "staff_expense_summary",
  "projects_summary",
  "kpi_summary",
  "purchase_bills_summary",
  "collection_attention",
  "cbg_pipeline",
  "project_health",
  "project_command",
]);

const NAV_OPEN_SUFFIX = "_open";

function usableFacts(facts: NovaToolFact[]): NovaToolFact[] {
  return facts.filter((f) => f.ok && !f.denied && f.data);
}

function isNavOrResolve(tool: string): boolean {
  return (
    tool === "entity_resolve" ||
    tool === "person_resolve" ||
    tool === "search_entities" ||
    tool.endsWith(NAV_OPEN_SUFFIX)
  );
}

/**
 * Resolve how the answer should be presented for a fact pack.
 * Prefer polished for pure queue/register packs; hybrid for summaries/overviews.
 */
export function resolveNovaPresentationMode(
  facts: NovaToolFact[],
  opts?: { forceRaw?: boolean }
): NovaPresentationMode {
  if (opts?.forceRaw) return "deterministic_raw";

  const ok = usableFacts(facts);
  if (ok.length === 0) return "deterministic_polished";

  const tools = ok.map((f) => f.tool);
  const substantive = tools.filter((t) => !isNavOrResolve(t));
  const focus = substantive.length ? substantive : tools;

  // Register-like attendance packs: polished cards already include punch times.
  // Skip hybrid so LLM cannot omit IN clocks / rewrite punch-out as late.
  const attRegisterLike = ok.find((f) => {
    if (f.tool !== "attendance_late_summary" || !f.data || typeof f.data !== "object") {
      return false;
    }
    const d = f.data as {
      focus?: unknown;
      periodGrain?: unknown;
      from?: unknown;
      to?: unknown;
      topLateComers?: unknown;
    };
    const attFocus = String(d.focus ?? "late");
    if (attFocus === "punch_out") return true;
    if (attFocus !== "late") return false;
    const singleDay =
      d.periodGrain === "day" || (d.from != null && d.from === d.to);
    if (!singleDay) return false;
    const top = Array.isArray(d.topLateComers) ? d.topLateComers : [];
    return top.some((row) => {
      if (!row || typeof row !== "object") return false;
      const lab = (row as { punchInLabel?: unknown }).punchInLabel;
      return typeof lab === "string" && lab.trim().length > 0;
    });
  });
  if (attRegisterLike) return "deterministic_polished";

  if (focus.every((t) => NOVA_DETERMINISTIC_POLISHED_TOOLS.has(t) || isNavOrResolve(t))) {
    return "deterministic_polished";
  }

  if (focus.some((t) => NOVA_HYBRID_GUARDED_TOOLS.has(t))) {
    return "hybrid_guarded";
  }

  if (factsHaveHeadlineMoney(ok)) return "hybrid_guarded";

  // Unknown summary tools: prefer hybrid so LLM can polish when available.
  if (focus.some((t) => t.endsWith("_summary") || t.includes("pack"))) {
    return "hybrid_guarded";
  }

  return "deterministic_polished";
}

/** Trace tag for toolsUsed / observability. */
export function presentationModeToolTag(mode: NovaPresentationMode): string {
  return `presentation:${mode}`;
}

/** Humanize ERP scope tokens for user-facing copy. */
export function formatNovaScopeLabel(scope: unknown): string {
  const s = String(scope ?? "").trim();
  if (!s) return "";
  switch (s) {
    case "all_staff":
      return "All staff";
    case "team":
      return "Team";
    case "self":
    case "person_self":
      return "You";
    case "person_other":
      return "Named person";
    default:
      return s.replace(/_/g, " ");
  }
}
