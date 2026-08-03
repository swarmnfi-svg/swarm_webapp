/**
 * Static company / product knowledge for NOVA (read-only, not DB-backed).
 * Safe for any user with ai.assistant.read — no confidential figures.
 */
import type { SessionUser } from "@/auth";
import { formatNovaSuggestedPrompts, novaSuggestedPrompts } from "@/lib/ai/nova-suggest";

export type NovaKnowledgeAnswer = {
  answer: string;
  links: { title: string; href: string }[];
  toolsUsed: string[];
};

/** Detect meta / about-the-product questions that should not hit ERP data tools. */
export function isNovaCompanyKnowledgeQuery(query: string): boolean {
  const q = query.trim().toLowerCase().replace(/[?.!]+$/g, "");
  if (!q) return false;

  // Explicit product / company / assistant identity
  if (
    /\b(what\s+is|what's|whats|who\s+is|tell\s+me\s+about|explain|describe)\b/.test(q) &&
    /\b(empower|em\s*power|nova|bpg|biopower|this\s+app|this\s+erp|the\s+erp|this\s+system)\b/.test(q)
  ) {
    return true;
  }

  if (
    /^(empower|em\s*power)(\s+(app|erp|system|software|platform))?$/.test(q) ||
    /^(nova|nova\s+ai)$/.test(q) ||
    /\b(about\s+(empower|em\s*power|nova|this\s+app|this\s+erp))\b/.test(q) ||
    /\b(company\s+overview|product\s+overview|what\s+modules)\b/.test(q)
  ) {
    return true;
  }

  return false;
}

function knowledgeFocus(query: string): "empower" | "nova" | "modules" | "general" {
  const q = query.toLowerCase();
  if (/\bnova\b/.test(q)) {
    return "nova";
  }
  if (/\bmodules?\b/.test(q) || /\bfeatures?\b/.test(q)) return "modules";
  if (/\b(empower|em\s*power|bpg|biopower|this\s+app|this\s+erp|the\s+erp)\b/.test(q)) {
    return "empower";
  }
  return "general";
}

/**
 * Deterministic company/product overview. Anyone with ai.assistant.read may see this.
 */
export function answerNovaCompanyKnowledge(
  user: SessionUser,
  query: string
): NovaKnowledgeAnswer {
  const focus = knowledgeFocus(query);
  const suggestions = formatNovaSuggestedPrompts(user);

  const empowerBlurb = [
    "**emPOWER** is the internal ERP used by **BPG Renewables / Biopower** (live at erp.empowerbpg.com).",
    "It brings sales billing, receipts/collections, purchase & payment workflows, projects, stock & delivery, finance/accounts, HR attendance, tasks, KPI, and related operations into one permission-aware system.",
    "What you see in menus and reports depends on your **role** and any **extra module permissions** an admin granted you.",
  ];

  const novaBlurb = [
    "I'm **NOVA AI** — the read-only, permission-aware assistant inside emPOWER.",
    "I look up live ERP data you're allowed to see (sales, receipts, tasks, attendance, KPI, projects, and more — based on your access).",
    "I **cannot** create, edit, approve, pay, or delete records. Use the ERP screens for those actions.",
  ];

  const modulesBlurb = [
    "High-level modules in emPOWER (availability depends on your permissions):",
    "• **Projects** — project records and contract value (when allowed); ask “new orders this month” for projects confirmed with value / received / outstanding",
    "• **Sales & billing** — tax invoices, customers, receivables; say “sales orders” for SO documents",
    "• **Receipts / collections** — money received against invoices",
    "• **Purchase & payments** — purchase requests/orders/bills, payment requests, vendors",
    "• **Stock & delivery** — inventory, low-stock alerts, movements, dispatches",
    "• **Finance / accounts** — ledgers, bank accounts, reconciliation (restricted)",
    "• **HR** — attendance, late comers, leave, staff directory (by grant)",
    "• **Advances & incentives** — staff advances and incentive status (scoped)",
    "• **Tasks & KPI** — work tracking, my work, performance scores",
    "• **Approvals & CBG** — pending approvals, CBG quotations",
    "• **NOVA** — ask in plain language; answers stay within your access",
  ];

  const lines: string[] = [];
  if (focus === "nova") {
    lines.push(...novaBlurb, "", ...empowerBlurb.slice(0, 1), "", "Try asking:", suggestions);
  } else if (focus === "modules") {
    lines.push(...modulesBlurb, "", ...novaBlurb.slice(0, 2), "", "Try asking:", suggestions);
  } else if (focus === "empower") {
    lines.push(...empowerBlurb, "", ...novaBlurb, "", "Try asking:", suggestions);
  } else {
    lines.push(...empowerBlurb, "", ...novaBlurb, "", ...modulesBlurb.slice(0, 3), "", "Try asking:", suggestions);
  }

  return {
    answer: lines.join("\n"),
    links: [
      { title: "Dashboard", href: "/dashboard" },
      { title: "User manual", href: "/user-manual" },
      ...novaSuggestedPrompts(user, 3).map((p) => ({ title: p.label, href: "/ai-assistant" })),
    ],
    toolsUsed: ["company_knowledge", focus, "permission_prompts"],
  };
}
