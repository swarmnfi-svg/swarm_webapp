/**
 * Org-wide silence gate — entitySpan present ⇒ scoped bind or clarify.
 */

import { isNovaRankingWhEntityNoise } from "@/lib/nova/query-structure/personal-task";
import type { NovaEntityKindHint } from "@/lib/nova/query-structure/parse-entity-module";

/** Tools that must never run org-wide when an entity span was parsed. */
export const NOVA_SCOPED_PARTY_TOOLS = new Set([
  "tasks_summary",
  "documents_search",
  "approvals_summary",
  "purchase_orders_summary",
  "sales_orders_summary",
  "delivery_summary",
  "grn_summary",
  "credit_notes_summary",
  "payment_requests_summary",
  "staff_expense_summary",
  "receivables_summary",
  "customer_outstanding",
  "sales_summary",
  "receipts_summary",
  "overdue_invoices",
  "project_command",
  "collection_attention",
  "nova_analysis",
  "nova_trend",
]);

export function toolsImplyPartyScope(tools: readonly string[]): boolean {
  return tools.some((t) => NOVA_SCOPED_PARTY_TOOLS.has(t));
}

/**
 * Refuse silent org-wide when structure had a **party/project** entity span
 * but nothing bound. Person demotion / staff kindHint / ranking junk = not blocked.
 */
export function refuseSilentOrgWide(opts: {
  entitySpan: string | null | undefined;
  tools: readonly string[];
  resolvedEntityId?: string | null;
  personHint?: string | null;
  boundEntityId?: string | null;
  entityKindHint?: NovaEntityKindHint;
}): { clarify: true; reason: string } | null {
  const span = opts.entitySpan?.trim();
  if (!span) return null;
  if (opts.resolvedEntityId || opts.boundEntityId) return null;
  if (opts.personHint?.trim()) return null;
  if (opts.entityKindHint === "staff") return null;
  if (isNovaRankingWhEntityNoise(span)) return null;
  if (!toolsImplyPartyScope(opts.tools)) return null;
  return {
    clarify: true,
    reason: `I need a project or customer match for “${span}” before I can scope that answer — pick one from the list, or check the spelling. I won’t show org-wide totals for a named party/project. For a person’s tasks, try “${span} pending tasks” or “tasks for ${span}”.`,
  };
}

/**
 * Module-only follow-ups (“pending tasks”, “invoices”) without a sticky bind
 * but with a prior entity hint in slots → clarify (never silent org-wide).
 */
export function stickyModuleFollowUpNeedsBind(opts: {
  isModuleOnly: boolean;
  boundEntityId?: string | null;
  slotsEntityHint?: string | null;
  /** Prior personal-task person — skip party bind demand. */
  slotsPersonHint?: string | null;
}): boolean {
  if (!opts.isModuleOnly) return false;
  if (opts.boundEntityId) return false;
  if (opts.slotsPersonHint?.trim()) return false;
  return Boolean(opts.slotsEntityHint?.trim());
}

/** Short module-only follow-up shapes (no party name in the utterance). */
export function isNovaModuleOnlyFollowUp(query: string): boolean {
  const t = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return false;
  if (
    /^(?:(?:show|list|get|check|find|fetch|display|give(?:\s+me)?)\s+)?(?:pending|open|overdue)\s+(?:tasks?|todos?|invoices?|approvals?|receipts?)\s*$/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /^(?:(?:show|list|get|check|find|fetch|display|give(?:\s+me)?)\s+)?(?:tasks?|todos?|invoices?|receipts?|collections?|sales(?:\s+orders?)?|approvals?|documents?|receivables?|outstanding|delivery|grn)\s*$/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}
