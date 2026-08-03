import type { SessionUser } from "@/auth";
import { visibleNavItems } from "@/lib/nav-access";
import { LOCALES, type Locale } from "@/lib/i18n/locale";
import {
  answerNovaHelpGuide,
  isNovaHowToGuideQuery,
  isNovaLiveErpDataAsk,
  matchNovaHelpGuideDef,
} from "@/lib/ai/nova-help-guides";
import {
  answerNovaPermissionHelp,
  isNovaPermissionCapabilityAsk,
} from "@/lib/ai/nova-permission-help";

export type NovaAwareKind =
  | "language_support"
  | "capability_help"
  | "reports_support"
  | "reader_support"
  | "module_support"
  | "usage_help"
  | "howto_guide"
  | "permission_help";

export type NovaAwareAnswer = {
  answer: string;
  links: { title: string; href: string }[];
  toolsUsed: string[];
};

const LANGUAGE_LABELS: Record<Locale, string> = {
  en: "English",
  hi: "Hindi",
  ml: "Malayalam",
  ta: "Tamil",
  te: "Telugu",
  bn: "Bengali",
  kn: "Kannada",
  mr: "Marathi",
  gu: "Gujarati",
  pa: "Punjabi",
  ur: "Urdu",
  or: "Odia",
  as: "Assamese",
  es: "Spanish",
  "zh-cn": "Chinese (Simplified)",
  "zh-tw": "Chinese (Traditional)",
};

const LANGUAGE_WORD =
  "(english|hindi|hinglish|malayalam|tamil|telugu|bengali|kannada|marathi|gujarati|punjabi|urdu|odia|oriya|assamese|spanish|chinese|mandarin|हिंदी|हिन्दी|தமிழ்)";

function coreQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/[!?.,…]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectNovaAwareQuery(query: string): NovaAwareKind | null {
  const q = coreQuery(query);
  if (!q || q.length > 220) return null;

  // Role / module permission asks before profit/money lexicon and before howto.
  if (isNovaPermissionCapabilityAsk(q)) {
    return "permission_help";
  }

  // ERP how-to / guide (before language "can you speak…" and before write/entity paths)
  // Never steal live status/presence/list asks into howto_guide.
  if (!isNovaLiveErpDataAsk(q) && (isNovaHowToGuideQuery(q) || matchNovaHelpGuideDef(q))) {
    // Keep language-ability asks on language_support (“can you speak Hindi”)
    const languageAbility =
      new RegExp(
        `\\b(can|do|could|are)\\s+(you|u|nova)\\s+.*\\b(speak|talk|understand|reply|write|chat)\\b.*\\b${LANGUAGE_WORD}\\b`
      ).test(q) ||
      /\b(languages?\s+(support|supported|available)|language\s+support)\b/.test(q);
    if (!languageAbility) return "howto_guide";
  }

  if (
    /\b(languages?\s+(support|supported|available)|language\s+support|supported\s+languages?|which\s+languages?)\b/.test(
      q
    ) ||
    /\bwhat\s+languages?\s+(do|can)\s+(you|u|nova|the\s+app)\s+(support|speak|understand|use)\b/.test(
      q
    ) ||
    new RegExp(
      `\\b(can|do|could|are)\\s+(you|u|nova)\\s+.*\\b(speak|talk|understand|reply|write|chat)\\b.*\\b${LANGUAGE_WORD}\\b`
    ).test(q) ||
    new RegExp(`\\b${LANGUAGE_WORD}\\b\\s+(support|supported|available)\\b`).test(
      q
    )
  ) {
    return "language_support";
  }

  if (
    /\b(can\s+(you|u|nova).*\b(read|scan|extract|understand)\b.*\b(documents?|pdfs?|invoices?|bills?|files?)\b)\b/.test(
      q
    ) ||
    /\b(nova\s*)?reader\b/.test(q) ||
    /\b(use\s+reader|read\s+documents?|document\s+reader|document\s+search)\b/.test(q)
  ) {
    return "reader_support";
  }

  if (
    /\b(what|which)\s+reports?\s+(can|do)\s+(you|u|nova)\s+(generate|make|save|support)\b/.test(
      q
    ) ||
    /\breports?\s+(can|do)\s+(you|u|nova)\s+(generate|make|save|support)\b/.test(q) ||
    /^(what|which)\s+reports?\??$/.test(q)
  ) {
    return "reports_support";
  }

  if (
    /\b(what|which)\s+modules?\s+(do|can)\s+(you|u|nova|i)\s+(support|access|use|have)\b/.test(
      q
    ) ||
    /\b(supported\s+modules?|modules?\s+support|module\s+list)\b/.test(q)
  ) {
    return "module_support";
  }

  if (/\b(how\s+to\s+use\s+nova|how\s+do\s+(i|you)\s+use\s+(you|nova)|nova\s+help)\b/.test(q)) {
    return "usage_help";
  }

  if (
    /^(help|commands|capabilities|features|nova\s+capabilities|what\s+can\s+nova\s+do)$/.test(q) ||
    /\b(what\s+can\s+(you|u|nova)\s+do|what\s+do\s+(you|u)\s+do|your\s+capabilities|ur\s+capabilities|your\s+features|ur\s+features)\b/.test(
      q
    )
  ) {
    return "capability_help";
  }

  return null;
}

function moduleLinks(user: SessionUser) {
  return visibleNavItems(user)
    .filter((item) => item.href !== "/ai-assistant")
    .slice(0, 8)
    .map((item) => ({ title: item.href, href: item.href }));
}

function moduleList(user: SessionUser, limit = 12): string {
  const modules = visibleNavItems(user)
    .filter((item) => item.href !== "/ai-assistant")
    .map((item) => item.href);
  if (modules.length === 0) return "your permitted ERP screens";
  const shown = modules.slice(0, limit).join(", ");
  return modules.length > limit ? `${shown}, and ${modules.length - limit} more` : shown;
}

function languageAnswer(): NovaAwareAnswer {
  const appLanguages = LOCALES.map((locale) => LANGUAGE_LABELS[locale]).join(", ");
  return {
    answer: [
      "NOVA can answer language-support questions without looking up ERP entities.",
      "",
      `App language packs currently present: **${appLanguages}**.`,
      "",
      "For NOVA chat, English is the clearest default. Indian languages such as Hindi, Malayalam, Tamil, Telugu, Bengali, Kannada, Marathi, Gujarati, Punjabi, Urdu, Odia, and Assamese are supported for text chat/help where configured. Spanish is also supported, with other foreign-language chat or translation-style help depending on model and app configuration.",
      "",
      "Text quality can vary by browser input, fonts, and model output. I do **not** claim voice/speech support here. ERP numbers and records remain exact, permissioned, and server-authoritative in every language.",
    ].join("\n"),
    links: [{ title: "Appearance / language", href: "/settings/appearance" }],
    toolsUsed: ["nova_aware", "language_support", "chitchat:language"],
  };
}

function reportsAnswer(): NovaAwareAnswer {
  return {
    answer: [
      "NOVA can generate permissioned ERP summaries and save selected NOVA report packs.",
      "",
      "Current report-style areas include sales/receipts, receivables and overdue invoices, purchase/payables, expenses, attendance, tasks, stock/delivery, project command, month performance, collection attention, cash banking, and delivery delay/summary packs.",
      "",
      "Saved NOVA reports are immutable snapshots for **My reports**. Live ERP numbers still come from server-side tools and respect your role permissions.",
    ].join("\n"),
    links: [
      { title: "My reports", href: "/ai-assistant" },
      { title: "Reports", href: "/reports" },
    ],
    toolsUsed: ["nova_aware", "reports_support"],
  };
}

function readerAnswer(): NovaAwareAnswer {
  return {
    answer: [
      "Yes, where the module is enabled and your role allows it, NOVA can help with document workflows.",
      "",
      "That includes opening/searching documents and NOVA Reader-style extraction from supported uploaded files. Extraction quality depends on the file format, OCR/model configuration, and the source document.",
      "",
      "I won’t overclaim voice or unrestricted file reading: document access remains permissioned, and ERP records stay server-authoritative.",
    ].join("\n"),
    links: [
      { title: "Documents", href: "/documents" },
      { title: "NOVA", href: "/ai-assistant" },
    ],
    toolsUsed: ["nova_aware", "reader_support"],
  };
}

function modulesAnswer(user: SessionUser): NovaAwareAnswer {
  return {
    answer: [
      "NOVA supports the ERP areas your role can access, not a separate all-powerful data view.",
      "",
      `For you, visible modules include: ${moduleList(user)}.`,
      "",
      "Common NOVA skill areas include customers, vendors, projects (ask “new orders this month” for confirmed projects with value/received/outstanding), sales invoices, sales orders (say “sales orders” for SO documents), receipts, finance, purchases, tasks, attendance/HR, KPI, stock, delivery, documents, approvals, and reports, subject to permissions.",
    ].join("\n"),
    links: moduleLinks(user),
    toolsUsed: ["nova_aware", "module_support", "nav"],
  };
}

function capabilityAnswer(user: SessionUser, kind: NovaAwareKind): NovaAwareAnswer {
  const usageLine =
    kind === "usage_help"
      ? "Use NOVA by asking plain questions like “today receipts”, “pending tasks”, “what languages do you support”, or “what reports can NOVA generate”."
      : "Ask plain questions and I’ll route them to the right read-only ERP tool.";
  return {
    answer: [
      "I’m **NOVA**, emPOWER’s permission-aware assistant.",
      "",
      usageLine,
      "",
      "I can answer capability/help questions, pull live ERP summaries you’re allowed to see, clarify real customer/vendor/project ambiguity, help with report packs, and point you to modules or document workflows.",
      "",
      "I don’t create, approve, pay, or edit records from chat. I also reset old entity clarification context when you ask capability/help questions, so a later number is not applied to a stale list.",
    ].join("\n"),
    links: [{ title: "NOVA", href: "/ai-assistant" }, ...moduleLinks(user).slice(0, 5)],
    toolsUsed: ["nova_aware", "capability_help", "help", "permission_prompts"],
  };
}

export function answerNovaAwareQuery(user: SessionUser, query: string): NovaAwareAnswer | null {
  const kind = detectNovaAwareQuery(query);
  switch (kind) {
    case "permission_help":
      return answerNovaPermissionHelp(user, query);
    case "howto_guide":
      return answerNovaHelpGuide(user, query);
    case "language_support":
      return languageAnswer();
    case "reports_support":
      return reportsAnswer();
    case "reader_support":
      return readerAnswer();
    case "module_support":
      return modulesAnswer(user);
    case "capability_help":
    case "usage_help":
      return capabilityAnswer(user, kind);
    default:
      return null;
  }
}
