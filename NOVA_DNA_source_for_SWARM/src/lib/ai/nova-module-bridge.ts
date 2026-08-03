/**
 * Query-system module bridge — maps Empower sidebar nav → Nova topics / tools.
 * Does **not** move app folders or change RBAC matrices; deep-links use existing hrefs.
 */
import type { NavKey } from "@/lib/i18n/nav";
import type { NovaTopicId } from "@/lib/ai/nova-lexicon";
import { getNovaModuleContract } from "@/lib/ai/nova-plan";

export type NovaBridgeToolMode = "summary" | "open" | "missing" | "n/a";

export type NovaModuleBridgeRow = {
  navKey: NavKey | "virtual";
  href: string;
  topicId?: NovaTopicId;
  /** True when topic has a NOVA_MODULE_CONTRACTS entry */
  contract: boolean;
  toolMode: NovaBridgeToolMode;
  smokePhrases: string[];
};

function row(
  partial: Omit<NovaModuleBridgeRow, "contract"> & { contract?: boolean }
): NovaModuleBridgeRow {
  return {
    ...partial,
    contract:
      partial.contract ??
      (partial.topicId != null && getNovaModuleContract(partial.topicId) != null),
  };
}

/**
 * Coverage catalog for CI smoke + docs. Keep in sync when adding lexicon topics / open tools.
 */
export const NOVA_MODULE_BRIDGE: readonly NovaModuleBridgeRow[] = [
  row({ navKey: "dashboard", href: "/dashboard", topicId: "finance_dashboard", toolMode: "summary", smokePhrases: ["director dashboard"] }),
  row({ navKey: "myProfile", href: "/my-profile", topicId: "my_work", toolMode: "summary", smokePhrases: ["my work"] }),
  row({ navKey: "myAccount", href: "/my-account", topicId: "salary", toolMode: "summary", smokePhrases: ["my salary"] }),
  row({ navKey: "myAdvances", href: "/my-advances", topicId: "staff_advances", toolMode: "summary", smokePhrases: ["my advances"] }),
  row({ navKey: "staff", href: "/staff", topicId: "staff", toolMode: "summary", smokePhrases: ["staff list"] }),
  row({ navKey: "staffAdvances", href: "/staff-advances", topicId: "staff_advances", toolMode: "summary", smokePhrases: ["staff advances"] }),
  row({ navKey: "customers", href: "/customers", topicId: "customers", toolMode: "summary", smokePhrases: ["customers"] }),
  row({ navKey: "projects", href: "/projects", topicId: "projects", toolMode: "summary", smokePhrases: ["projects"] }),
  row({ navKey: "salesOrders", href: "/sales-orders", topicId: "sales_orders", toolMode: "summary", smokePhrases: ["sales orders"] }),
  row({ navKey: "cbgQuotations", href: "/cbg-quotations", topicId: "cbg_quotations", toolMode: "summary", smokePhrases: ["cbg quotations"] }),
  row({ navKey: "attendanceHr", href: "/attendance-hr", topicId: "attendance", toolMode: "summary", smokePhrases: ["todays attendance"] }),
  row({ navKey: "tasks", href: "/tasks", topicId: "tasks", toolMode: "summary", smokePhrases: ["my tasks"] }),
  row({ navKey: "kpi", href: "/kpi", topicId: "kpi", toolMode: "summary", smokePhrases: ["kpi"] }),
  row({ navKey: "tally", href: "/tally", topicId: "tally", toolMode: "summary", smokePhrases: ["tally"] }),
  row({ navKey: "billing", href: "/billing", topicId: "sales_invoices", toolMode: "summary", smokePhrases: ["sales this month"] }),
  row({ navKey: "receipts", href: "/receipts", topicId: "receipts", toolMode: "summary", smokePhrases: ["receipts this month"] }),
  row({ navKey: "finance", href: "/finance", topicId: "finance_dashboard", toolMode: "summary", smokePhrases: ["finance dashboard"] }),
  row({ navKey: "bankAccounts", href: "/bank-accounts", topicId: "bank_accounts", toolMode: "summary", smokePhrases: ["bank accounts"] }),
  row({ navKey: "accounts", href: "/accounts", topicId: "accounts_ledger", toolMode: "summary", smokePhrases: ["accounts ledger"] }),
  row({ navKey: "bankStatements", href: "/bank-statements", topicId: "bank_recon", toolMode: "summary", smokePhrases: ["bank statement"] }),
  row({ navKey: "reconciliation", href: "/reconciliation", topicId: "bank_recon", toolMode: "summary", smokePhrases: ["reconciliation"] }),
  row({ navKey: "vendors", href: "/vendors", topicId: "vendors", toolMode: "summary", smokePhrases: ["vendors"] }),
  row({ navKey: "purchaseRequests", href: "/purchase-requests", topicId: "purchase_requests", toolMode: "summary", smokePhrases: ["purchase requests"] }),
  row({ navKey: "purchaseOrders", href: "/purchase-orders", topicId: "purchase_orders", toolMode: "summary", smokePhrases: ["purchase orders"] }),
  row({ navKey: "purchaseBills", href: "/purchase-bills", topicId: "payables", toolMode: "summary", smokePhrases: ["purchase bills"] }),
  row({ navKey: "paymentRequests", href: "/payment-requests", topicId: "payment_requests", toolMode: "summary", smokePhrases: ["todays payment"] }),
  row({ navKey: "stock", href: "/stock", topicId: "stock", toolMode: "summary", smokePhrases: ["stock"] }),
  row({ navKey: "delivery", href: "/delivery", topicId: "delivery", toolMode: "summary", smokePhrases: ["delivery delays"] }),
  row({ navKey: "reports", href: "/reports", topicId: "reports", toolMode: "summary", smokePhrases: ["reports"] }),
  row({ navKey: "documents", href: "/documents", topicId: "documents", toolMode: "summary", smokePhrases: ["documents"] }),
  row({ navKey: "notifications", href: "/notifications", topicId: "notifications", toolMode: "open", smokePhrases: ["notifications"] }),
  row({ navKey: "approvals", href: "/approvals", topicId: "approvals", toolMode: "summary", smokePhrases: ["approvals"] }),
  row({ navKey: "director", href: "/director", topicId: "finance_dashboard", toolMode: "summary", smokePhrases: ["director dashboard"] }),
  row({ navKey: "directorCommand", href: "/director-dashboard", topicId: "finance_dashboard", toolMode: "summary", smokePhrases: ["command center"] }),
  row({ navKey: "settings", href: "/settings", topicId: "settings", toolMode: "open", smokePhrases: ["settings"] }),
  row({
    navKey: "appearance",
    href: "/settings/appearance",
    topicId: "appearance",
    toolMode: "open",
    smokePhrases: ["appearance", "theme"],
  }),
  row({
    navKey: "backup",
    href: "/system/backup",
    topicId: "system_backup",
    toolMode: "open",
    smokePhrases: ["backup", "system backup"],
  }),
  row({
    navKey: "systemTools",
    href: "/system/tools",
    topicId: "system_tools",
    toolMode: "open",
    smokePhrases: ["system tools"],
  }),
  row({
    navKey: "auditLog",
    href: "/system/audit-log",
    topicId: "audit_log",
    toolMode: "open",
    smokePhrases: ["audit log"],
  }),
  row({ navKey: "automation", href: "/automation", topicId: "automation", toolMode: "open", smokePhrases: ["automation"] }),
  row({ navKey: "portal", href: "/portal", topicId: "portal", toolMode: "open", smokePhrases: ["portal"] }),
  row({ navKey: "whatsapp", href: "/whatsapp", topicId: "whatsapp", toolMode: "open", smokePhrases: ["whatsapp"] }),
  row({ navKey: "aiAssistant", href: "/ai-assistant", toolMode: "n/a", smokePhrases: ["help"] }),
  row({ navKey: "userManual", href: "/user-manual", toolMode: "n/a", smokePhrases: [] }),
  row({ navKey: "links", href: "/links", topicId: "links", toolMode: "open", smokePhrases: ["links"] }),
  row({
    navKey: "virtual",
    href: "/accounts/bank-sms",
    topicId: "bank_sms",
    toolMode: "open",
    smokePhrases: ["bank sms"],
  }),
  row({
    navKey: "virtual",
    href: "/vendors",
    topicId: "vendor_bank",
    toolMode: "summary",
    smokePhrases: ["bank details", "beneficiary"],
  }),
];

/** High-traffic sidebar modules for bridge-derived CI smoke (summaries). */
const HIGH_TRAFFIC_NAV = new Set<NavKey | "virtual">([
  "billing",
  "receipts",
  "paymentRequests",
  "attendanceHr",
  "tasks",
  "kpi",
  "vendors",
  "customers",
  "projects",
  "stock",
  "delivery",
  "approvals",
  "purchaseRequests",
  "purchaseOrders",
  "salesOrders",
  "staff",
  "bankAccounts",
  "reconciliation",
]);

export type NovaBridgeSmokeCase = {
  phrase: string;
  href: string;
  toolMode: NovaBridgeToolMode;
  topicId?: NovaTopicId;
  navKey: NavKey | "virtual";
};

/**
 * Bridge-derived smoke phrases for CI: all `open` rows with phrases + high-traffic summaries.
 */
export function novaBridgeSmokeCases(): NovaBridgeSmokeCase[] {
  return NOVA_MODULE_BRIDGE.flatMap((row) => {
    if (row.smokePhrases.length === 0) return [];
    if (row.toolMode === "open") {
      return row.smokePhrases.map((phrase) => ({
        phrase,
        href: row.href,
        toolMode: row.toolMode,
        topicId: row.topicId,
        navKey: row.navKey,
      }));
    }
    if (row.toolMode === "summary" && HIGH_TRAFFIC_NAV.has(row.navKey)) {
      return row.smokePhrases.map((phrase) => ({
        phrase,
        href: row.href,
        toolMode: row.toolMode,
        topicId: row.topicId,
        navKey: row.navKey,
      }));
    }
    return [];
  });
}
