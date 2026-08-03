/**
 * RBAC / role-capability questions for NOVA.
 *
 * "can manager see profit", "who can see salary", "does accountant have access to bank"
 * must answer from real role matrix + route access — never dump live P&L / fund data.
 */
import type { SessionUser } from "@/auth";
import type { Role } from "@prisma/client";
import type { AccessUser, Permission } from "@/lib/rbac";
import { can } from "@/lib/rbac";
import { canAccessPath } from "@/lib/route-access";
import { canViewPayrollSalaryAmounts } from "@/lib/confidential-financials-access";

export type NovaPermissionHelpAnswer = {
  answer: string;
  links: { title: string; href: string }[];
  toolsUsed: string[];
};

type RoleWord = {
  role: Role;
  label: string;
  pattern: RegExp;
};

const ROLE_WORDS: RoleWord[] = [
  { role: "SUPER_ADMIN", label: "Super Admin", pattern: /\bsuper[-\s]?admins?\b/ },
  { role: "ADMIN", label: "Admin", pattern: /\badmins?\b/ },
  { role: "DIRECTOR", label: "Director", pattern: /\bdirectors?\b/ },
  { role: "ACCOUNTANT", label: "Accountant", pattern: /\baccountants?\b/ },
  { role: "MANAGER", label: "Manager", pattern: /\bmanagers?\b/ },
  { role: "STAFF", label: "Staff", pattern: /\b(staff|employees?)\b/ },
];

type TopicCheck = {
  title: string;
  href: string;
  /** Prefer path check; permission is fallback label when path is role-special. */
  allowed: (probe: AccessUser) => boolean;
  permissionHint: string;
};

type TopicDef = {
  id: string;
  title: string;
  patterns: RegExp[];
  checks: TopicCheck[];
  notes: string[];
};

const TOPICS: TopicDef[] = [
  {
    id: "profit",
    title: "profit / Project P&L / fund position",
    patterns: [
      /\b(profits?|profitability|margins?|p\s*&\s*l|pnl|fund\s+position|project\s+p\s*&\s*l)\b/,
    ],
    checks: [
      {
        title: "Project P&L report",
        href: "/reports/project-pl",
        allowed: (u) => canAccessPath(u, "/reports/project-pl"),
        permissionHint: "project.profitability.view",
      },
      {
        title: "Project Est. Margin / profitability",
        href: "/projects",
        allowed: (u) => can(u, "project.profitability.view"),
        permissionHint: "project.profitability.view",
      },
      {
        title: "Accounts Profit & Loss",
        href: "/accounts/profit-loss",
        allowed: (u) => canAccessPath(u, "/accounts/profit-loss"),
        permissionHint: "accounts.reports.read",
      },
      {
        title: "Finance fund position",
        href: "/finance/reports/fund-position",
        allowed: (u) => canAccessPath(u, "/finance/reports/fund-position"),
        permissionHint: "finance.reports.read",
      },
    ],
    notes: [
      "Manager and Staff do **not** get Project P&L / fund / accounts P&L on the default role matrix.",
      "Accountant and Director have Project P&L by default; Admin / Super Admin have full access.",
      "Per-user grants can open some finance screens for non-ops roles — ask an Admin to check Settings → Users for that person.",
    ],
  },
  {
    id: "salary",
    title: "salary / payroll amounts",
    patterns: [/\b(salary|salaries|payroll|payslips?|salry|salery)\b/],
    checks: [
      {
        title: "Salary Payments",
        href: "/accounts/salary",
        allowed: (u) => canViewPayrollSalaryAmounts(u),
        permissionHint: "hr.salary.read (not Manager/Staff)",
      },
    ],
    notes: [
      "Managers and Staff **never** see org salary/payroll amounts — even with canSeeSalaryInfo flags.",
      "Staff may still open **own payslip** when hr.payslip.self is granted.",
      "Accountant (with HR salary/payroll perms), Director, Admin, and Super Admin can open Salary Payments.",
    ],
  },
  {
    id: "bank",
    title: "bank accounts / banking",
    patterns: [/\b(banks?|banking|bank\s+accounts?|bank\s+balance)\b/],
    checks: [
      {
        title: "Bank Accounts",
        href: "/bank-accounts",
        allowed: (u) => canAccessPath(u, "/bank-accounts"),
        permissionHint: "bank.read",
      },
    ],
    notes: [
      "Manager and Staff cannot receive bank.read via grants (POL-1 ops lockdown).",
      "Accountant has bank access by default; Director needs an explicit Super-Admin grant.",
    ],
  },
  {
    id: "kpi",
    title: "KPI",
    patterns: [/\b(kpi|kpis|key\s+performance)\b/],
    checks: [
      {
        title: "My KPI",
        href: "/kpi",
        allowed: (u) => canAccessPath(u, "/kpi"),
        permissionHint: "kpi.read.self",
      },
      {
        title: "Team KPI",
        href: "/kpi/team",
        allowed: (u) => canAccessPath(u, "/kpi/team"),
        permissionHint: "kpi.read.team",
      },
    ],
    notes: [
      "Manager has team KPI by default (Admin can revoke canViewTeamKpi per user).",
      "Staff typically has self KPI only.",
    ],
  },
];

const SELF_WORDS = /\b(i|me|my|we|us|our)\b/;
const ACCESS_VERB = /\b(see|view|access|open|check|read|look\s+at)\b/;

function coreQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/[!?.,…]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function probeUser(role: Role): AccessUser {
  return {
    role,
    canApprove: false,
    canSeeVendorBank: false,
    canSeeSalaryInfo: false,
    canSeeProjectValue: false,
    canEditProjectValue: false,
    canSeeProjectBudget: false,
    canEditProjectBudget: false,
    canSeeProjectInvoiced: false,
    canEditProjectInvoiced: false,
    canSeeCustomerCredit: false,
    canEditCustomerCredit: false,
    canSeePurchaseBills: false,
    canEditPurchaseBills: false,
    canSeePayments: false,
    canEditPayments: false,
    canViewBackupHistory: false,
    canViewTeamKpi: true,
    canViewTeamIncentives: true,
    canEditTeamKpi: false,
    grantedPermissions: [],
  };
}

function sessionAsAccess(user: SessionUser): AccessUser {
  return {
    role: user.role,
    canApprove: user.canApprove,
    canSeeVendorBank: user.canSeeVendorBank,
    canSeeSalaryInfo: user.canSeeSalaryInfo,
    canSeeProjectValue: user.canSeeProjectValue,
    canEditProjectValue: user.canEditProjectValue,
    canSeeProjectBudget: user.canSeeProjectBudget,
    canEditProjectBudget: user.canEditProjectBudget,
    canSeeProjectInvoiced: user.canSeeProjectInvoiced,
    canEditProjectInvoiced: user.canEditProjectInvoiced,
    canSeeCustomerCredit: user.canSeeCustomerCredit,
    canEditCustomerCredit: user.canEditCustomerCredit,
    canSeePurchaseBills: user.canSeePurchaseBills,
    canEditPurchaseBills: user.canEditPurchaseBills,
    canSeePayments: user.canSeePayments,
    canEditPayments: user.canEditPayments,
    canViewBackupHistory: user.canViewBackupHistory,
    canViewTeamKpi: user.canViewTeamKpi,
    canViewTeamIncentives: user.canViewTeamIncentives,
    canEditTeamKpi: user.canEditTeamKpi,
    grantedPermissions: user.grantedPermissions as Permission[],
  };
}

function matchTopic(q: string): TopicDef | null {
  for (const t of TOPICS) {
    if (t.patterns.some((p) => p.test(q))) return t;
  }
  return null;
}

function matchRoles(q: string): RoleWord[] {
  return ROLE_WORDS.filter((r) => r.pattern.test(q));
}

/**
 * True for role/permission capability questions — not live data, not how-to mutate.
 */
export function isNovaPermissionCapabilityAsk(query: string): boolean {
  const q = coreQuery(query);
  if (!q || q.length > 220) return false;

  // "can I do / create / enter…" stays on howto unless clearly see/view/access.
  if (
    /\bcan\s+(i|we)\s+(do|enter|create|make|submit|request|punch|pay|record|add)\b/.test(q) &&
    !ACCESS_VERB.test(q)
  ) {
    return false;
  }

  const whoCan =
    /\bwho\s+can\s+(see|view|access|open|check|read)\b/.test(q) ||
    /\bwho\s+has\s+(access|permission|visibility)\b/.test(q);

  const doesRoleHave =
    /\bdoes\s+\w+\s+have\s+(access|permission|visibility|rights?)\b/.test(q) ||
    /\bdo\s+\w+\s+have\s+(access|permission|visibility|rights?)\b/.test(q);

  const canRoleSee =
    /\bcan\s+(\w+)\s+(see|view|access|open|check|read)\b/.test(q) ||
    /\bis\s+(\w+)\s+allowed\s+to\s+(see|view|access|open|check|read)\b/.test(q) ||
    /\b(allowed|permitted)\s+to\s+(see|view|access)\b/.test(q);

  const canISee = /\bcan\s+(i|we)\s+(see|view|access|open|check|read)\b/.test(q);

  if (!(whoCan || doesRoleHave || canRoleSee || canISee)) return false;

  // Need a known topic or a known role word (otherwise leave for other routers).
  const topic = matchTopic(q);
  const roles = matchRoles(q);
  if (whoCan) return topic != null;
  if (canISee) return topic != null;
  if (doesRoleHave || canRoleSee) return topic != null || roles.length > 0;
  return false;
}

function formatAllowedLine(check: TopicCheck, allowed: boolean): string {
  const verb = allowed ? "Yes — default role can open" : "No — default role cannot open";
  return `• **${check.title}** (\`${check.href}\`): ${verb} (needs \`${check.permissionHint}\`).`;
}

function answerForProbe(
  topic: TopicDef,
  probe: AccessUser,
  subjectLabel: string
): { lines: string[]; links: { title: string; href: string }[] } {
  const lines: string[] = [
    `**${subjectLabel}** and **${topic.title}** (default role matrix — per-user grants may differ):`,
    "",
  ];
  const links: { title: string; href: string }[] = [];
  let anyYes = false;
  for (const check of topic.checks) {
    const ok = check.allowed(probe);
    if (ok) anyYes = true;
    lines.push(formatAllowedLine(check, ok));
    if (ok) links.push({ title: check.title, href: check.href });
  }
  lines.push("");
  if (!anyYes) {
    lines.push(
      `So **${subjectLabel}** cannot see ${topic.title} on the standard role setup.`
    );
  } else {
    lines.push(
      `Where “Yes” above, **${subjectLabel}** can open that screen (subject to any Admin toggles on the user).`
    );
  }
  if (topic.notes.length) {
    lines.push("", "**Notes:**");
    for (const n of topic.notes) lines.push(`• ${n}`);
  }
  lines.push(
    "",
    "This is a **permissions** answer — I am not listing live profit figures. Ask “show project profit” or “projects on loss” if you want Project P&L data."
  );
  links.push({ title: "User Manual", href: "/user-manual" });
  return { lines, links };
}

function answerWhoCan(topic: TopicDef): NovaPermissionHelpAnswer {
  const roleOrder: Role[] = [
    "SUPER_ADMIN",
    "ADMIN",
    "DIRECTOR",
    "ACCOUNTANT",
    "MANAGER",
    "STAFF",
  ];
  const labels = Object.fromEntries(ROLE_WORDS.map((r) => [r.role, r.label])) as Record<
    Role,
    string
  >;
  const lines: string[] = [
    `**Who can see ${topic.title}?** (default role matrix)`,
    "",
  ];
  const yesRoles: string[] = [];
  const noRoles: string[] = [];
  for (const role of roleOrder) {
    const probe = probeUser(role);
    const any = topic.checks.some((c) => c.allowed(probe));
    if (any) yesRoles.push(labels[role] ?? role);
    else noRoles.push(labels[role] ?? role);
  }
  lines.push(
    `• **Typically yes:** ${yesRoles.length ? yesRoles.join(", ") : "none on the default matrix"}.`,
    `• **Typically no:** ${noRoles.length ? noRoles.join(", ") : "none"}.`,
    ""
  );
  lines.push("**Screens checked:**");
  for (const check of topic.checks) {
    lines.push(`• ${check.title} — \`${check.href}\` (\`${check.permissionHint}\`)`);
  }
  if (topic.notes.length) {
    lines.push("", "**Notes:**");
    for (const n of topic.notes) lines.push(`• ${n}`);
  }
  lines.push(
    "",
    "Ask an Admin to confirm per-user grants in Settings → Users. For live numbers, ask a data question like “show project profit”."
  );
  return {
    answer: lines.join("\n"),
    links: [
      { title: topic.checks[0]!.title, href: topic.checks[0]!.href },
      { title: "User Manual", href: "/user-manual" },
    ],
    toolsUsed: ["nova_aware", "permission_help", `perm_topic:${topic.id}`, "rbac"],
  };
}

/**
 * Answer a permission/capability question from real RBAC helpers.
 * Returns null when the query is not a permission ask.
 */
export function answerNovaPermissionHelp(
  user: SessionUser,
  query: string
): NovaPermissionHelpAnswer | null {
  if (!isNovaPermissionCapabilityAsk(query)) return null;
  const q = coreQuery(query);
  const topic = matchTopic(q);

  if (/\bwho\s+can\b/.test(q) || /\bwho\s+has\b/.test(q)) {
    if (!topic) return null;
    return answerWhoCan(topic);
  }

  const roles = matchRoles(q);
  const aboutSelf =
    roles.length === 0 && /\bcan\s+(i|we)\s+(see|view|access|open|check|read)\b/.test(q);

  if (!topic) {
    // Role asked but topic unclear — stay honest, don't invent.
    const subject = roles[0];
    if (!subject) return null;
    return {
      answer: [
        `I can explain what **${subject.label}** can open for a specific module (profit/P&L, salary, bank, KPI, etc.).`,
        "",
        `Try: “can ${subject.label.toLowerCase()} see profit”, “can ${subject.label.toLowerCase()} view bank”, or “does ${subject.label.toLowerCase()} have access to KPI”.`,
        "",
        "I won’t invent permissions — answers use the real role matrix and route access rules.",
      ].join("\n"),
      links: [{ title: "User Manual", href: "/user-manual" }],
      toolsUsed: ["nova_aware", "permission_help", "rbac"],
    };
  }

  if (aboutSelf) {
    const { lines, links } = answerForProbe(topic, sessionAsAccess(user), "You");
    return {
      answer: lines.join("\n"),
      links,
      toolsUsed: ["nova_aware", "permission_help", `perm_topic:${topic.id}`, "rbac"],
    };
  }

  const subject = roles[0] ?? {
    role: user.role,
    label: ROLE_WORDS.find((r) => r.role === user.role)?.label ?? user.role,
  };
  const { lines, links } = answerForProbe(topic, probeUser(subject.role), subject.label);
  return {
    answer: lines.join("\n"),
    links,
    toolsUsed: [
      "nova_aware",
      "permission_help",
      `perm_topic:${topic.id}`,
      `perm_role:${subject.role}`,
      "rbac",
    ],
  };
}
