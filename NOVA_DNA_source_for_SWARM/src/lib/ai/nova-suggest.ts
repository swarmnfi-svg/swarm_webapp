/**
 * Permission-aware NOVA prompt suggestions (read-only).
 * Only suggest questions the user can actually answer with their grants.
 *
 * Suggest chips are confirm-style prompts (short, selectable) — same spirit as
 * period/metric clarify chips (“this month”, “sales”). Safe silent defaults
 * live in module contracts (queues → open, KPI → latest); bare money never
 * defaults from suggestions.
 */
import type { SessionUser } from "@/auth";
import { canViewBackupHistory } from "@/lib/backup/access";
import { canViewPayrollSalaryAmounts } from "@/lib/confidential-financials-access";
import { can, canViewOrgFinanceAggregates, type Permission } from "@/lib/rbac";
import { canSeeVendorBankDetails } from "@/lib/vendor-bank";
import type { NovaClarifyOption, NovaClarifyOptionType } from "@/lib/ai/nova-clarify";
import {
  NOVA_TOOL_PERMISSIONS,
  novaToolRequiresOrgFinance,
} from "@/lib/ai/nova-tool-permissions";

export { NOVA_TOOL_PERMISSIONS, novaPermissionsForTool, novaPermissionsForTools } from "@/lib/ai/nova-tool-permissions";

export type NovaPromptSuggestion = { prompt: string; label: string };

/** Map clarify confirm chips → clickable prompt suggestions (UI / help). */
export function novaConfirmChipsToSuggestions(
  options: NovaClarifyOption[],
  limit = 8
): NovaPromptSuggestion[] {
  const out: NovaPromptSuggestion[] = [];
  const seen = new Set<string>();
  for (const o of options.slice(0, limit)) {
    const prompt = (o.reply || o.label).trim();
    if (!prompt || seen.has(prompt.toLowerCase())) continue;
    seen.add(prompt.toLowerCase());
    out.push({
      prompt,
      label: o.label.length <= 28 ? o.label : o.label.slice(0, 26) + "…",
    });
  }
  return out;
}

type SuggestRule = {
  anyOf: Permission[];
  /** Extra gate beyond anyOf (e.g. org finance aggregates) */
  extra?: (user: SessionUser) => boolean;
  prompts: NovaPromptSuggestion[];
};

const SUGGEST_RULES: SuggestRule[] = [
  // Staff-first pack when finance aggregates are absent (sidebar parity)
  {
    anyOf: ["task.read.self"],
    extra: (u) => !canViewOrgFinanceAggregates(u),
    prompts: [
      { prompt: "my work", label: "My work" },
      { prompt: "overdue tasks", label: "Overdue tasks" },
    ],
  },
  {
    anyOf: ["hr.leave.create", "hr.leave.read", "hr.leave.approve"],
    extra: (u) => !canViewOrgFinanceAggregates(u),
    prompts: [{ prompt: "my leave balance", label: "My leave" }],
  },
  {
    anyOf: ["hr.punch.self"],
    extra: (u) =>
      !canViewOrgFinanceAggregates(u) &&
      !can(u, "hr.attendance.read") &&
      !can(u, "hr.attendance.team"),
    prompts: [{ prompt: "my attendance this month", label: "My attendance" }],
  },
  {
    anyOf: ["hr.attendance.read", "hr.attendance.team"],
    extra: (u) => !canViewOrgFinanceAggregates(u),
    prompts: [
      { prompt: "my attendance this month", label: "My attendance" },
      { prompt: "who was absent this week", label: "Absentees" },
    ],
  },
  {
    anyOf: ["kpi.read.self", "kpi.read.team", "kpi.read.all"],
    extra: (u) => !canViewOrgFinanceAggregates(u),
    prompts: [
      { prompt: "kpi list", label: "KPI list" },
      { prompt: "my kpi", label: "My KPI" },
    ],
  },
  {
    anyOf: ["incentive.read.self", "incentive.read.team", "incentive.read.all"],
    extra: (u) => !canViewOrgFinanceAggregates(u),
    prompts: [{ prompt: "my incentives", label: "My incentives" }],
  },
  {
    anyOf: ["hr.payslip.self", "hr.payslip.read", "hr.salary.read"],
    extra: (u) => !canViewOrgFinanceAggregates(u),
    prompts: [{ prompt: "my payslip this month", label: "My payslip" }],
  },
  {
    anyOf: ["receipt.read"],
    extra: (u) => canViewOrgFinanceAggregates(u),
    prompts: [{ prompt: "today receipts", label: "Today’s receipts" }],
  },
  {
    anyOf: ["invoice.read"],
    extra: (u) => canViewOrgFinanceAggregates(u),
    prompts: [
      { prompt: "FY 26-27 sales", label: "FY sales" },
      { prompt: "this month revenue", label: "This month sales" },
      { prompt: "overdue invoices", label: "Receivables" },
    ],
  },
  // High-value ops chips early so unmatched/help examples include them (not buried past limit)
  {
    anyOf: ["paymentrequest.read", "paymentrequest.create"],
    prompts: [{ prompt: "payment requests pending", label: "Payment requests" }],
  },
  {
    anyOf: ["kpi.read.self", "kpi.read.team", "kpi.read.all"],
    extra: (u) => canViewOrgFinanceAggregates(u),
    prompts: [{ prompt: "kpi list", label: "KPI list" }],
  },
  {
    anyOf: ["delivery.read"],
    prompts: [{ prompt: "delivery delays", label: "Delivery delays" }],
  },
  {
    anyOf: ["director.dashboard", "finance.dashboard.read", "accounts.dashboard.read"],
    prompts: [
      { prompt: "FY 26-27 target", label: "FY target" },
      { prompt: "order book", label: "Order book" },
      { prompt: "director dashboard", label: "Director dashboard" },
    ],
  },
  {
    anyOf: ["hr.attendance.read", "hr.attendance.team"],
    prompts: [
      { prompt: "late comers this week", label: "Late comers" },
      { prompt: "who was absent this week", label: "Absentees" },
      { prompt: "who is most late", label: "Most late" },
    ],
  },
  {
    anyOf: ["hr.punch.self"],
    extra: (u) => !can(u, "hr.attendance.read") && !can(u, "hr.attendance.team"),
    prompts: [{ prompt: "my attendance this month", label: "My attendance" }],
  },
  {
    anyOf: ["hr.leave.create", "hr.leave.read", "hr.leave.approve"],
    prompts: [
      { prompt: "my leave balance", label: "My leave balance" },
      { prompt: "pending leave", label: "Pending leave" },
    ],
  },
  {
    anyOf: ["kpi.read.self", "kpi.read.team", "kpi.read.all"],
    prompts: [
      { prompt: "kpi list", label: "KPI list" },
      { prompt: "my kpi", label: "My KPI" },
      { prompt: "staff kpi", label: "Staff KPI" },
    ],
  },
  {
    anyOf: ["incentive.read.self", "incentive.read.team", "incentive.read.all"],
    prompts: [
      { prompt: "my incentives", label: "My incentives" },
      { prompt: "pending incentives", label: "Incentives" },
    ],
  },
  {
    anyOf: ["project.read"],
    extra: (u) => canViewOrgFinanceAggregates(u) || !!u.canSeeProjectValue,
    prompts: [
      { prompt: "new orders this month", label: "New orders (projects)" },
      { prompt: "active projects value", label: "Project value" },
    ],
  },
  {
    anyOf: ["project.read"],
    extra: (u) => !canViewOrgFinanceAggregates(u) && !u.canSeeProjectValue,
    prompts: [
      { prompt: "new orders this month", label: "New orders (projects)" },
      { prompt: "active projects", label: "Projects" },
    ],
  },
  {
    anyOf: ["task.read.self"],
    prompts: [
      { prompt: "overdue tasks", label: "Overdue tasks" },
      { prompt: "my work", label: "My work" },
    ],
  },
  {
    anyOf: ["stock.read"],
    prompts: [{ prompt: "low stock items", label: "Low stock" }],
  },
  {
    anyOf: ["delivery.read"],
    prompts: [
      { prompt: "delivery delays", label: "Delivery delays" },
      { prompt: "deliveries this month", label: "Deliveries" },
    ],
  },
  {
    anyOf: ["paymentrequest.read", "paymentrequest.create"],
    prompts: [
      { prompt: "payment requests pending", label: "Payment requests" },
      { prompt: "todays payment", label: "Today's payments" },
    ],
  },
  {
    anyOf: ["vendor.read"],
    prompts: [{ prompt: "vendors list", label: "Vendors" }],
  },
  {
    anyOf: ["customer.read"],
    prompts: [{ prompt: "customers summary", label: "Customers" }],
  },
  {
    anyOf: ["staff.read", "hr.employee.read"],
    prompts: [{ prompt: "active staff count", label: "Staff" }],
  },
  {
    anyOf: ["salesorder.read"],
    prompts: [{ prompt: "open sales orders", label: "Sales orders" }],
  },
  {
    anyOf: ["purchaseorder.read"],
    prompts: [{ prompt: "open purchase orders", label: "Purchase orders" }],
  },
  {
    anyOf: ["purchaserequest.read", "purchaserequest.create"],
    prompts: [{ prompt: "pending purchase requests", label: "Purchase requests" }],
  },
  {
    anyOf: ["staffadvance.read", "staffadvance.self.create"],
    prompts: [{ prompt: "staff advances pending", label: "Advances" }],
  },
  {
    anyOf: ["bank.reconcile"],
    prompts: [{ prompt: "unreconciled bank lines", label: "Bank recon" }],
  },
  {
    anyOf: ["bank.read"],
    prompts: [{ prompt: "bank accounts", label: "Bank accounts" }],
  },
  {
    anyOf: ["approval.read.self", "approval.read.team", "approval.read.all"],
    prompts: [{ prompt: "pending approvals", label: "Approvals" }],
  },
  {
    anyOf: ["cbgquotation.read"],
    prompts: [{ prompt: "CBG quotations", label: "Quotations" }],
  },
];

/** Documents hub entry uses documents.read; per-module ACL stays in the hub. */
export function canAccessNovaDocuments(user: SessionUser): boolean {
  return can(user, "documents.read");
}

/**
 * Metric / queue clarify chips → tools used for RBAC filtering.
 * Unmapped chips (periods, free labels) pass through.
 */
export const NOVA_CLARIFY_CHIP_TOOLS: Record<string, string[]> = {
  sales: ["sales_summary"],
  receipts: ["receipts_summary"],
  late: ["attendance_late_summary"],
  "late comers": ["attendance_late_summary"],
  "late comers (attendance)": ["attendance_late_summary"],
  tasks: ["tasks_summary"],
  invoices: ["sales_summary"],
  deliveries: ["delivery_summary"],
  "payment requests": ["payment_requests_summary"],
  expenses: ["staff_expense_summary"],
  salary: ["salary_summary"],
  "my payslip": ["salary_summary"],
  "daily brief": ["daily_brief"],
  outstanding: ["customer_outstanding", "overdue_invoices"],
  // Bound party upgrades search_entities → project_command / customers_summary in runNovaTools.
  "customer / project record": ["search_entities"],
  approvals: ["approvals_summary"],
  leave: ["leave_summary"],
  overtime: ["overtime_summary"],
  "pending overtime": ["overtime_summary"],
  regularisation: ["regularisation_summary"],
  "pending regularisation": ["regularisation_summary"],
  advances: ["staff_advances_summary"],
  "purchase bills": ["purchase_bills_summary"],
  "late payment / fee": ["payment_requests_summary", "overdue_invoices"],
  "finance dashboard": ["director_dashboard_summary"],
  "ERP reports": ["reports_snapshot"],
  "erp reports": ["reports_snapshot"],
};

/** Drop clarify options the user cannot run; rewrite salary → my payslip when self-only. */
export function filterNovaClarifyChipsForUser<
  T extends { id: string; label: string; type: NovaClarifyOptionType },
>(user: SessionUser | null | undefined, chips: T[]): T[] {
  if (!user) return chips;
  const out: T[] = [];
  for (const c of chips) {
    const key = c.id.toLowerCase();
    const labelKey = c.label.toLowerCase();
    const tools = NOVA_CLARIFY_CHIP_TOOLS[key] ?? NOVA_CLARIFY_CHIP_TOOLS[labelKey];
    if (!tools) {
      out.push(c);
      continue;
    }
    if (!tools.some((t) => novaCanRunTool(user, t))) continue;
    if (
      (key === "salary" || labelKey === "salary") &&
      !can(user, "hr.salary.read") &&
      !can(user, "hr.payslip.read") &&
      can(user, "hr.payslip.self")
    ) {
      out.push({ ...c, id: "my payslip", label: "my payslip" });
      continue;
    }
    out.push(c);
  }
  return out;
}

export function novaCanRunTool(user: SessionUser, tool: string): boolean {
  // Admin open tools: Permission floor + page-parity gates (backup history / roles)
  if (tool === "backup_open") return canViewBackupHistory(user);
  if (tool === "system_tools_open") {
    return user.role === "SUPER_ADMIN" || user.role === "ADMIN" || user.role === "DIRECTOR";
  }
  if (tool === "audit_log_open") return can(user, "audit.read");
  if (tool === "documents_open") return canAccessNovaDocuments(user);
  if (tool === "settings_open") return can(user, "settings.write");
  if (tool === "appearance_open") return can(user, "ai.assistant.read");
  // Parity with vendor page / SoD bank visibility (not vendorbank.read alone).
  if (tool === "vendor_bank_open") return canSeeVendorBankDetails(user);
  // FIN-HR-SAL: org salary vs self payslip only
  if (tool === "salary_summary") {
    return canViewPayrollSalaryAmounts(user) || can(user, "hr.payslip.self");
  }
  // Analysis: Assist + at least one domain-read floor (adapters still enforce subject ACL).
  if (tool === "nova_analysis") {
    if (!can(user, "ai.assistant.read")) return false;
    return (
      can(user, "kpi.read.self") ||
      can(user, "kpi.read.team") ||
      can(user, "kpi.read.all") ||
      can(user, "task.read.self") ||
      can(user, "invoice.read") ||
      can(user, "hr.attendance.read") ||
      can(user, "hr.attendance.team") ||
      can(user, "hr.punch.self") ||
      can(user, "project.read")
    );
  }

  const perms = NOVA_TOOL_PERMISSIONS[tool];
  if (!perms) return false; // unknown tool → deny
  if (!perms.some((p) => can(user, p))) return false;
  if (
    novaToolRequiresOrgFinance(tool) &&
    !canViewOrgFinanceAggregates(user) &&
    !(tool === "order_book_summary" && can(user, "director.dashboard")) &&
    !(tool === "director_dashboard_summary" && can(user, "director.dashboard"))
  ) {
    return false;
  }
  return true;
}

export function filterNovaToolsForUser(user: SessionUser, tools: string[]): string[] {
  return tools.filter((t) => novaCanRunTool(user, t));
}

/** True when the ask is clearly admin company/users settings (not personal theme). */
export function isNovaAdminSettingsAsk(query: string): boolean {
  const q = query.trim().toLowerCase();
  return (
    /\b(company|system|users?|roles?|permissions?)\s+settings\b/.test(q) ||
    /\bsettings\s+(for\s+)?(users?|company|roles?|permissions?)\b/.test(q) ||
    /\b(user\s+management|company\s+profile)\b/.test(q)
  );
}

/**
 * After RBAC filter: Staff “settings” / preferences → appearance_open (theme only).
 * Explicit company/users settings stay denied. Admin keeps settings_open only.
 */
export function applyNovaOpenToolFallbacks(
  user: SessionUser,
  query: string,
  requested: string[],
  filtered: string[]
): string[] {
  let out = [...filtered];
  const wantsSettings = requested.includes("settings_open");
  if (
    wantsSettings &&
    !out.includes("settings_open") &&
    novaCanRunTool(user, "appearance_open") &&
    !isNovaAdminSettingsAsk(query)
  ) {
    if (!out.includes("appearance_open")) out.push("appearance_open");
  }
  if (out.includes("settings_open") && out.includes("appearance_open")) {
    out = out.filter((t) => t !== "appearance_open");
  }
  return out;
}

/** Dynamic example prompts based on what the user can actually query. */
export function novaSuggestedPrompts(user: SessionUser, limit = 8): NovaPromptSuggestion[] {
  const out: NovaPromptSuggestion[] = [];
  const seen = new Set<string>();
  const staffFirst = !canViewOrgFinanceAggregates(user);

  const rules = staffFirst
    ? [
        ...SUGGEST_RULES.filter((r) =>
          r.anyOf.some((p) =>
            [
              "hr.leave.create",
              "hr.leave.read",
              "hr.leave.approve",
              "task.read.self",
              "kpi.read.self",
              "kpi.read.team",
              "kpi.read.all",
              "incentive.read.self",
              "incentive.read.team",
              "incentive.read.all",
              "hr.attendance.read",
              "hr.attendance.team",
              "hr.punch.self",
            ].includes(p)
          )
        ),
        ...SUGGEST_RULES,
      ]
    : SUGGEST_RULES;

  for (const rule of rules) {
    if (!rule.anyOf.some((p) => can(user, p))) continue;
    if (rule.extra && !rule.extra(user)) continue;
    for (const p of rule.prompts) {
      if (seen.has(p.prompt)) continue;
      seen.add(p.prompt);
      out.push(p);
      if (out.length >= limit) return out;
    }
  }
  if (out.length === 0) {
    out.push({ prompt: "help", label: "Help" }, { prompt: "what can I access", label: "My access" });
  } else if (out.length < limit) {
    out.push({ prompt: "help", label: "Help" }, { prompt: "what is empower", label: "About emPOWER" });
  }
  return out.slice(0, limit);
}

export function formatNovaSuggestedPrompts(user: SessionUser): string {
  const prompts = novaSuggestedPrompts(user);
  return prompts.map((p) => `• ${p.prompt}`).join("\n");
}
