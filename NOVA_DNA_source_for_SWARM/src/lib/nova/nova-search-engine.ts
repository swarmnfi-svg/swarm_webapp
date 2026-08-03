/**
 * NovaSearchEngine — understand chat text → fill slots → inputs for NovaPlan / skills.
 *
 * READ-ONLY: does not create/update/delete, free SQL, invent money/people, or freely pick tools.
 * Flow: user text → (optional NovaThink) → NovaSearchEngine (slots) → NovaPlan → RBAC → skill.
 *
 * Rules here are the deterministic fallback; NovaThink may propose the same slot schema.
 */

import { isNovaSaveReportFollowUp } from "@/lib/nova/save-report-follow-up";
import { isNovaNonReferentialName } from "@/lib/ai/nova-inference";
import { extractNovaNamedProjectHint } from "@/lib/ai/nova-lexicon";
import {
  looksLikeHardPartyOrProjectName,
  looksLikePartyOrProjectName,
  looksLikeSingleTokenPartyLabel,
  normalizeNovaEntityLookupHint,
} from "@/lib/nova/party-name";
import {
  parseNovaEntityRoleSpan,
  acceptsPartyEntitySpan,
  parseEntityModuleAsk,
  isNovaTaskCompletionRankingAsk,
  isNovaRankingWhEntityNoise,
  isNovaLeadingPersonFocusTaskAsk,
  isNovaPersonalTaskAskShape,
  isNovaPlaceFramedTaskAsk,
} from "@/lib/nova/query-structure";
import { matchNovaPartyDocumentAsk } from "@/lib/nova/nlp-document-jargon";

export {
  looksLikePartyOrProjectName,
  looksLikeSingleTokenPartyLabel,
  normalizeNovaEntityLookupHint,
} from "@/lib/nova/party-name";

export type NovaQueryFamily =
  | "search"
  | "status"
  | "money"
  | "attendance"
  | "approvals"
  | "people"
  | "docs"
  | "bank"
  | "inventory"
  | "resolve"
  | "follow_up"
  | "deny_write"
  | "unknown";

export type NovaSearchEntityType =
  | "project"
  | "customer"
  | "vendor"
  | "employee"
  | "document"
  | "invoice"
  | "order"
  | "task"
  | "quotation"
  | "purchase_order"
  | "purchase_request"
  | "purchase_bill"
  | "receipt"
  | "payment_request"
  | "expense"
  | "approval"
  | "leave"
  | "bank_account"
  | null;

export type NovaSearchSlots = {
  intent: string;
  entityType: NovaSearchEntityType;
  entityHint: string | null;
  metric: string | null;
  /** Explicit period label, or null — name search must keep null (no FY default). */
  period: string | null;
  comparison: string | null;
  focus: string | null;
  queryFamily: NovaQueryFamily;
  /** Registered tool ids only — never invents. */
  tools: string[];
  confidence: "high" | "low";
  interpretedAs?: string[];
  /** Clean string for Empower `searchBusinessData` (not the full chat utterance). */
  searchQuery: string | null;
  /** When true, personHint must not steal this entity (e.g. project name). */
  suppressPersonHint?: boolean;
};

const ALLOWED_FAMILIES = new Set<NovaQueryFamily>([
  "search",
  "status",
  "money",
  "attendance",
  "approvals",
  "people",
  "docs",
  "bank",
  "inventory",
  "resolve",
  "follow_up",
  "deny_write",
  "unknown",
]);

const ALLOWED_ENTITY_TYPES = new Set<string>([
  "project",
  "customer",
  "vendor",
  "employee",
  "document",
  "invoice",
  "order",
  "task",
  "quotation",
  "purchase_order",
  "purchase_request",
  "purchase_bill",
  "receipt",
  "payment_request",
  "expense",
  "approval",
  "leave",
  "bank_account",
]);

/** Identity / directory tools allowed on resolve|people (never money packs). */
const RESOLVE_SAFE_TOOLS = new Set([
  "staff_summary",
  "search_entities",
  "documents_search",
  "customers_summary",
  "vendors_summary",
  "projects_summary",
  "tasks_summary",
]);

/** Attendance / ranking WH-phrases — never treat as person name lookup. */
const WHO_IS_ATTENDANCE_NOISE =
  /\b(late|absent|present|most\s+late|punched|coming|working|here|available|on\s+leave)\b/i;

const MONEY_OR_VALUE =
  /\b(sales|revenue|receipts?|collections?|invoices?|billing|turnover|outstanding|receivables?|payables?|value|worth|profit|loss|margin|pnl|p\s*&\s*l|biggest|largest|highest|top|active\s+projects?\s+value|project\s+value)\b/i;

const ATTENDANCE_CUE =
  /\b(attendance|late\s*comers?|latecomers|absent|absentees?|present|punch(?:ed|ing|es)?)\b/i;

const APPROVALS_CUE = /\b(approvals?)\b/i;

const STATUS_CUE = /\b(pending|overdue|awaiting|open\s+queue)\b/i;

const WRITE_CUE =
  /\b(create|update|edit|delete|remove|void|reverse|mark\s+paid|post\s+to\s+ledger|change\s+status)\b/i;

/** How-to / guide prefixes — not deny_write; Aware help guides own these. */
const HOWTO_GUIDE_CUE =
  /\b(how\s+to|how\s+do\s+i|how\s+can\s+i|guide\s+me|walk\s+me\s+through|show\s+me\s+how|tell\s+me\s+how|steps?\s+to|where\s+(do\s+i|to|can\s+i)|can\s+i\s+(do|enter|create|make|submit|request|punch|pay|record|add))\b/i;

const TASK_METRIC = /\b(tasks?|todos?)\b/i;

/** Interrogative health frame — never a party name. */
export const HOW_IS_FRAME =
  /\b(how(?:'s|\s+is|\s+are)|how\s+are\s+we)\b/i;

/** Domain words that must never decisive-resolve as a bare party. */
export const DOMAIN_BARE_STOP =
  /\b(sales|revenue|receipts?|collections?|invoices?|billing|turnover|projects?|late|attendance|stock|vendors?|customers?|tasks?|todos?|kpi|approvals?|payables?|receivables?|activity|overview|summary|dashboard|order\s*book|bank|banking|cash|salary|payroll|leave|advances?|incentives?|grn|profitability|pending|overdue|help|deliver(?:y|ies)|delay(?:s|ed)?|dispatch(?:es)?|challans?|expenses?|kharcha|documents?|files?|settings?|quotations?|quotes?|tally|bonus|payslips?|notifications?|whatsapp|portal|automation|links?|gstr|gst|brief|work|who|whom|whose|what|which|staff|employees?|headcount|reports?|finance|register|ag(?:e)?ing|business|company|ops|things|numbers|performance|health|going|doing|purchase\s*bills?|purchase\s*orders?|purchase\s*requests?|credit\s*notes?|payment\s*requests?|manual\s*vouchers?|backup|backups?|theme|appearance|preferences?|audit\s*logs?|system\s+tools?|system\s+backup|bank\s*sms|beneficiary|vendor\s*bank|bank\s*details?|reconcil(?:e|iation)?|credit\s*note|bills?|accounts?|ledgers?)\b/i;

const ENTITY_TYPE_PATTERNS: Array<{
  type: Exclude<NovaSearchEntityType, null>;
  re: RegExp;
}> = [
  // More specific purchase / payment types before generic order|invoice|bill
  { type: "purchase_order", re: /\bpurchase\s*orders?\b|\bpos?\b/i },
  { type: "purchase_request", re: /\bpurchase\s*requests?\b|\bprs?\b/i },
  { type: "purchase_bill", re: /\bpurchase\s*bills?\b|\bpbs?\b/i },
  { type: "payment_request", re: /\bpayment\s*requests?\b/i },
  { type: "quotation", re: /\b(cbg\s*)?(quotations?|quotes?)\b/i },
  { type: "receipt", re: /\b(sales\s*)?receipts?\b/i },
  { type: "expense", re: /\b(manual\s*)?expenses?\b/i },
  { type: "approval", re: /\bapprovals?\b/i },
  { type: "leave", re: /\bleave\b/i },
  { type: "bank_account", re: /\bbank\s*accounts?\b/i },
  { type: "project", re: /\bprojects?\b/i },
  { type: "customer", re: /\b(customers?|clients?)\b/i },
  { type: "vendor", re: /\b(vendors?|suppliers?)\b/i },
  { type: "employee", re: /\b(employees?|staff|people)\b/i },
  { type: "document", re: /\b(documents?|files?|attachments?|pdfs?)\b/i },
  { type: "invoice", re: /\binvoices?\b/i },
  { type: "order", re: /\b(sales\s*)?orders?\b|\bso\b/i },
  { type: "task", re: /\b(tasks?|todos?)\b/i },
];

/** Map SearchEngine entity type → Empower data-search `kind` label. */
export function novaSearchKindForEntityType(
  entityType: NovaSearchEntityType
): string | null {
  switch (entityType) {
    case "project":
      return "Project";
    case "customer":
      return "Customer";
    case "vendor":
      return "Vendor";
    case "employee":
      return "Staff";
    case "invoice":
      return "Invoice";
    case "order":
      return "Sales Order";
    case "task":
      return "Task";
    case "quotation":
      return "CBG Quotation";
    case "purchase_order":
      return "Purchase Order";
    case "purchase_request":
      return "Purchase Request";
    case "purchase_bill":
      return "Purchase Bill";
    case "receipt":
      return "Receipt";
    case "payment_request":
      return "Payment Request";
    case "expense":
      return "Expense";
    case "approval":
      return "Approval";
    case "leave":
      return "Leave";
    case "bank_account":
      return "Bank Account";
    case "document":
      return null;
    default:
      return null;
  }
}

/** Default catalog tool for a typed identity lookup. */
export function novaResolveToolForEntityType(
  entityType: NovaSearchEntityType
): string | null {
  switch (entityType) {
    case "employee":
      return "staff_summary";
    case "document":
      return "documents_search";
    case "task":
    case "customer":
    case "vendor":
    case "project":
    case "invoice":
    case "order":
    case "quotation":
    case "purchase_order":
    case "purchase_request":
    case "purchase_bill":
    case "receipt":
    case "payment_request":
    case "expense":
    case "approval":
    case "leave":
    case "bank_account":
      return "search_entities";
    default:
      return "search_entities";
  }
}

function detectEntityType(q: string): NovaSearchEntityType {
  for (const row of ENTITY_TYPE_PATTERNS) {
    if (row.re.test(q)) return row.type;
  }
  return null;
}

function cleanHint(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const t = normalizeNovaEntityLookupHint(
    raw
      .trim()
      // SEARCH: / find: prefixes and leftover leading punctuation
      .replace(/^(?:search|find|look\s*up|lookup)\s*:\s*/i, "")
      .replace(/^[:\-–—]+\s*/, "")
      .replace(/^["']|["']$/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
  if (t.length < 2 || t.length > 100) return null;
  if (/^(named|called|name|the|a|an|please|pls|project|projects)$/i.test(t)) return null;
  return t;
}

/** Party/project for status scopes — multi-word OR single-token brand (Avaada). */
function looksLikeScopedPartyOrProjectHint(hint: string): boolean {
  return looksLikePartyOrProjectName(hint) || looksLikeSingleTokenPartyLabel(hint);
}

/** Bare party / project labels — allow long legal names (rice mills, etc.). */
const BARE_PARTY_NAME_RE =
  /^[A-Za-z][A-Za-z0-9&.\-]*(?:\s+[A-Za-z][A-Za-z0-9&.\-]*){0,11}$/;

/**
 * Named project ask → Project Command (entity resolve + scoped skills).
 * search_entities stays for find/lookup only — not mandatory.
 * Runs after how-is so true health asks without a named party stay intact.
 */
function matchNamedProjectDetailAsk(query: string): NovaSearchSlots | null {
  const named = extractNovaNamedProjectHint(query);
  if (!named) return null;

  // Leave find/lookup / "projects named X" to matchNameSearch → search_entities
  if (
    /\b(find|search|look\s*up|lookup)\b/i.test(query) ||
    (/\bprojects?\s+(named|called)\b/i.test(query) &&
      !/\b(work|task|photo|picture|image|responsible|details?|handled)\b/i.test(query))
  ) {
    return null;
  }

  const ql = query.toLowerCase();
  const wantsPhotos = /\b(photos?|pictures?|images?|attachments?|site\s+images?|plant\s+photos?)\b/.test(
    ql
  );
  const tools = wantsPhotos ? ["project_command", "documents_search"] : ["project_command"];

  return emptySlots({
    intent: "named_project_detail",
    entityType: "project",
    entityHint: named,
    queryFamily: "status",
    tools,
    confidence: "high",
    interpretedAs: ["named project command"],
    searchQuery: named,
    suppressPersonHint: true,
  });
}

/**
 * How-is / business-health gate — before bare entity resolve.
 * Defaults period to current calendar month (stated via period slot / pack).
 * business_health aliases month_performance in P0.
 */
function matchHowIsHealth(query: string): NovaSearchSlots | null {
  const q = query.trim().replace(/\s+/g, " ");
  if (!q) return null;
  const ql = q.toLowerCase().replace(/[?!.]+$/g, "").trim();

  // Bare domain words that are health/overview, not parties
  if (/^(business|company)$/i.test(ql)) {
    return emptySlots({
      intent: "business_health",
      queryFamily: "money",
      metric: "business_health",
      period: "this month",
      tools: ["month_performance"],
      confidence: "high",
      interpretedAs: ["business health (month performance)"],
      entityHint: null,
      searchQuery: null,
    });
  }

  const howIs =
    HOW_IS_FRAME.test(ql) ||
    /^how\s+are\s+we\s+(doing|going)$/i.test(ql) ||
    /^how(?:'s|\s+is)\s+business\b/i.test(ql);

  if (!howIs && !/^how\s+are\s+we\b/i.test(ql)) return null;

  // Named project health — resolve only the name span (not whole utterance)
  const projectHealth = ql.match(
    /^how(?:'s|\s+is|\s+are)\s+(?:the\s+)?project\s+(.+?)(?:\s+doing|\s+going)?$/i
  );
  if (projectHealth) {
    const hint = cleanHint(projectHealth[1]);
    if (hint && !isNovaNonReferentialName(hint) && !DOMAIN_BARE_STOP.test(hint)) {
      return emptySlots({
        intent: "project_health",
        entityType: "project",
        entityHint: hint,
        queryFamily: "resolve",
        tools: ["search_entities"],
        confidence: "high",
        interpretedAs: ["project health resolve"],
        searchQuery: hint,
        suppressPersonHint: true,
      });
    }
  }

  // Attendance month (before generic month / business)
  if (
    /\bhow\s+is\s+this\s+month'?s?\s+attendance\b/.test(ql) ||
    /\bhow\s+is\s+.+\s+attendance\b/.test(ql) ||
    (/\battendance\b/.test(ql) && HOW_IS_FRAME.test(ql))
  ) {
    return emptySlots({
      intent: "attendance_health",
      queryFamily: "attendance",
      metric: "attendance",
      period: "this month",
      focus: "overview",
      tools: ["attendance_month"],
      confidence: "high",
      interpretedAs: ["attendance month"],
    });
  }

  // Cash / banking
  if (/\b(cash|banking|bank)\b/.test(ql)) {
    return emptySlots({
      intent: "banking_health",
      queryFamily: "bank",
      metric: "cash_banking",
      period: /\bweek\b/.test(ql) ? "this week" : "this month",
      tools: ["cash_banking"],
      confidence: "high",
      interpretedAs: ["cash / banking"],
    });
  }

  // Sales / revenue health — never entity hint
  if (/\b(sales|revenue|turnover|billing)\b/.test(ql)) {
    return emptySlots({
      intent: "sales_health",
      queryFamily: "money",
      metric: "sales",
      period: "this month",
      tools: ["sales_summary"],
      confidence: "high",
      interpretedAs: ["sales summary (this month)"],
      entityHint: null,
      searchQuery: null,
    });
  }

  // Tasks / queue
  if (/\b(tasks?|todos?|my\s+work|the\s+queue|queue)\b/.test(ql)) {
    return emptySlots({
      intent: "tasks_health",
      queryFamily: "status",
      metric: "tasks",
      tools: ["tasks_summary"],
      confidence: "high",
      interpretedAs: ["tasks summary"],
    });
  }

  // This month going / July going → month_performance
  if (
    /\bhow\s+is\s+(this\s+month|july|august|september|october|november|december|january|february|march|april|may|june)\b/.test(
      ql
    )
  ) {
    return emptySlots({
      intent: "month_performance",
      queryFamily: "money",
      metric: "month_performance",
      period: "this month",
      tools: ["month_performance"],
      confidence: "high",
      interpretedAs: ["month performance"],
    });
  }

  // Business / how are we doing → month_performance (business_health alias)
  if (
    /\b(business|company)\b/.test(ql) ||
    /^how\s+are\s+we\s+(doing|going)$/i.test(ql) ||
    /^how(?:'s|\s+is)\s+(business|company)\b/i.test(ql)
  ) {
    return emptySlots({
      intent: "business_health",
      queryFamily: "money",
      metric: "business_health",
      period: "this month",
      tools: ["month_performance"],
      confidence: "high",
      interpretedAs: ["business health (month performance)"],
      entityHint: null,
      searchQuery: null,
    });
  }

  return null;
}

/**
 * Who-is / identity lookup — staff profile by default; typed party when cued.
 * Never steals attendance WH (“who is late”) or directory-only (“who is staff”).
 */
function matchWhoIsLookup(query: string): {
  entityType: NovaSearchEntityType;
  entityHint: string;
  intent: string;
  queryFamily: NovaQueryFamily;
  tools: string[];
} | null {
  const q = query.trim().replace(/\s+/g, " ");
  if (!q || MONEY_OR_VALUE.test(q)) return null;

  const who = q.match(
    /^(?:who\s+(?:is|are)|who's|who\s+was)\s+(.+)$/i
  );
  if (!who) return null;
  const rest = who[1]!.trim();
  if (!rest || WHO_IS_ATTENDANCE_NOISE.test(rest)) return null;
  // Directory list, not a named person
  if (/^(the\s+)?(staff|employees?|team|people)\s*$/i.test(rest)) return null;

  const typed = rest.match(
    /^(?:the\s+)?(customer|client|vendor|supplier|project|employee|staff|person)\s+(.+)$/i
  );
  if (typed) {
    const entityType = detectEntityType(typed[1]!) ?? ("employee" as const);
    const entityHint = cleanHint(typed[2]);
    if (!entityHint || WHO_IS_ATTENDANCE_NOISE.test(entityHint)) return null;
    const tool = novaResolveToolForEntityType(entityType) ?? "search_entities";
    return {
      entityType,
      entityHint,
      intent: `who_is_${entityType}`,
      queryFamily: entityType === "employee" ? "people" : "resolve",
      tools: [tool],
    };
  }

  const entityHint = cleanHint(rest);
  if (!entityHint || WHO_IS_ATTENDANCE_NOISE.test(entityHint)) return null;
  // Multi-word company-ish → party resolve via search, not silent staff
  if (looksLikePartyOrProjectName(entityHint)) {
    return {
      entityType: null,
      entityHint,
      intent: "who_is_party",
      queryFamily: "resolve",
      tools: ["search_entities"],
    };
  }
  return {
    entityType: "employee",
    entityHint,
    intent: "who_is_employee",
    queryFamily: "people",
    tools: ["staff_summary"],
  };
}

/**
 * Detect explicit name / find lookups.
 * Examples: "find projects named tata", "projects named X", "search customer called Avaada".
 */
function matchNameSearch(query: string): {
  entityType: NovaSearchEntityType;
  entityHint: string;
  intent: string;
} | null {
  const q = query.trim().replace(/\s+/g, " ");
  if (!q) return null;
  // Explicit find/search/named may include “invoice/order” tokens — still a name lookup
  const explicitFind =
    /\b(find|search|look\s*up|lookup|named|called|what\s+is|what's|whats)\b/i.test(q);
  if (MONEY_OR_VALUE.test(q) && !explicitFind) return null;

  const typeAlt =
    "projects?|customers?|clients?|vendors?|suppliers?|employees?|staff|documents?|files?|invoices?|sales\\s*orders?|orders?|cbg\\s*quotations?|quotations?|quotes?|purchase\\s*orders?|purchase\\s*requests?|purchase\\s*bills?|payment\\s*requests?|receipts?|expenses?|approvals?|leave|bank\\s*accounts?|tasks?|todos?|pos?|prs?|pbs?|so";

  const typedNamed = q.match(
    new RegExp(
      `^(?:(?:find|search|look\\s*up|lookup|show|list|get|fetch|display)\\s+)?(${typeAlt})\\s+(?:named|called|with\\s+name|name)\\s+(.+)$`,
      "i"
    )
  );
  if (typedNamed) {
    const entityType = detectEntityType(typedNamed[1]!);
    const entityHint = cleanHint(typedNamed[2]);
    if (entityType && entityHint) {
      return { entityType, entityHint, intent: `find_${entityType}_by_name` };
    }
  }

  const findThenType = q.match(
    new RegExp(
      `^(?:find|search|look\\s*up|lookup|show|list)(?:\\s+me)?\\s+(.+?)\\s+(${typeAlt})$`,
      "i"
    )
  );
  if (findThenType) {
    const entityHint = cleanHint(findThenType[1]);
    const entityType = detectEntityType(findThenType[2]!);
    // “show me Arif overdue tasks” is personal status, not find_task_by_name
    if (
      entityType === "task" &&
      (/\b(pending|open|overdue)\b/i.test(entityHint ?? "") ||
        isNovaPersonalTaskAskShape(q) ||
        isNovaLeadingPersonFocusTaskAsk(q))
    ) {
      return null;
    }
    if (entityType && entityHint && !MONEY_OR_VALUE.test(entityHint)) {
      return { entityType, entityHint, intent: `find_${entityType}_by_name` };
    }
  }

  const findTypeHint = q.match(
    new RegExp(
      `^(?:find|search|look\\s*up|lookup)\\s+(${typeAlt})\\s*[:\\-]?\\s+(.+)$`,
      "i"
    )
  );
  if (findTypeHint) {
    const entityType = detectEntityType(findTypeHint[1]!);
    const entityHint = cleanHint(findTypeHint[2]);
    if (entityType && entityHint && !MONEY_OR_VALUE.test(entityHint)) {
      return { entityType, entityHint, intent: `find_${entityType}_by_name` };
    }
  }

  // “what is <name>” / “what's <name>” — entity search, not catalog dead-end
  const whatIs = q.match(/^(?:what\s+is|what's|whats)\s+(.+)$/i);
  if (whatIs) {
    const rest = whatIs[1]!.trim();
    if (
      rest &&
      !MONEY_OR_VALUE.test(rest) &&
      !ATTENDANCE_CUE.test(rest) &&
      !/^(empower|nova|this|that|it)\b/i.test(rest)
    ) {
      const entityType = detectEntityType(rest);
      const stripped = cleanHint(
        rest
          .replace(
            /\b(the\s+)?(projects?|customers?|clients?|vendors?|suppliers?|employees?|staff|documents?|files?|invoices?|sales\s*orders?|orders?|cbg\s*quotations?|quotations?|quotes?|purchase\s*orders?|purchase\s*requests?|purchase\s*bills?|payment\s*requests?|receipts?|expenses?|approvals?|leave|bank\s*accounts?|tasks?|todos?)\b/gi,
            " "
          )
          .replace(/\s+/g, " ")
          .trim()
      );
      const entityHint = stripped || cleanHint(rest);
      if (entityHint && entityHint.length >= 2) {
        return {
          entityType,
          entityHint,
          intent: entityType ? `what_is_${entityType}` : "what_is_entity",
        };
      }
    }
  }

  return null;
}

/**
 * Metric + entity scope — e.g. "tasks pending in tata steels 800",
 * "pending tasks for tata steels 800", "approvals for Acme".
 * Party/project names must not become personHint.
 */
function matchScopedStatusMetric(query: string): {
  metric: string;
  entityHint: string;
  entityType: NovaSearchEntityType;
  focus: string | null;
  tools: string[];
  queryFamily: NovaQueryFamily;
  intent: string;
} | null {
  const q = query.trim().replace(/\s+/g, " ");
  if (!q) return null;

  // "pending payment from James School" / "payment receivable from Acme"
  // means customer/project receivables, not internal payment requests.
  const receivableFrom = q.match(
    /\b(?:pending\s+payments?|payments?\s+pending|payments?\s+receivables?|receivables?|customer\s+pending\s+amount|client\s+pending\s+amount)\s+(?:from|for|of|by)\s+(.+)$/i
  );
  if (receivableFrom) {
    const entityHint = cleanHint(receivableFrom[1]);
    if (entityHint && looksLikeScopedPartyOrProjectHint(entityHint)) {
      return {
        metric: "receivables",
        entityHint,
        entityType: "customer",
        focus: "outstanding",
        tools: ["receivables_summary", "customer_outstanding"],
        queryFamily: "money",
        intent: "receivables_for_entity",
      };
    }
  }

  // tasks pending in|at|on <entity>  (single-token brands OK — Avaada)
  const tasksIn = q.match(
    /\b(tasks?|todos?|kaam)\s+(?:(pending|open|overdue)\s+)?(?:in|at|on|for\s+project)\s+(.+)$/i
  );
  if (tasksIn) {
    const shared = parseEntityModuleAsk(q);
    const entityHint = cleanHint(shared?.entitySpan ?? tasksIn[3]);
    if (entityHint && looksLikeScopedPartyOrProjectHint(entityHint)) {
      return {
        metric: "tasks",
        entityHint,
        entityType: "project",
        focus: tasksIn[2]?.toLowerCase() ?? "pending",
        tools: ["tasks_summary"],
        queryFamily: "status",
        intent: "tasks_for_project",
      };
    }
  }

  // pending|open|overdue tasks in|at|on|for <entity>  (for + party/project only)
  const pendingTasks = q.match(
    /\b(pending|open|overdue)\s+(tasks?|todos?|kaam)\s+(?:in|at|on|for)\s+(.+)$/i
  );
  if (pendingTasks) {
    const shared = parseEntityModuleAsk(q);
    const entityHint = cleanHint(shared?.entitySpan ?? pendingTasks[3]);
    if (entityHint && looksLikeScopedPartyOrProjectHint(entityHint)) {
      return {
        metric: "tasks",
        entityHint,
        entityType: "project",
        focus: pendingTasks[1]!.toLowerCase(),
        tools: ["tasks_summary"],
        queryFamily: "status",
        intent: "tasks_for_project",
      };
    }
  }

  // approvals pending for|in <entity>
  if (APPROVALS_CUE.test(q)) {
    const appr = q.match(
      /\b(approvals?)\s+(?:(pending|open|awaiting)\s+)?(?:in|at|on|for)\s+(.+)$/i
    );
    if (appr) {
      const entityHint = cleanHint(appr[3]);
      if (entityHint && looksLikePartyOrProjectName(entityHint)) {
        return {
          metric: "approvals",
          entityHint,
          entityType: "project",
          focus: appr[2]?.toLowerCase() ?? "pending",
          tools: ["approvals_summary"],
          queryFamily: "approvals",
          intent: "approvals_for_entity",
        };
      }
    }
  }

  // `{party/project} + {module}` — e.g. "tata steel tasks", "Avaada invoices"
  // Party-shaped names only (never steals "aalok tasks").
  const partyDoc = matchNovaPartyDocumentAsk(q);
  if (partyDoc) {
    return {
      metric: "documents",
      entityHint: partyDoc.entityHint,
      entityType: "project" as NovaSearchEntityType,
      focus: null,
      tools: ["documents_search"],
      queryFamily: "docs" as NovaQueryFamily,
      intent: "documents_for_entity",
    };
  }
  const partyModule = matchLeadingPartyModule(q);
  if (partyModule) return partyModule;

  return null;
}

/** Optional list/show prefix — consumes “show me” / “give me”, not just “show”. */
const LEADING_SHOW =
  "(?:show|list|get|check|find|fetch|display|give)(?:\\s+me)?\\s+";

/**
 * Leading `{entity} {module}` — party/project-shaped entity only.
 * HR modules (attendance/leave/kpi) stay on the person path.
 */
function matchLeadingPartyModule(q: string): {
  metric: string;
  entityHint: string;
  entityType: NovaSearchEntityType;
  focus: string | null;
  tools: string[];
  queryFamily: NovaQueryFamily;
  intent: string;
} | null {
  type Row = {
    re: RegExp;
    metric: string;
    tools: string[];
    queryFamily: NovaQueryFamily;
    entityType: NovaSearchEntityType;
    intent: string;
    focusFrom?: (m: RegExpMatchArray) => string | null;
  };

  const rows: Row[] = [
    // "tata steel pending tasks" / "James School open todos"
    {
      re: new RegExp(
        `^(?:${LEADING_SHOW})?(.+?)\\s+(pending|open|overdue)\\s+(tasks?|todos?)\\s*$`,
        "i"
      ),
      metric: "tasks",
      tools: ["tasks_summary"],
      queryFamily: "status",
      entityType: "project",
      intent: "tasks_for_entity",
      focusFrom: (m) => m[2]?.toLowerCase() ?? "pending",
    },
    // "tata steel tasks" / "James School tasks"
    {
      re: new RegExp(
        `^(?:${LEADING_SHOW})?(.+?)\\s+(tasks?|todos?)(?:\\s+(pending|open|overdue))?\\s*$`,
        "i"
      ),
      metric: "tasks",
      tools: ["tasks_summary"],
      queryFamily: "status",
      entityType: "project",
      intent: "tasks_for_entity",
      focusFrom: (m) => m[3]?.toLowerCase() ?? null,
    },
    // "Avaada sales orders" / "tata steel SO" — before bare "sales" → invoices
    {
      re: new RegExp(
        `^(?:${LEADING_SHOW})?(.+?)\\s+(?:sales\\s+orders?|sos?)\\s*$`,
        "i"
      ),
      metric: "sales_orders",
      tools: ["sales_orders_summary"],
      queryFamily: "money",
      entityType: "customer",
      intent: "sales_orders_for_entity",
    },
    // "Avaada invoices" / "tata steel billing"
    {
      re: new RegExp(
        `^(?:${LEADING_SHOW})?(.+?)\\s+(invoices?|billing|sales)\\s*$`,
        "i"
      ),
      metric: "invoices",
      tools: ["sales_summary"],
      queryFamily: "money",
      entityType: "customer",
      intent: "invoices_for_entity",
    },
    // GRN before bare "receipt" — "goods receipt" must not steal receipts_summary
    {
      re: new RegExp(
        `^(?:${LEADING_SHOW})?(.+?)\\s+(?:grns?|goods\\s+receipts?(?:\\s+notes?)?|material\\s+receipts?)\\s*$`,
        "i"
      ),
      metric: "grn",
      tools: ["grn_summary"],
      queryFamily: "inventory",
      entityType: "project",
      intent: "grn_for_entity",
    },
    // "Avaada receipts"
    {
      re: new RegExp(
        `^(?:${LEADING_SHOW})?(.+?)\\s+(receipts?|collections?)\\s*$`,
        "i"
      ),
      metric: "receipts",
      tools: ["receipts_summary"],
      queryFamily: "money",
      entityType: "customer",
      intent: "receipts_for_entity",
    },
    // "Avaada receivables" / "tata steel outstanding"
    {
      re: new RegExp(
        `^(?:${LEADING_SHOW})?(.+?)\\s+(receivables?|outstanding)\\s*$`,
        "i"
      ),
      metric: "receivables",
      tools: ["receivables_summary", "customer_outstanding"],
      queryFamily: "money",
      entityType: "customer",
      intent: "receivables_for_entity",
    },
    // "Avaada credit notes"
    {
      re: new RegExp(
        `^(?:${LEADING_SHOW})?(.+?)\\s+(?:credit\\s+notes?|debit\\s+notes?)\\s*$`,
        "i"
      ),
      metric: "credit_notes",
      tools: ["credit_notes_summary"],
      queryFamily: "money",
      entityType: "customer",
      intent: "credit_notes_for_entity",
    },
    // "tata steel expenses" / "Avaada kharcha"
    {
      re: new RegExp(
        `^(?:${LEADING_SHOW})?(.+?)\\s+(expenses?|kharcha)\\s*$`,
        "i"
      ),
      metric: "expenses",
      tools: ["staff_expense_summary"],
      queryFamily: "money",
      entityType: "project",
      intent: "expenses_for_entity",
    },
    // "Avaada payment requests"
    {
      re: new RegExp(
        `^(?:${LEADING_SHOW})?(.+?)\\s+(?:payment\\s+requests?)\\s*$`,
        "i"
      ),
      metric: "payment_requests",
      tools: ["payment_requests_summary"],
      queryFamily: "money",
      entityType: "vendor",
      intent: "payment_requests_for_entity",
    },
    // "tata steel delivery" / "James School deliveries"
    {
      re: new RegExp(
        `^(?:${LEADING_SHOW})?(.+?)\\s+(deliver(?:y|ies)|dispatch(?:es)?)\\s*$`,
        "i"
      ),
      metric: "delivery",
      tools: ["delivery_summary"],
      queryFamily: "status",
      entityType: "project",
      intent: "delivery_for_entity",
    },
    // "tata steel documents" / "James School photos"
    {
      re: new RegExp(
        `^(?:${LEADING_SHOW})?(.+?)\\s+(documents?|photos?|pictures?|images?|files?|attachments?)\\s*$`,
        "i"
      ),
      metric: "documents",
      tools: ["documents_search"],
      queryFamily: "docs",
      entityType: "project",
      intent: "documents_for_entity",
    },
    // "tata p&id" / "Tata Steels P&ID" — piping & instrumentation drawings
    {
      re: new RegExp(
        `^(?:${LEADING_SHOW})?(.+?)\\s+(?:p\\s*&\\s*id|p\\s+and\\s+id|p\\s*n?ids?|piping(?:\\s+and)?\\s+instrument(?:ation)?(?:\\s+diagrams?)?)\\s*$`,
        "i"
      ),
      metric: "documents",
      tools: ["documents_search"],
      queryFamily: "docs",
      entityType: "project",
      intent: "documents_for_entity",
    },
    // "tata steel POs" / "Avaada purchase orders"
    {
      re: new RegExp(
        `^(?:${LEADING_SHOW})?(.+?)\\s+(?:purchase\\s+orders?|pos?)\\s*$`,
        "i"
      ),
      metric: "purchase_orders",
      tools: ["purchase_orders_summary"],
      queryFamily: "money",
      entityType: "vendor",
      intent: "pos_for_entity",
    },
    // "tata steel approvals"
    {
      re: new RegExp(
        `^(?:${LEADING_SHOW})?(.+?)\\s+(approvals?)(?:\\s+(pending|open|awaiting))?\\s*$`,
        "i"
      ),
      metric: "approvals",
      tools: ["approvals_summary"],
      queryFamily: "approvals",
      entityType: "project",
      intent: "approvals_for_entity",
      focusFrom: (m) => m[3]?.toLowerCase() ?? null,
    },
  ];

  for (const row of rows) {
    const m = q.match(row.re);
    if (!m) continue;
    const rawSpan = m[1]?.trim() ?? "";
    const roleParsed = parseNovaEntityRoleSpan(rawSpan);
    const entityHint = cleanHint(roleParsed?.entitySpan ?? rawSpan);
    if (!entityHint) continue;
    // Never treat module/domain words as the entity span
    if (
      /^(tasks?|todos?|invoices?|billing|sales|receipts?|collections?|receivables?|outstanding|documents?|photos?|pictures?|images?|files?|attachments?|approvals?|pending|open|overdue|purchase|orders?|pos?|sos?|expenses?|kharcha|payment|requests?|credit|debit|notes?|deliver(?:y|ies)|dispatch(?:es)?|grns?|goods|material|stock|bank|banking|cash)$/i.test(
        entityHint
      )
    ) {
      continue;
    }
    // Never bind WH/cue / ranking leftovers as the party
    if (/^(?:why|what|who|how|when|where)\b/i.test(entityHint)) {
      continue;
    }
    if (isNovaRankingWhEntityNoise(entityHint)) continue;
    // Tasks/approvals: party/project-shaped OR single-token brand (avaada tasks).
    // Money/docs/delivery/GRN: also allow single-token customers (Avaada invoices).
    // POL-1: no bank/banking/cash module rows here — bank stays RBAC-hard only.
    const allowSingleToken =
      row.queryFamily === "money" ||
      row.queryFamily === "docs" ||
      row.queryFamily === "status" ||
      row.queryFamily === "approvals" ||
      row.metric === "delivery" ||
      row.metric === "grn" ||
      row.metric === "tasks";
    // Always reject non-referential spans unless hard party/project shaped
    // (“completed most” is ≥2 words but must never bind).
    const okEntity =
      acceptsPartyEntitySpan(entityHint, allowSingleToken) &&
      !(
        isNovaNonReferentialName(entityHint) &&
        !looksLikeHardPartyOrProjectName(entityHint)
      );
    if (!okEntity) continue;
    // Kind hint from “X project …” raises project prefer over customer
    const entityType =
      roleParsed?.entityKindHint === "project"
        ? "project"
        : roleParsed?.entityKindHint === "customer"
          ? "customer"
          : roleParsed?.entityKindHint === "vendor"
            ? "vendor"
            : row.entityType;
    return {
      metric: row.metric,
      entityHint,
      entityType,
      focus: row.focusFrom?.(m) ?? null,
      tools: row.tools,
      queryFamily: row.queryFamily,
      intent: row.intent,
    };
  }
  return null;
}

function emptySlots(partial?: Partial<NovaSearchSlots>): NovaSearchSlots {
  return {
    intent: "unknown",
    entityType: null,
    entityHint: null,
    metric: null,
    period: null,
    comparison: null,
    focus: null,
    queryFamily: "unknown",
    tools: [],
    confidence: "low",
    searchQuery: null,
    ...partial,
  };
}

/**
 * Validate / coerce a candidate (rules or Think) into NovaSearchSlots.
 * Drops invented tools; clamps families/entity types; never invents money.
 */
export function validateNovaSearchSlots(
  candidate: Partial<NovaSearchSlots> | null | undefined,
  allowedToolIds: ReadonlySet<string> | readonly string[]
): NovaSearchSlots | null {
  if (!candidate || typeof candidate !== "object") return null;
  const allow =
    allowedToolIds instanceof Set
      ? allowedToolIds
      : new Set(allowedToolIds);

  const family = candidate.queryFamily;
  if (!family || !ALLOWED_FAMILIES.has(family)) return null;

  let entityType: NovaSearchEntityType = null;
  if (candidate.entityType != null) {
    if (!ALLOWED_ENTITY_TYPES.has(String(candidate.entityType))) return null;
    entityType = candidate.entityType as Exclude<NovaSearchEntityType, null>;
  }

  // Think may emit entityKindHint separately — map to entityType when absent.
  const kindHintRaw = (candidate as { entityKindHint?: unknown }).entityKindHint;
  if (
    !entityType &&
    (kindHintRaw === "project" ||
      kindHintRaw === "customer" ||
      kindHintRaw === "vendor" ||
      kindHintRaw === "employee" ||
      kindHintRaw === "staff")
  ) {
    entityType = kindHintRaw === "staff" ? "employee" : kindHintRaw;
  }

  const tools = Array.isArray(candidate.tools)
    ? candidate.tools.filter((t) => typeof t === "string" && allow.has(t))
    : [];

  // Never allow write-shaped tools through Think / SearchEngine
  let safeTools = tools.filter(
    (t) => !/\b(create|update|delete|approve|reject|write)\b/i.test(t)
  );

  let entityHint =
    typeof candidate.entityHint === "string"
      ? cleanHint(candidate.entityHint)
      : null;

  // Strip role words from Think/rules entityHint (“Avaada project” → Avaada)
  if (entityHint) {
    const role = parseNovaEntityRoleSpan(entityHint);
    if (role?.entitySpan) {
      entityHint = role.entitySpan;
      if (
        !entityType &&
        (role.entityKindHint === "project" ||
          role.entityKindHint === "customer" ||
          role.entityKindHint === "vendor")
      ) {
        entityType = role.entityKindHint;
      }
    } else {
      entityHint = normalizeNovaEntityLookupHint(entityHint) || entityHint;
    }
  }

  let metric =
    typeof candidate.metric === "string" ? candidate.metric.slice(0, 60) : null;

  // Family × metric × entity combo matrix — drop illegal mixes (Think cannot invent them).
  const MONEY_TOOLS = new Set([
    "sales_summary",
    "receipts_summary",
    "overdue_invoices",
    "receivables_summary",
    "customer_outstanding",
    "payables_summary",
    "profitability_summary",
    "bank_accounts_summary",
    "order_book_summary",
    "director_dashboard_summary",
  ]);
  const HR_SENSITIVE_TOOLS = new Set([
    "salary_summary",
    "payroll_summary",
    "payslip_summary",
    "incentives_summary",
    "advances_summary",
  ]);
  const ATTENDANCE_TOOLS = new Set([
    "attendance_late_summary",
    "attendance_summary",
    "attendance_present_summary",
    "attendance_absent_summary",
  ]);

  if (family === "deny_write") {
    safeTools = [];
    metric = null;
    entityHint = null;
  }

  // Resolve / people identity — allow directory/search tools only (never money packs)
  if (family === "resolve" || family === "people") {
    safeTools = safeTools.filter((t) => RESOLVE_SAFE_TOOLS.has(t));
    if (family === "people" && entityType === "employee" && safeTools.length === 0) {
      if (allow.has("staff_summary")) safeTools = ["staff_summary"];
    }
  }

  if (family === "approvals") {
    safeTools = safeTools.filter(
      (t) =>
        !MONEY_TOOLS.has(t) &&
        !ATTENDANCE_TOOLS.has(t) &&
        (t.includes("approval") ||
          t.includes("pending") ||
          t === "payment_requests_summary" ||
          t === "overtime_summary" ||
          t === "regularisation_summary")
    );
    if (metric && /\b(sales|receipts?|attendance|late)\b/i.test(metric)) {
      metric = null;
    }
  }

  if (family === "attendance") {
    safeTools = safeTools.filter((t) => !MONEY_TOOLS.has(t) && !HR_SENSITIVE_TOOLS.has(t));
    if (metric && /\b(sales|receipts?|salary|payroll|bank)\b/i.test(metric)) {
      metric = null;
    }
    if (entityType === "customer" || entityType === "vendor") {
      entityType = null;
      entityHint = null;
    }
  }

  if (family === "money") {
    safeTools = safeTools.filter((t) => !ATTENDANCE_TOOLS.has(t));
    if (entityType === "document") {
      entityType = null;
      entityHint = null;
    }
    // Party money asks are customer/vendor/project — not silent employee bind
    if (
      entityType === "employee" &&
      !/\b(salary|payroll|payslip|incentive|advance)\b/i.test(metric ?? "")
    ) {
      entityType = null;
      entityHint = null;
    }
  }

  if (entityType === "document") {
    safeTools = safeTools.filter((t) => !MONEY_TOOLS.has(t) && !HR_SENSITIVE_TOOLS.has(t));
  }

  if (entityType === "employee") {
    safeTools = safeTools.filter(
      (t) =>
        !MONEY_TOOLS.has(t) ||
        HR_SENSITIVE_TOOLS.has(t) ||
        t === "my_work_summary" ||
        t === "leave_summary" ||
        t === "tasks_summary"
    );
  }

  if (metric && /\b(salary|payroll|payslip)\b/i.test(metric)) {
    safeTools = safeTools.filter(
      (t) => HR_SENSITIVE_TOOLS.has(t) || ATTENDANCE_TOOLS.has(t) || t === "leave_summary"
    );
    // Salary metric never binds a customer/vendor party as the money entity
    if (entityType === "customer" || entityType === "vendor") {
      entityType = null;
      entityHint = null;
    }
  }

  // Illegal: mix attendance + sales in one Think plan
  if (
    safeTools.some((t) => ATTENDANCE_TOOLS.has(t)) &&
    safeTools.some((t) => MONEY_TOOLS.has(t))
  ) {
    if (family === "attendance") {
      safeTools = safeTools.filter((t) => !MONEY_TOOLS.has(t));
    } else {
      safeTools = safeTools.filter((t) => !ATTENDANCE_TOOLS.has(t));
    }
  }

  return emptySlots({
    intent:
      typeof candidate.intent === "string" && candidate.intent.trim()
        ? candidate.intent.trim().slice(0, 80)
        : "unknown",
    entityType,
    entityHint,
    metric,
    period:
      typeof candidate.period === "string" ? candidate.period.slice(0, 60) : null,
    comparison:
      typeof candidate.comparison === "string"
        ? candidate.comparison.slice(0, 40)
        : null,
    focus:
      typeof candidate.focus === "string" ? candidate.focus.slice(0, 40) : null,
    queryFamily: family,
    tools: safeTools,
    confidence: candidate.confidence === "high" ? "high" : "low",
    interpretedAs: Array.isArray(candidate.interpretedAs)
      ? candidate.interpretedAs.filter((s) => typeof s === "string").slice(0, 6)
      : undefined,
    searchQuery:
      typeof candidate.searchQuery === "string"
        ? cleanHint(candidate.searchQuery)
        : entityHint,
    suppressPersonHint:
      candidate.suppressPersonHint === true ||
      (entityType === "project" && Boolean(entityHint)),
  });
}

/**
 * Fill NovaSearchEngine slots from user text (deterministic rules).
 */
export function runNovaSearchEngine(query: string): NovaSearchSlots {
  const raw = query.trim().replace(/\s+/g, " ");
  if (!raw) {
    return emptySlots({ intent: "empty", confidence: "high" });
  }

  if (
    !HOWTO_GUIDE_CUE.test(raw) &&
    (WRITE_CUE.test(raw) || /\bplease\s+(approve|reject|delete|create|update)\b/i.test(raw))
  ) {
    return emptySlots({
      intent: "deny_write",
      queryFamily: "deny_write",
      confidence: "high",
      tools: [],
      interpretedAs: ["read-only guard"],
    });
  }

  // “save/give/download report” → NOVA pack save follow-up, never ERP reports_snapshot
  if (isNovaSaveReportFollowUp(raw)) {
    return emptySlots({
      intent: "save_nova_report",
      queryFamily: "unknown",
      confidence: "high",
      tools: [],
      interpretedAs: ["save nova report"],
    });
  }

  // Bare / embedded document numbers → data search (not summary / money packs)
  const docNoPatterns: Array<{
    re: RegExp;
    entityType: Exclude<NovaSearchEntityType, null>;
    label: string;
  }> = [
    { re: /\b(TSK-\d{4}-\d+)\b/i, entityType: "task", label: "task search" },
    { re: /\b(APR-\d{4}-\d+)\b/i, entityType: "approval", label: "approval search" },
    { re: /\b(BPG-CBG-\d{4}-\d+)\b/i, entityType: "quotation", label: "quotation search" },
    { re: /\b(EXP-\d[\w-]*)\b/i, entityType: "expense", label: "expense search" },
  ];
  for (const row of docNoPatterns) {
    const hit = raw.match(row.re);
    if (!hit) continue;
    const id = hit[1]!.toUpperCase();
    return emptySlots({
      intent: `find_${row.entityType}_by_no`,
      entityType: row.entityType,
      entityHint: id,
      period: null,
      queryFamily: "search",
      tools: ["search_entities"],
      confidence: "high",
      interpretedAs: [row.label],
      searchQuery: id,
      suppressPersonHint: true,
    });
  }

  // Who-is / identity before bare-entity steal (“who is arun” ≠ party “who is arun”)
  const whoIs = matchWhoIsLookup(raw);
  if (whoIs) {
    return emptySlots({
      intent: whoIs.intent,
      entityType: whoIs.entityType,
      entityHint: whoIs.entityHint,
      period: null,
      queryFamily: whoIs.queryFamily,
      tools: whoIs.tools,
      confidence: "high",
      interpretedAs:
        whoIs.entityType === "employee"
          ? ["staff profile"]
          : whoIs.entityType
            ? [`${whoIs.entityType} identity`]
            : ["entity resolve"],
      searchQuery: whoIs.entityHint,
      // Staff who-is needs personHint for staff_summary; party who-is suppresses it
      suppressPersonHint: whoIs.entityType !== "employee",
    });
  }

  // How-is / health BEFORE name search + bare resolve (never party “how is …”)
  const health = matchHowIsHealth(raw);
  if (health) return health;

  // Task completion ranking BEFORE party-module steal (“who completed most task”)
  if (isNovaTaskCompletionRankingAsk(raw)) {
    return emptySlots({
      intent: "task_completion_ranking",
      queryFamily: "status",
      metric: "tasks",
      focus: "completed",
      tools: ["tasks_summary"],
      confidence: "high",
      interpretedAs: ["task completion ranking"],
      entityHint: null,
      searchQuery: null,
      suppressPersonHint: true,
    });
  }

  // Soft personal-task shapes BEFORE name-search / party-module steal
  // (“show me Arif overdue tasks”, leading “Arif pending tasks”).
  // Hard party spans (James School / Tata Steels) stay on party resolve.
  if (
    !isNovaPlaceFramedTaskAsk(raw) &&
    (isNovaLeadingPersonFocusTaskAsk(raw) || isNovaPersonalTaskAskShape(raw)) &&
    !looksLikeHardPartyOrProjectName(raw)
  ) {
    const focus =
      /\boverdue\b/i.test(raw) ? "overdue" : /\bopen\b/i.test(raw) ? "open" : /\bpending\b/i.test(raw) ? "pending" : null;
    return emptySlots({
      intent: "tasks_for_person",
      queryFamily: "status",
      metric: "tasks",
      focus,
      tools: ["tasks_summary"],
      confidence: "high",
      interpretedAs: ["personal tasks"],
      entityHint: null,
      searchQuery: null,
      suppressPersonHint: false,
    });
  }

  // Named project detail (James School / work+tasks+photos) → Project Command, not FY projects_summary
  const namedProject = matchNamedProjectDetailAsk(raw);
  if (namedProject) return namedProject;

  // Name lookup wins before lexicon projects_summary / money packs
  const named = matchNameSearch(raw);
  if (named) {
    if (named.entityType === "document") {
      return emptySlots({
        intent: named.intent,
        entityType: "document",
        entityHint: named.entityHint,
        period: null,
        queryFamily: "docs",
        tools: ["documents_search"],
        confidence: "high",
        interpretedAs: ["document search"],
        searchQuery: named.entityHint,
      });
    }
    if (named.entityType === "employee") {
      return emptySlots({
        intent: named.intent,
        entityType: "employee",
        entityHint: named.entityHint,
        period: null,
        queryFamily: "people",
        tools: ["staff_summary"],
        confidence: "high",
        interpretedAs: ["staff profile"],
        searchQuery: named.entityHint,
        suppressPersonHint: false,
      });
    }
    if (named.entityType === "task") {
      return emptySlots({
        intent: named.intent,
        entityType: "task",
        entityHint: named.entityHint,
        period: null,
        queryFamily: "search",
        tools: ["search_entities"],
        confidence: "high",
        interpretedAs: ["task search"],
        searchQuery: named.entityHint,
        suppressPersonHint: true,
      });
    }
    const tool = novaResolveToolForEntityType(named.entityType) ?? "search_entities";
    return emptySlots({
      intent: named.intent,
      entityType: named.entityType,
      entityHint: named.entityHint,
      period: null,
      queryFamily: "search",
      tools: [tool],
      confidence: "high",
      interpretedAs: [
        named.entityType
          ? `${named.entityType} name search`
          : "entity name search",
      ],
      searchQuery: named.entityHint,
      suppressPersonHint: true,
    });
  }

  // Tasks / approvals scoped to a project/party
  const scoped = matchScopedStatusMetric(raw);
  if (scoped) {
    return emptySlots({
      intent: scoped.intent,
      entityType: scoped.entityType,
      entityHint: scoped.entityHint,
      metric: scoped.metric,
      period: null,
      focus: scoped.focus,
      queryFamily: scoped.queryFamily,
      tools: scoped.tools,
      confidence: "high",
      interpretedAs: [
        scoped.metric === "tasks"
          ? "tasks (project-scoped)"
          : `${scoped.metric} (entity-scoped)`,
      ],
      searchQuery: scoped.entityHint,
      suppressPersonHint: true,
    });
  }

  // “SEARCH: SRI RAMA” / “FIND: Acme” — strip colon prefix before generic find strip
  {
    const colonSearch = raw.match(
      /^(?:search|find|look\s*up|lookup)\s*:\s*(.+)$/i
    );
    if (colonSearch) {
      const hint = cleanHint(colonSearch[1]);
      if (hint && hint.length >= 2 && !MONEY_OR_VALUE.test(hint) && !ATTENDANCE_CUE.test(hint)) {
        const entityType = detectEntityType(hint);
        return emptySlots({
          intent: "explicit_search",
          entityType,
          entityHint: hint,
          period: null,
          queryFamily: "search",
          tools: entityType === "document" ? ["documents_search"] : ["search_entities"],
          confidence: "high",
          interpretedAs: [
            entityType === "document"
              ? "document search"
              : entityType
                ? `${entityType} search`
                : "entity search",
          ],
          searchQuery: hint,
          suppressPersonHint: true,
        });
      }
    }
  }

  // Explicit find/search without typed name pattern.
  // Typed approval finds ("find approval APR-…") are handled by matchNameSearch / id patterns;
  // bare "approvals" stays on the approvals summary family (do not steal).
  if (
    /\b(find|search|look\s*up|lookup)\b/i.test(raw) &&
    !MONEY_OR_VALUE.test(raw) &&
    !ATTENDANCE_CUE.test(raw) &&
    !APPROVALS_CUE.test(raw) &&
    !TASK_METRIC.test(raw)
  ) {
    const hint = cleanHint(
      raw
        .replace(
          /\b(find|search|look\s*up|lookup|show|list|get|fetch|display|for|about|projects?|customers?|clients?|vendors?|suppliers?|named|called|with\s+name|name|tasks?|todos?|cbg\s*quotations?|quotations?|quotes?|purchase\s*orders?|purchase\s*requests?|purchase\s*bills?|payment\s*requests?|receipts?|expenses?|leave|bank\s*accounts?|invoices?|sales\s*orders?|orders?)\b/gi,
          " "
        )
        .replace(/\s+/g, " ")
        .trim()
    );
    if (hint && hint.length >= 2) {
      const entityType = detectEntityType(raw);
      return emptySlots({
        intent: "explicit_search",
        entityType,
        entityHint: hint,
        period: null,
        queryFamily: "search",
        tools: entityType === "document" ? ["documents_search"] : ["search_entities"],
        confidence: "high",
        interpretedAs: [
          entityType === "document"
            ? "document search"
            : entityType
              ? `${entityType} search`
              : "entity search",
        ],
        searchQuery: hint,
        suppressPersonHint: true,
      });
    }
  }

  // Bare party / company → resolve (clarify), not FY summary.
  // Never treat known domain/module words or WH/how-is frames as a party name.
  // Allow up to 12 tokens so long project/legal names resolve (not metric clarify junk).
  if (
    !MONEY_OR_VALUE.test(raw) &&
    !ATTENDANCE_CUE.test(raw) &&
    !APPROVALS_CUE.test(raw) &&
    !STATUS_CUE.test(raw) &&
    !TASK_METRIC.test(raw) &&
    !HOW_IS_FRAME.test(raw) &&
    !DOMAIN_BARE_STOP.test(raw) &&
    !isNovaNonReferentialName(raw) &&
    BARE_PARTY_NAME_RE.test(raw) &&
    !/\b(projects?|customers?|vendors?|today|yesterday|week|month|fy|help)\b/i.test(raw)
  ) {
    // Multi-word / company-ish → ranked search. Single-token bare name → empty tools so
    // metric clarify fires (Acme/Avaada), not a silent empty search miss.
    const tools = looksLikePartyOrProjectName(raw) ? ["search_entities"] : [];
    return emptySlots({
      intent: "resolve_entity",
      entityType: null,
      entityHint: raw,
      period: null,
      queryFamily: "resolve",
      tools,
      confidence: "high",
      interpretedAs: ["entity resolve"],
      searchQuery: raw,
    });
  }

  if (ATTENDANCE_CUE.test(raw)) {
    return emptySlots({
      intent: "attendance",
      queryFamily: "attendance",
      metric: "attendance",
      focus: /\babsent/i.test(raw)
        ? "absent"
        : /\bpunch(?:ed|ing|es)?[\s-]*out|out[\s-]*times?/i.test(raw)
          ? "punch_out"
          : /\bpresent/i.test(raw)
            ? "present"
            : /\blate/i.test(raw)
              ? "late"
              : "overview",
      confidence: "low",
    });
  }

  if (APPROVALS_CUE.test(raw)) {
    return emptySlots({
      intent: "approvals",
      queryFamily: "approvals",
      metric: "approvals",
      confidence: "low",
    });
  }

  if (MONEY_OR_VALUE.test(raw)) {
    return emptySlots({
      intent: "money",
      queryFamily: "money",
      confidence: "low",
    });
  }

  if (STATUS_CUE.test(raw) || TASK_METRIC.test(raw)) {
    return emptySlots({
      intent: "status",
      queryFamily: "status",
      metric: TASK_METRIC.test(raw) ? "tasks" : null,
      confidence: "low",
    });
  }

  return emptySlots({ intent: "unknown", queryFamily: "unknown" });
}

/**
 * True when SearchEngine owns routing before wrong skill defaults.
 * Includes name search, resolve, deny_write, and entity-scoped status tools.
 */
export function novaSearchEngineIsDecisive(slots: NovaSearchSlots): boolean {
  if (slots.confidence !== "high") return false;
  if (slots.queryFamily === "deny_write") return true;
  if (slots.queryFamily === "search" && slots.tools.length > 0) return true;
  if (slots.queryFamily === "docs" && slots.tools.length > 0) return true;
  if (slots.queryFamily === "people" && slots.tools.length > 0) return true;
  if (slots.queryFamily === "resolve") return true;
  // Health / money / bank / attendance packs with tools own routing
  if (
    slots.tools.length > 0 &&
    (slots.queryFamily === "money" ||
      slots.queryFamily === "bank" ||
      slots.queryFamily === "attendance" ||
      slots.queryFamily === "status" ||
      slots.queryFamily === "approvals" ||
      slots.queryFamily === "inventory")
  ) {
    return true;
  }
  if (
    (slots.queryFamily === "status" || slots.queryFamily === "approvals") &&
    slots.tools.length > 0 &&
    Boolean(slots.entityHint)
  ) {
    return true;
  }
  return false;
}

/** Catalog snippet for NovaThink system prompt (modules + skills). */
export function buildNovaThinkCatalogText(opts: {
  lexiconLines: string[];
  skillToolIds: string[];
}): string {
  return [
    "Query families: search | status | money | attendance | approvals | people | docs | bank | inventory | resolve | follow_up | deny_write | unknown",
    "Entity types: project | customer | vendor | employee | document | invoice | order | task | quotation | purchase_order | purchase_request | purchase_bill | receipt | payment_request | expense | approval | leave | bank_account | null",
    "entityKindHint: project | customer | vendor | staff | null — from role words; entityHint must be stripped (never “Avaada project”).",
    "Modules / topics:",
    ...opts.lexiconLines.slice(0, 100),
    "Registered skill toolIds (pick only from this list; empty tools ok for clarify/resolve):",
    opts.skillToolIds.slice(0, 140).join(", "),
    "Rules: READ-ONLY; never invent ₹ / people; never free SQL;",
    "how to|guide me|can I do|where do I → howto_guide (tools [], entityHint null) — NOT deny_write, NOT party resolve;",
    "can <role> see/view/access|who can see|does <role> have access → permission_help (tools []) — NOT profitability/salary/bank dumps;",
    "bare create/update/delete/approve without how-to → deny_write;",
    "typos: salry→salary, taks→tasks; domain nouns (salary/tasks/attendance/payment requests) are modules not parties;",
    "who is <name> → people + employee + staff_summary (not unmatched catalog); who is late → attendance;",
    "who is customer|vendor|project X → resolve + search_entities; find/search/what is X → search + search_entities;",
    "how is business|how's business|how are we doing → money + month_performance (business_health alias), period this month — NEVER resolve;",
    "how is sales|how's sales|how is revenue → money + sales_summary, period this month — NEVER entityHint how is;",
    "how is cash|banking → cash_banking; how is this month's attendance → attendance_month;",
    "Name lookups (projects named X) → search + search_entities, period null, no projects_summary;",
    "Named project (James School project / work+tasks+photos) → project_command (+ documents_search when photos); entity resolve first — never FY projects_summary;",
    "Bare party name → resolve + search_entities (ranked); 0 matches → unmatched triage; tasks in/for <project> → status + tasks_summary + entityHint + entityKindHint project.",
    "{party|project} tasks|invoices|receipts|sales orders|receivables|outstanding|credit notes|expenses|payment requests|delivery|GRN|documents|POs → entityHint + scoped skill + suppressPersonHint (never staff bind); {person} tasks → personHint staff path.",
    "Never party-bind bank/banking/cash — bank tools stay RBAC-hard (POL-1).",
  ].join("\n");
}
