/**
 * Shared entity + module parse for full utterances.
 * “tasks in avaada”, “Avaada project task”, “avaada ka task”,
 * “why are avaada tasks overdue”, “… trend for avaada”.
 */

import {
  looksLikePartyOrProjectName,
  looksLikeSingleTokenPartyLabel,
  normalizeNovaEntityLookupHint,
} from "@/lib/nova/party-name";
import {
  isNovaRankingWhEntityNoise,
  isNovaTaskCompletionRankingAsk,
  isNovaPersonalTaskAskShape,
  scrubPersonalTaskEntityTail,
} from "@/lib/nova/query-structure/personal-task";
import {
  NOVA_ENTITY_ROLE_WORDS,
  NOVA_HINGLISH_LINKER,
  NOVA_MODULE_ROLE_WORDS,
} from "@/lib/nova/query-structure/role-words";

export type NovaEntityKindHint = "project" | "customer" | "vendor" | "staff" | null;
export type NovaModuleHint =
  | "tasks"
  | "invoices"
  | "receipts"
  | "sales_orders"
  | "receivables"
  | "approvals"
  | "documents"
  | "delivery"
  | "grn"
  | "pos"
  | "expenses"
  | "payment_requests"
  | "projects"
  | "attendance"
  | "leave"
  | "kpi"
  | null;

export type NovaEntityModuleParse = {
  entitySpan: string;
  entityKindHint: NovaEntityKindHint;
  moduleHint: NovaModuleHint;
  strippedRoleWords: string[];
};

const FOCUS_WORDS = /^(?:pending|open|overdue|late)$/i;
const WH_PREFIX = /^(?:why|what|who|how|when|where|are|is|was|were|the|a|an)\b/i;

function classifyToken(
  token: string,
  state: { entityKindHint: NovaEntityKindHint; moduleHint: NovaModuleHint }
): boolean {
  if (FOCUS_WORDS.test(token)) return true;
  if (!NOVA_ENTITY_ROLE_WORDS.test(token) && !NOVA_HINGLISH_LINKER.test(token)) {
    return false;
  }
  if (NOVA_HINGLISH_LINKER.test(token)) return true;
  if (NOVA_MODULE_ROLE_WORDS.projects.test(token)) {
    state.entityKindHint = state.entityKindHint ?? "project";
  }
  if (NOVA_MODULE_ROLE_WORDS.tasks.test(token)) {
    state.moduleHint = state.moduleHint ?? "tasks";
  }
  if (NOVA_MODULE_ROLE_WORDS.invoices.test(token)) {
    state.moduleHint = state.moduleHint ?? "invoices";
    state.entityKindHint = state.entityKindHint ?? "customer";
  }
  if (NOVA_MODULE_ROLE_WORDS.receipts.test(token)) {
    state.moduleHint = state.moduleHint ?? "receipts";
    state.entityKindHint = state.entityKindHint ?? "customer";
  }
  if (NOVA_MODULE_ROLE_WORDS.sales_orders.test(token)) {
    state.moduleHint = state.moduleHint ?? "sales_orders";
    state.entityKindHint = state.entityKindHint ?? "customer";
  }
  if (NOVA_MODULE_ROLE_WORDS.purchase_orders.test(token)) {
    state.moduleHint = state.moduleHint ?? "pos";
    state.entityKindHint = state.entityKindHint ?? "vendor";
  }
  if (NOVA_MODULE_ROLE_WORDS.purchase_requests.test(token)) {
    // Strip PR/indent from entity span; ambiguous PR clarify owns tool pick.
  }
  if (NOVA_MODULE_ROLE_WORDS.documents.test(token)) {
    state.moduleHint = state.moduleHint ?? "documents";
  }
  if (NOVA_MODULE_ROLE_WORDS.approvals.test(token)) {
    state.moduleHint = state.moduleHint ?? "approvals";
  }
  if (NOVA_MODULE_ROLE_WORDS.delivery.test(token)) {
    state.moduleHint = state.moduleHint ?? "delivery";
  }
  if (NOVA_MODULE_ROLE_WORDS.grn.test(token)) {
    state.moduleHint = state.moduleHint ?? "grn";
  }
  if (NOVA_MODULE_ROLE_WORDS.expenses.test(token)) {
    state.moduleHint = state.moduleHint ?? "expenses";
  }
  if (NOVA_MODULE_ROLE_WORDS.outstanding.test(token)) {
    state.moduleHint = state.moduleHint ?? "receivables";
    state.entityKindHint = state.entityKindHint ?? "customer";
  }
  return true;
}

function scrubWhPrefix(span: string): string {
  let s = span.trim().replace(/\s+/g, " ");
  while (s && WH_PREFIX.test(s)) {
    s = s.replace(WH_PREFIX, "").trim();
  }
  return s;
}

/**
 * Strip role words from a candidate span and infer kind/module hints.
 * “Avaada project task” → span Avaada, kind project, module tasks.
 * “Avaada ka task” → span Avaada, module tasks (Hinglish linker).
 */
export function parseNovaEntityRoleSpan(raw: string): NovaEntityModuleParse | null {
  const tokens = raw
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean);
  if (tokens.length === 0) return null;

  const strippedRoleWords: string[] = [];
  const state: {
    entityKindHint: NovaEntityKindHint;
    moduleHint: NovaModuleHint;
  } = { entityKindHint: null, moduleHint: null };

  // Walk trailing focus + role nouns + hinglish linkers
  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1]!;
    if (!classifyToken(last, state)) break;
    strippedRoleWords.unshift(last);
    tokens.pop();
  }

  // Peel leading “the” / WH glue
  while (tokens.length > 0 && /^(?:the|a|an|why|are|is|was|were)$/i.test(tokens[0]!)) {
    tokens.shift();
  }

  let entitySpan = normalizeNovaEntityLookupHint(scrubWhPrefix(tokens.join(" ")));
  if (!entitySpan || entitySpan.length < 2) return null;
  if (WH_PREFIX.test(entitySpan)) return null;

  // Explicit “… project” anywhere in original (already peeled) reinforces kind
  if (/\bprojects?\b/i.test(raw) && !state.entityKindHint) {
    state.entityKindHint = "project";
  }

  return {
    entitySpan,
    entityKindHint: state.entityKindHint,
    moduleHint: state.moduleHint,
    strippedRoleWords,
  };
}

/**
 * Full-utterance parse: place framing + leading party-module + role strip.
 * Prefer this over per-engine regexes when filling structure.
 */
export function parseEntityModuleAsk(query: string): NovaEntityModuleParse | null {
  const q = query.trim().replace(/\s+/g, " ");
  if (!q) return null;

  // Ranking WH asks never invent a party span (“who completed most task”)
  if (isNovaTaskCompletionRankingAsk(q)) return null;

  // “tasks in|at|on|for project <entity>”
  const tasksIn = q.match(
    /\b(tasks?|todos?|kaam)\s+(?:(pending|open|overdue)\s+)?(?:in|at|on|for\s+project)\s+(.+)$/i
  );
  if (tasksIn?.[3]) {
    const role = parseNovaEntityRoleSpan(tasksIn[3]);
    if (role) {
      return {
        ...role,
        moduleHint: role.moduleHint ?? "tasks",
        entityKindHint: role.entityKindHint ?? "project",
      };
    }
  }

  // “pending|open|overdue tasks in|at|on|for <entity>”
  const pendingTasks = q.match(
    /\b(pending|open|overdue)\s+(tasks?|todos?|kaam)\s+(?:in|at|on|for)\s+(.+)$/i
  );
  if (pendingTasks?.[3]) {
    const role = parseNovaEntityRoleSpan(pendingTasks[3]);
    if (role) {
      return {
        ...role,
        moduleHint: role.moduleHint ?? "tasks",
        entityKindHint: role.entityKindHint ?? "project",
      };
    }
  }

  // “why … <entity> tasks …” / “… <entity> tasks overdue”
  const whyTasks = q.match(
    /\b(?:why\s+(?:are\s+|is\s+)?)?(.+?)\s+(tasks?|todos?|kaam)(?:\s+(?:pending|open|overdue))?\s*$/i
  );
  if (whyTasks?.[1] && /\b(tasks?|todos?|kaam)\b/i.test(q)) {
    const rawSpan = scrubWhPrefix(whyTasks[1]);
    // Reject pure cue / ranking / WH leftovers
    if (
      rawSpan &&
      !isNovaRankingWhEntityNoise(rawSpan) &&
      !/^(?:why|are|is|the|a|an|late|task|completion|trend|frequently|which|what|who)$/i.test(
        rawSpan
      ) &&
      !/\b(completion|trend|frequently|always|often|most|more|completed|finished)\b/i.test(
        rawSpan
      )
    ) {
      const role = parseNovaEntityRoleSpan(`${rawSpan} ${whyTasks[2]}`);
      if (
        role &&
        !isNovaRankingWhEntityNoise(role.entitySpan) &&
        acceptsPartyEntitySpan(role.entitySpan, true)
      ) {
        return {
          ...role,
          moduleHint: role.moduleHint ?? "tasks",
          entityKindHint: role.entityKindHint ?? "project",
        };
      }
    }
  }

  // Delivery / installation scoped asks:
  // “pending delivery for Avaada”, “installation delayed for customer James School”,
  // “what is delivered for project C0001-P001”.
  const deliveryScoped = q.match(
    /\b(?:deliver(?:y|ies|ed)?|dispatch(?:es|ed)?|shipped|install(?:ation|ations|ed|ing)?|technicians?)\b.*\b(?:for|of|in|at|on)\s+(?:(project|customer)\s+)?(.+)$/i
  );
  if (deliveryScoped?.[2]) {
    const explicitKind = deliveryScoped[1]?.toLowerCase() as "project" | "customer" | undefined;
    const role = parseNovaEntityRoleSpan(
      `${deliveryScoped[2]} ${explicitKind ?? ""} delivery`
    );
    if (
      role &&
      !isNovaRankingWhEntityNoise(role.entitySpan) &&
      acceptsPartyEntitySpan(role.entitySpan, true)
    ) {
      return {
        ...role,
        moduleHint: "delivery",
        entityKindHint: explicitKind ?? role.entityKindHint,
      };
    }
  }

  // Trailing “for|of|from <entity>” (trend / analysis / Reader caption soft scope)
  const trailingFor = q.match(
    /\b(?:for|of|from)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9&.\-]*(?:\s+[A-Za-z][A-Za-z0-9&.\-]*){0,4})\s*$/i
  );
  if (trailingFor?.[1]) {
    const scrubbed = scrubPersonalTaskEntityTail(trailingFor[1]);
    const role = parseNovaEntityRoleSpan(scrubbed);
    const span =
      role?.entitySpan ||
      normalizeNovaEntityLookupHint(scrubbed) ||
      null;
    if (
      span &&
      !isNovaRankingWhEntityNoise(span) &&
      acceptsPartyEntitySpan(span, true)
    ) {
      // Bare “pending|open for Name” implies tasks module (personal shape).
      const bareStatusForPerson =
        isNovaPersonalTaskAskShape(q) &&
        /^(?:(?:show|list|get|check|find|fetch|display|give)(?:\s+me)?\s+)?(?:pending|open)\s+for\s+/i.test(
          q
        ) &&
        !/\b(tasks?|todos?|kaam)\b/i.test(q);
      const moduleHint: NovaModuleHint =
        role?.moduleHint ??
        (/\b(tasks?|todos?|kaam|completion)\b/i.test(q) || bareStatusForPerson
          ? "tasks"
          : /\b(invoices?|billing)\b/i.test(q)
            ? "invoices"
            : /\b(receipts?|collections?)\b/i.test(q)
              ? "receipts"
              : /\b(deliver(?:y|ies|ed)?|dispatch(?:es|ed)?|shipped|install(?:ation|ations|ed|ing)?|technicians?)\b/i.test(q)
                ? "delivery"
                : null);
      // Soft “tasks for {person}” — staff kind only on personal-task shapes
      // (never trend/analysis “for avaada” place soft-scope).
      const entityKindHint: NovaEntityKindHint =
        role?.entityKindHint ??
        (moduleHint === "tasks" &&
        isNovaPersonalTaskAskShape(q) &&
        !looksLikePartyOrProjectName(span)
          ? "staff"
          : moduleHint === "tasks"
            ? "project"
            : moduleHint === "delivery"
              ? null
              : moduleHint
              ? "customer"
              : null);
      return {
        entitySpan: span,
        entityKindHint,
        moduleHint,
        strippedRoleWords: role?.strippedRoleWords ?? [],
      };
    }
  }

  // Hinglish: “avaada ka task / james school ke tasks”
  const hinglish = q.match(
    /^(.+?)\s+(?:ka|ki|ke)\s+(tasks?|todos?|kaam|invoices?|receipts?|projects?|deliver(?:y|ies)|dispatch(?:es)?|installations?)\s*$/i
  );
  if (hinglish?.[1]) {
    const role = parseNovaEntityRoleSpan(`${hinglish[1]} ${hinglish[2]}`);
    if (role) return role;
  }

  // Hinglish status-only personal: “Arif ka pending” → staff + tasks
  if (isNovaPersonalTaskAskShape(q)) {
    const hinglishStatus = q.match(
      /^([A-Za-z][A-Za-z0-9'.\-]{1,40}(?:\s+[A-Za-z][A-Za-z0-9'.\-]{1,30}){0,2})\s+(?:ka|ki|ke)\s+(?:pending|open|overdue)\s*$/i
    );
    if (hinglishStatus?.[1]) {
      const span = normalizeNovaEntityLookupHint(hinglishStatus[1]) || hinglishStatus[1].trim();
      if (
        span &&
        !isNovaRankingWhEntityNoise(span) &&
        !looksLikePartyOrProjectName(span) &&
        acceptsPartyEntitySpan(span, true)
      ) {
        return {
          entitySpan: span,
          entityKindHint: "staff",
          moduleHint: "tasks",
          strippedRoleWords: ["pending"],
        };
      }
    }
  }

  // Trailing role strip on full query (“Avaada project task”, “james school project”)
  const full = parseNovaEntityRoleSpan(q);
  if (full && full.strippedRoleWords.length > 0) {
    const cleaned = scrubWhPrefix(full.entitySpan);
    if (
      cleaned &&
      !WH_PREFIX.test(cleaned) &&
      !isNovaRankingWhEntityNoise(cleaned) &&
      acceptsPartyEntitySpan(cleaned, true)
    ) {
      return { ...full, entitySpan: cleaned };
    }
  }

  return null;
}

/**
 * Prefer Prisma entity types from kind hint — project ahead of customer when
 * the utterance said “project” / task place framing.
 */
export function preferTypesForKindHint(
  kind: NovaEntityKindHint
): Array<"customer" | "vendor" | "project"> | undefined {
  if (kind === "project") return ["project", "customer"];
  if (kind === "customer") return ["customer", "project"];
  if (kind === "vendor") return ["vendor", "project"];
  return undefined;
}

/**
 * Period / date tokens are never a party or project (“july sales”, “today receipts”).
 * Guards entity-scope misfires where a month / relative day looks like a single-token brand.
 */
const TEMPORAL_ENTITY_NOISE =
  /^(?:today|todays|yesterday|yesterdays|tomorrow|tonight|now|this|last|current|next|week|weekly|month|monthly|year|yearly|annual|fy|f\.y|quarter|quarterly|q[1-4]|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)$/i;

/**
 * Bare module / metric noun phrases are never a party name (“payment requests pending”,
 * “invoices”, “approvals”). Prevents a module ask from being scoped to a fake entity.
 */
const MODULE_PHRASE_ENTITY_NOISE =
  /^(?:payments?|payment\s+requests?|requests?|invoices?|billing|sales|revenue|turnover|receipts?|collections?|receivables?|payables?|outstanding|deliver(?:y|ies)|dispatch(?:es)?|installations?|approvals?|expenses?|advances?|incentives?|salary|payroll|tasks?|todos?|leave|attendance|kpi|orders?|sales\s+orders?|purchase\s+orders?|pos?|sos?|bills?|purchase\s+bills?|quotations?|quotes?|credit\s+notes?|debit\s+notes?|grns?|documents?|vouchers?|ledgers?|stock|inventory)$/i;

/**
 * Bare quantifiers (“how many payment requests”, “how much sales”) are never a party —
 * count phrasing must not be scoped to a fake “many” / “much” entity.
 */
const QUANTIFIER_ENTITY_NOISE =
  /^(?:many|much|few|fewer|several|couple|numerous|multiple|lots|plenty|count|total|number|no\.?)$/i;

/**
 * Multi-word financial-year / quarter / year-range period tokens are never a party.
 * Bare `fy` / `q1` are already caught by TEMPORAL_ENTITY_NOISE; this also rejects the
 * year-bearing forms ("fy 25-26", "fy 2025-26", "q1 2026", "h1 26") and bare year
 * ranges ("25-26", "2025-26") that otherwise slipped through as fake party spans.
 */
const FY_QUARTER_PERIOD_NOISE =
  /^(?:f\.?\s*y\.?|fy|cy|financial\s+year|fiscal\s+year|calendar\s+year|quarter|q[1-4]|h[12])\s*(?:of\s+)?(?:'?\d{2,4})?(?:\s*[-/]\s*'?\d{2,4})?$/i;
const YEAR_RANGE_ENTITY_NOISE = /^'?(?:20)?\d{2}\s*[-/]\s*'?(?:20)?\d{2}$/;

/** True when a span is a temporal, module, or quantifier noun phrase (never a real party). */
export function isNovaTemporalOrModuleEntityNoise(span: string): boolean {
  const n = span.trim().toLowerCase().replace(/\s+/g, " ");
  if (!n) return true;
  return (
    TEMPORAL_ENTITY_NOISE.test(n) ||
    MODULE_PHRASE_ENTITY_NOISE.test(n) ||
    QUANTIFIER_ENTITY_NOISE.test(n) ||
    FY_QUARTER_PERIOD_NOISE.test(n) ||
    YEAR_RANGE_ENTITY_NOISE.test(n)
  );
}

/** True when span may bind as party/project (multi-word, hard token, or brand). */
export function acceptsPartyEntitySpan(span: string, allowSingleToken: boolean): boolean {
  if (isNovaRankingWhEntityNoise(span)) return false;
  if (isNovaTemporalOrModuleEntityNoise(span)) return false;
  if (looksLikePartyOrProjectName(span)) return true;
  if (allowSingleToken && looksLikeSingleTokenPartyLabel(span)) return true;
  return false;
}
