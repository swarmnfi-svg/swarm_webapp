/**
 * Non-attendance polished presentation dispatcher.
 * See PRESENTATION_POLISH_HANDOFF.md.
 */

import {
  formatApprovalsSummaryPolished,
  formatPaymentRequestsSummaryPolished,
  formatPendingWorkflowPolished,
} from "@/lib/nova/presentation/approvals";
import {
  formatBankAccountsSummaryPolished,
  formatBankReconSummaryPolished,
} from "@/lib/nova/presentation/bank";
import {
  PRESENTATION_POLISH_PREP_VERSION,
  prepPresentationModeForTool,
  type NovaPresentationMode,
} from "@/lib/nova/presentation/contract";
import { formatCustomersSummaryPolished } from "@/lib/nova/presentation/customers";
import { formatReceiptsSummaryPolished } from "@/lib/nova/presentation/receipts";
import { formatSalesSummaryPolished } from "@/lib/nova/presentation/sales";
import { formatTasksSummaryPolished } from "@/lib/nova/presentation/tasks";

export { PRESENTATION_POLISH_PREP_VERSION, prepPresentationModeForTool };
export type { NovaPresentationMode };

/** Tools with dedicated polished formatters in this module. */
export const PREP_POLISHED_FORMATTER_TOOLS = [
  "sales_summary",
  "receipts_summary",
  "tasks_summary",
  "bank_accounts_summary",
  "bank_recon_summary",
  "approvals_summary",
  "pending_workflow_counts",
  "payment_requests_summary",
  "customers_summary",
] as const;

export type PrepPolishedFormatterTool = (typeof PREP_POLISHED_FORMATTER_TOOLS)[number];

/**
 * Format one fact payload with the polished card/bullet layout.
 * Returns null when this PREP does not own the tool (caller keeps raw / attendance path).
 */
export function formatPrepPolishedFact(
  tool: string,
  data: Record<string, unknown>
): string | null {
  switch (tool) {
    case "sales_summary":
      return formatSalesSummaryPolished(data);
    case "receipts_summary":
      return formatReceiptsSummaryPolished(data);
    case "tasks_summary":
      return formatTasksSummaryPolished(data);
    case "bank_accounts_summary":
      return formatBankAccountsSummaryPolished(data);
    case "bank_recon_summary":
      return formatBankReconSummaryPolished(data);
    case "approvals_summary":
      return formatApprovalsSummaryPolished(data);
    case "pending_workflow_counts":
      return formatPendingWorkflowPolished(data);
    case "payment_requests_summary":
      return formatPaymentRequestsSummaryPolished(data);
    case "customers_summary":
      return formatCustomersSummaryPolished(data);
    default:
      return null;
  }
}

/**
 * Format a multi-fact pack using PREP polished helpers where available.
 * Unknown tools are skipped (integrator merges with attendance + remaining formatters).
 */
export function formatPrepPolishedFacts(
  facts: Array<{ tool: string; ok?: boolean; denied?: boolean; data?: unknown }>
): string | null {
  const parts: string[] = [];
  for (const f of facts) {
    if (!f.ok || f.denied || !f.data || typeof f.data !== "object") continue;
    const polished = formatPrepPolishedFact(f.tool, f.data as Record<string, unknown>);
    if (polished) parts.push(polished);
  }
  return parts.length ? parts.join("\n\n") : null;
}
