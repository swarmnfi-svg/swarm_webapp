/**
 * NovaPlan — stable query-plan layer for NOVA.
 *
 * Goal: deterministic understand → plan → tools → facts → answer.
 * LLM may fill low-confidence slots only; never free-picks tools.
 *
 * Pipeline (target):
 *   normalize → slots (lexicon/intent) → NovaPlan → tool router (contracts)
 *   → facts pack → answer (LLM or template) with existing money/period guards
 *
 * Migration:
 *   Phase A: types, module contracts, pure helpers + tests
 *   Phase B (wired): router consumes plan; ambiguity only when plan incomplete
 *   Phase C: follow-ups merge slots; shrink LLM planner to slot-fill only
 */
import { selectToolsFromLexicon, type NovaTopicId } from "@/lib/ai/nova-lexicon";
import {
  composeNovaIntent,
  type NovaIntent,
  type NovaPeriodGrain,
  type NovaSlot,
} from "@/lib/ai/nova-intent";
import type { SessionUser } from "@/auth";
import { DEFAULT_TIMEZONE } from "@/lib/datetime-pure";
import {
  novaSearchEngineIsDecisive,
  runNovaSearchEngine,
} from "@/lib/nova/nova-search-engine";
import {
  isNovaTemporalOrModuleEntityNoise,
  parseEntityModuleAsk,
  refuseSilentOrgWide,
} from "@/lib/nova/query-structure";

export type NovaPlanConfidence = "high" | "low";

/** How a missing period should be filled for a module (tool-router contract). */
export type NovaPeriodDefault =
  | "none"
  | "latest"
  | "current_month"
  | "today"
  | "open_queue";

export type NovaPlanPeriod = {
  grain: NovaPeriodGrain | "latest" | "open";
  label: string;
  source: "explicit" | "default" | "follow_up";
};

export type NovaPlanStatus = "pending" | "open" | "overdue" | "awaiting";

/**
 * Structured plan — single source of truth for routing & follow-ups.
 * Replaces ad-hoc skipSteal allowlists once Phase B wires the router.
 */
export type NovaPlan = {
  /** Normalized / resolved query text this plan was built from */
  query: string;
  /** Primary lexicon topic when known */
  module?: NovaTopicId;
  /** Focus within module (e.g. late | absent | present, or free metric hint) */
  metric?: string;
  period?: NovaPlanPeriod;
  entity?: string;
  /** Bound entity DB id (or stable code) from ClarifyAct — skip re-fuzzy when set */
  entityId?: string;
  entityType?: "customer" | "vendor" | "project";
  entityCode?: string;
  person?: string;
  status?: NovaPlanStatus;
  /** Resolved tool ids — empty when clarifying or incomplete */
  tools: string[];
  confidence: NovaPlanConfidence;
  /** Present only when the plan is incomplete and must ask the user */
  clarifyReason?: string;
  interpretedAs?: string[];
  /** Which period default was applied (if any) */
  periodDefaultApplied?: NovaPeriodDefault;
  /** Provenance for tests / debug */
  source: "compose" | "lexicon" | "follow_up" | "llm_slots" | "merged" | "search_engine";
};

/** Per-module routing contract consumed by the future tool router. */
export type NovaModuleContract = {
  topicId: NovaTopicId;
  tools: string[];
  /** Slots that must be present (or defaulted) before running tools */
  required: Array<"period" | "status" | "person" | "entity" | "metric">;
  periodDefault: NovaPeriodDefault;
  /** Human label for clarify / interpretedAs */
  label: string;
};

/**
 * Module defaults — KPI→latest, delivery/stock→month, queues→open.
 * Money metrics keep periodDefault "none" (bare word still clarifies upstream).
 */
export const NOVA_MODULE_CONTRACTS: readonly NovaModuleContract[] = [
  { topicId: "kpi", tools: ["kpi_summary"], required: [], periodDefault: "latest", label: "KPI" },
  {
    topicId: "kpi_report",
    tools: ["kpi_report"],
    required: [],
    periodDefault: "latest",
    label: "KPI report card",
  },
  {
    topicId: "nova_analysis",
    tools: ["nova_analysis"],
    required: [],
    periodDefault: "latest",
    label: "Analysis",
  },
  {
    topicId: "nova_trend",
    tools: ["nova_trend"],
    required: [],
    periodDefault: "latest",
    label: "Trend",
  },
  {
    topicId: "delivery",
    tools: ["delivery_summary"],
    required: [],
    periodDefault: "current_month",
    label: "deliveries",
  },
  {
    topicId: "stock",
    tools: ["stock_summary"],
    required: [],
    periodDefault: "current_month",
    label: "stock",
  },
  {
    topicId: "grn",
    tools: ["grn_summary"],
    // Period required — ambiguity still asks; tool may default month only after period known
    required: ["period"],
    periodDefault: "none",
    label: "GRN",
  },
  {
    topicId: "staff_expenses",
    tools: ["staff_expense_summary"],
    // Bare expenses/kharcha still period-clarify (not silent month steal)
    required: ["period"],
    periodDefault: "none",
    label: "expenses",
  },
  {
    topicId: "attendance",
    tools: ["attendance_late_summary"],
    required: ["period"],
    periodDefault: "today",
    label: "attendance",
  },
  {
    topicId: "receipts",
    tools: ["receipts_summary"],
    required: ["period"],
    periodDefault: "none",
    label: "receipts",
  },
  {
    topicId: "sales_invoices",
    tools: ["sales_summary"],
    required: ["period"],
    periodDefault: "none",
    label: "billing / invoices",
  },
  {
    topicId: "payment_requests",
    tools: ["payment_requests_summary"],
    required: [],
    periodDefault: "open_queue",
    label: "payment requests",
  },
  {
    topicId: "approvals",
    tools: ["approvals_summary"],
    required: [],
    periodDefault: "open_queue",
    label: "approvals",
  },
  {
    topicId: "tasks",
    tools: ["tasks_summary"],
    required: [],
    periodDefault: "open_queue",
    label: "tasks",
  },
  {
    topicId: "leave",
    tools: ["leave_summary"],
    required: [],
    periodDefault: "open_queue",
    label: "leave",
  },
  {
    topicId: "staff_advances",
    tools: ["staff_advances_summary"],
    required: [],
    periodDefault: "open_queue",
    label: "staff advances",
  },
  {
    topicId: "salary",
    tools: ["salary_summary"],
    required: [],
    periodDefault: "current_month",
    label: "salary",
  },
  {
    topicId: "incentives",
    tools: ["incentives_summary"],
    required: [],
    periodDefault: "current_month",
    label: "incentives",
  },
  {
    topicId: "vendors",
    tools: ["vendors_summary"],
    required: [],
    periodDefault: "none",
    label: "vendors",
  },
  {
    topicId: "projects",
    tools: ["projects_summary"],
    required: [],
    periodDefault: "none",
    label: "projects",
  },
  {
    topicId: "documents",
    tools: ["documents_open"],
    required: [],
    periodDefault: "none",
    label: "documents",
  },
  {
    topicId: "settings",
    tools: ["settings_open"],
    required: [],
    periodDefault: "none",
    label: "settings",
  },
  {
    topicId: "appearance",
    tools: ["appearance_open"],
    required: [],
    periodDefault: "none",
    label: "appearance",
  },
  {
    topicId: "vendor_bank",
    tools: ["vendor_bank_open"],
    required: [],
    periodDefault: "none",
    label: "vendor bank details",
  },
  {
    topicId: "purchase_requests",
    tools: ["purchase_requests_summary"],
    required: [],
    periodDefault: "open_queue",
    label: "purchase requests",
  },
  {
    topicId: "purchase_orders",
    tools: ["purchase_orders_summary"],
    required: [],
    periodDefault: "open_queue",
    label: "purchase orders",
  },
  {
    topicId: "sales_orders",
    tools: ["sales_orders_summary"],
    required: [],
    periodDefault: "open_queue",
    label: "sales orders",
  },
  {
    topicId: "customers",
    tools: ["customers_summary"],
    required: [],
    periodDefault: "none",
    label: "customers",
  },
  {
    topicId: "staff",
    tools: ["staff_summary"],
    required: [],
    periodDefault: "none",
    label: "staff",
  },
  {
    topicId: "bank_accounts",
    tools: ["bank_accounts_summary"],
    required: [],
    periodDefault: "none",
    label: "bank accounts",
  },
  {
    topicId: "bank_recon",
    tools: ["bank_recon_summary"],
    required: [],
    periodDefault: "current_month",
    label: "bank reconciliation",
  },
  {
    topicId: "receivables",
    tools: ["receivables_summary", "overdue_invoices"],
    required: [],
    periodDefault: "open_queue",
    label: "receivables",
  },
  {
    topicId: "payables",
    tools: ["purchase_bills_summary"],
    required: [],
    periodDefault: "open_queue",
    label: "purchase bills",
  },
  {
    topicId: "customer_outstanding",
    tools: ["customer_outstanding"],
    required: [],
    periodDefault: "open_queue",
    label: "customer outstanding",
  },
  {
    topicId: "accounts_ledger",
    tools: ["accounts_snapshot"],
    required: [],
    periodDefault: "none",
    label: "accounts",
  },
  {
    topicId: "tally",
    tools: ["tally_status"],
    required: [],
    periodDefault: "none",
    label: "Tally",
  },
  {
    topicId: "reports",
    tools: ["reports_snapshot", "gstr_snapshot"],
    required: [],
    periodDefault: "current_month",
    label: "reports",
  },
  {
    topicId: "cbg_quotations",
    tools: ["cbg_quotations_summary"],
    required: [],
    periodDefault: "open_queue",
    label: "CBG quotations",
  },
  {
    topicId: "credit_notes",
    tools: ["credit_notes_summary"],
    required: [],
    periodDefault: "current_month",
    label: "credit notes",
  },
  {
    topicId: "order_book",
    tools: ["order_book_summary"],
    required: [],
    periodDefault: "none",
    label: "order book",
  },
  {
    topicId: "profitability",
    tools: ["profitability_summary"],
    required: [],
    periodDefault: "none",
    label: "profitability",
  },
  {
    topicId: "finance_dashboard",
    tools: ["director_dashboard_summary"],
    required: [],
    periodDefault: "none",
    label: "director / finance dashboard",
  },
  {
    topicId: "gst_docs",
    tools: ["gst_docs_summary"],
    required: [],
    periodDefault: "current_month",
    label: "GST documents",
  },
  {
    topicId: "daily_brief",
    tools: ["daily_brief"],
    required: [],
    periodDefault: "today",
    label: "daily brief",
  },
  {
    topicId: "my_work",
    tools: ["my_work_summary"],
    required: [],
    periodDefault: "open_queue",
    label: "my work",
  },
  {
    topicId: "pending_workflow",
    tools: ["pending_workflow_counts"],
    required: [],
    periodDefault: "open_queue",
    label: "pending workflow",
  },
  {
    topicId: "notifications",
    tools: ["notifications_open"],
    required: [],
    periodDefault: "none",
    label: "notifications",
  },
  {
    topicId: "whatsapp",
    tools: ["whatsapp_open"],
    required: [],
    periodDefault: "none",
    label: "WhatsApp",
  },
  {
    topicId: "portal",
    tools: ["portal_open"],
    required: [],
    periodDefault: "none",
    label: "portal",
  },
  {
    topicId: "automation",
    tools: ["automation_open"],
    required: [],
    periodDefault: "none",
    label: "automation",
  },
  {
    topicId: "links",
    tools: ["links_open"],
    required: [],
    periodDefault: "none",
    label: "links",
  },
  {
    topicId: "bank_sms",
    tools: ["bank_sms_open"],
    required: [],
    periodDefault: "none",
    label: "bank SMS",
  },
  {
    topicId: "system_backup",
    tools: ["backup_open"],
    required: [],
    periodDefault: "none",
    label: "system backup",
  },
  {
    topicId: "system_tools",
    tools: ["system_tools_open"],
    required: [],
    periodDefault: "none",
    label: "system tools",
  },
  {
    topicId: "audit_log",
    tools: ["audit_log_open"],
    required: [],
    periodDefault: "none",
    label: "audit log",
  },
] as const;

const CONTRACT_BY_TOPIC = new Map(
  NOVA_MODULE_CONTRACTS.map((c) => [c.topicId, c] as const)
);

export function getNovaModuleContract(topicId: NovaTopicId): NovaModuleContract | undefined {
  return CONTRACT_BY_TOPIC.get(topicId);
}

/** True when the plan already selected runnable tools (incl. intentional search). */
export function novaPlanHasReadyTools(plan: NovaPlan): boolean {
  if (plan.tools.includes("search_entities") && plan.source === "search_engine") {
    return true;
  }
  return plan.tools.some((t) => t !== "search_entities");
}

/**
 * Ambiguity may run only when the plan explicitly needs a user answer.
 * Ready tools ⇒ never steal into bare-period / bare-entity clarify.
 * Low-confidence empty plans return false so lexicon / slot-fill can continue.
 */
export function shouldClarifyNovaPlan(plan: NovaPlan): boolean {
  if (novaPlanHasReadyTools(plan)) return false;
  return Boolean(plan.clarifyReason?.trim());
}

/**
 * Runnable = has tools (or clarify already decided) at high confidence,
 * or low confidence with no tools (lexicon/LLM slot-fill may continue).
 */
export function isNovaPlanRunnable(plan: NovaPlan): boolean {
  if (plan.clarifyReason && plan.tools.length === 0) return false;
  if (novaPlanHasReadyTools(plan)) return true;
  return false;
}

/**
 * Attach lexicon-selected tools when compose left the plan empty (Phase B).
 * Does not clear an existing compose clarify unless tools become ready.
 */
export function withNovaPlanTools(plan: NovaPlan, tools: string[]): NovaPlan {
  // Intentional SearchEngine search_entities is ready; otherwise strip bare search filler
  const fromSearchEngine = plan.source === "search_engine";
  const ready = fromSearchEngine
    ? tools.filter(Boolean)
    : tools.filter((t) => t !== "search_entities");
  if (!ready.length) return plan;

  let next: NovaPlan = {
    ...plan,
    tools: [...ready],
    confidence: "high",
    // Preserve search_engine even when attaching tools onto an empty compose plan
    // (otherwise search_entities-only never becomes ready → metric clarify junk).
    source: fromSearchEngine ? "search_engine" : plan.tools.length ? plan.source : "lexicon",
    clarifyReason: undefined,
  };

  if (!next.module && ready.length === 1) {
    const hit = NOVA_MODULE_CONTRACTS.find((c) => c.tools.includes(ready[0]!));
    if (hit) next = { ...next, module: hit.topicId };
  }

  return next;
}

/**
 * Apply period defaults, then either keep ready tools (clear steal clarifies)
 * or keep/attach clarify when the plan is incomplete / missing required period.
 *
 * `ambiguityClarify` is injected from novaAmbiguityClarification (keeps this module pure).
 */
export function finalizeNovaPlan(
  plan: NovaPlan,
  opts?: { ambiguityClarify?: string | null }
): NovaPlan {
  let next = applyNovaPlanPeriodDefault(plan);
  const ambiguity = opts?.ambiguityClarify?.trim() || undefined;

  // P1 gate: entitySpan + scoped tool ⇒ never silent org-wide (bind or clarify).
  {
    const structure = parseEntityModuleAsk(next.query) ?? parseEntityModuleAsk(next.entity ?? "");
    const entitySpan =
      structure?.entitySpan?.trim() ||
      (next.entity && !next.entityId ? next.entity.trim() : "") ||
      null;
    const refuse = refuseSilentOrgWide({
      entitySpan,
      tools: next.tools,
      boundEntityId: next.entityId ?? null,
      personHint: next.person ?? null,
    });
    if (refuse && !next.entityId && entitySpan && !next.person) {
      if (!next.entity?.trim()) {
        return {
          ...next,
          tools: [],
          clarifyReason: refuse.reason,
          confidence: "high",
        };
      }
    }
  }

  if (novaPlanHasReadyTools(next)) {
    const missing = novaPlanMissingRequired(next);
    if (missing.includes("period")) {
      const clarify = ambiguity ?? next.clarifyReason;
      if (clarify) {
        return {
          ...next,
          tools: [],
          clarifyReason: clarify,
          confidence: "high",
          period: undefined,
          periodDefaultApplied: undefined,
        };
      }
    }
    // Ready domain tools win — no bare-entity / which-metric steal
    return { ...next, clarifyReason: undefined };
  }

  const clarify = next.clarifyReason?.trim() || ambiguity;
  if (clarify) {
    return {
      ...next,
      clarifyReason: clarify,
      confidence: next.confidence === "low" ? "high" : next.confidence,
    };
  }
  return next;
}

/** Apply module period default when period is missing and contract allows it. */
export function applyNovaPlanPeriodDefault(plan: NovaPlan): NovaPlan {
  if (plan.period || !plan.module) return plan;
  const contract = getNovaModuleContract(plan.module);
  if (!contract || contract.periodDefault === "none") return plan;

  const def = contract.periodDefault;
  let period: NovaPlanPeriod;
  switch (def) {
    case "latest":
      period = { grain: "latest", label: "latest period", source: "default" };
      break;
    case "current_month":
      period = { grain: "month", label: "this month", source: "default" };
      break;
    case "today":
      period = { grain: "day", label: "today", source: "default" };
      break;
    case "open_queue":
      period = { grain: "open", label: "open / pending", source: "default" };
      break;
    default:
      return plan;
  }

  return {
    ...plan,
    period,
    periodDefaultApplied: def,
  };
}

/** Check required slots against contract (after defaults). */
export function novaPlanMissingRequired(plan: NovaPlan): string[] {
  if (!plan.module) return plan.tools.length ? [] : ["module"];
  const contract = getNovaModuleContract(plan.module);
  if (!contract) return [];

  const withDefaults = applyNovaPlanPeriodDefault(plan);
  const missing: string[] = [];
  for (const slot of contract.required) {
    if (slot === "period" && !withDefaults.period) missing.push("period");
    if (slot === "status" && !withDefaults.status) missing.push("status");
    if (slot === "person" && !withDefaults.person) missing.push("person");
    if (slot === "entity" && !withDefaults.entity) missing.push("entity");
    if (slot === "metric" && !withDefaults.metric) missing.push("metric");
  }
  return missing;
}

function slotsToPartial(slots: NovaSlot[]): Partial<NovaPlan> {
  const out: Partial<NovaPlan> = {};
  const metrics: Extract<NovaSlot, { kind: "metric" }>[] = [];
  for (const s of slots) {
    if (s.kind === "period") {
      out.period = { grain: s.grain, label: s.raw, source: "explicit" };
    } else if (s.kind === "metric") {
      metrics.push(s);
    } else if (s.kind === "status") {
      out.status = s.value;
    } else if (s.kind === "person") {
      out.person = s.name;
    } else if (s.kind === "entity") {
      out.entity = s.name;
    }
  }
  if (metrics.length === 1) {
    out.module = metrics[0].topicId;
    if (metrics[0].focus) out.metric = metrics[0].focus;
  } else if (metrics.length > 1) {
    // Prefer non-attendance when mixed; otherwise first
    const preferred =
      metrics.find((m) => m.topicId !== "attendance") ?? metrics[0];
    out.module = preferred.topicId;
    if (preferred.focus) out.metric = preferred.focus;
  }
  return out;
}

/**
 * Bridge from today's composeNovaIntent → NovaPlan (Phase A adapter).
 * Does not change runtime routing until Phase B swaps the call sites.
 */
export function buildNovaPlanFromIntent(
  query: string,
  intent: NovaIntent,
  source: NovaPlan["source"] = "compose"
): NovaPlan {
  const fromSlots = slotsToPartial(intent.slots);
  // Temporal / module / FY-period / quantifier tokens are never a real party — drop
  // them so a bare "outstanding receivables" / "q1 sales" / "fy 25-26 receipts" never
  // scopes the tool to a fake entity (which then trips org-wide clarify / empty resolve).
  if (fromSlots.entity && isNovaTemporalOrModuleEntityNoise(fromSlots.entity)) {
    fromSlots.entity = undefined;
  }
  let plan: NovaPlan = {
    query,
    module: fromSlots.module,
    metric: fromSlots.metric,
    period: fromSlots.period,
    entity: fromSlots.entity,
    person: fromSlots.person,
    status: fromSlots.status,
    tools: [...intent.tools],
    confidence: intent.confidence,
    clarifyReason: intent.clarify,
    interpretedAs: intent.interpretedAs ? [...intent.interpretedAs] : undefined,
    source,
  };

  // Infer module from tools when slots didn't pin a single topic
  if (!plan.module && plan.tools.length === 1) {
    const tool = plan.tools[0];
    const hit = NOVA_MODULE_CONTRACTS.find((c) => c.tools.includes(tool));
    if (hit) plan = { ...plan, module: hit.topicId };
  }

  // Ready tools win over any spurious clarify carried on the intent
  if (novaPlanHasReadyTools(plan)) {
    plan = { ...plan, clarifyReason: undefined };
    if (!plan.period) plan = applyNovaPlanPeriodDefault(plan);
  }

  return plan;
}

/** Convenience: SearchEngine (rules) then compose → plan (pure sync; no LLM). */
export function buildNovaPlan(
  query: string,
  now = new Date(),
  timeZone?: string,
  user?: SessionUser | null
): NovaPlan {
  const search = runNovaSearchEngine(query);
  const lexiconOwnsResolve =
    search.queryFamily === "resolve" &&
    selectToolsFromLexicon(query).tools.some((t) => t !== "search_entities");
  if (
    novaSearchEngineIsDecisive(search) &&
    search.tools.length > 0 &&
    !lexiconOwnsResolve
  ) {
    const periodFromSearch = search.period?.trim()
      ? ({
          grain: "month" as const,
          label: search.period,
          source: "explicit" as const,
        })
      : undefined;
    const plan: NovaPlan = {
      query,
      entity: search.entityHint ?? undefined,
      person:
        search.entityType === "employee" && !search.suppressPersonHint
          ? search.entityHint ?? undefined
          : undefined,
      metric: search.metric ?? search.focus ?? undefined,
      tools: [...search.tools],
      confidence: "high",
      interpretedAs: search.interpretedAs,
      source: "search_engine",
      // Name search / entity-scoped status: never invent FY period defaults
      // Health packs may carry explicit "this month"
      period: periodFromSearch,
      periodDefaultApplied: undefined,
    };
    if (search.queryFamily === "search" || search.queryFamily === "docs") {
      return plan; // no module → no FY default via applyNovaPlanPeriodDefault
    }
    if (search.queryFamily === "people") {
      return { ...plan, module: "staff" };
    }
    if (search.queryFamily === "resolve") {
      return plan;
    }
    if (search.tools.includes("month_performance")) {
      return { ...plan, module: "month_performance" };
    }
    if (search.tools.includes("sales_summary")) {
      return { ...plan, module: "sales_invoices" };
    }
    if (search.tools.includes("cash_banking")) {
      return { ...plan, module: "cash_banking" };
    }
    if (search.tools.includes("attendance_month")) {
      return { ...plan, module: "attendance_month" };
    }
    // Entity-scoped tasks/approvals — pin module without period default steal
    if (search.tools.includes("tasks_summary")) {
      return { ...plan, module: "tasks", status: search.focus === "overdue" ? "overdue" : search.focus === "open" ? "open" : "pending" };
    }
    if (search.tools.includes("approvals_summary")) {
      return { ...plan, module: "approvals" };
    }
    return plan;
  }

  const intent = composeNovaIntent(query, now, timeZone ?? DEFAULT_TIMEZONE, user);
  return buildNovaPlanFromIntent(query, intent, "compose");
}

/** Routing word for rebuilt follow-up queries (tools/lexicon still key off text). */
const MODULE_ROUTING_WORD: Partial<Record<NovaTopicId, string>> = {
  sales_invoices: "sales",
  receipts: "receipts",
  attendance: "attendance",
  staff_expenses: "expenses",
  delivery: "delivery",
  stock: "stock",
  grn: "grn",
  kpi: "kpi",
  salary: "salary",
  incentives: "incentives",
  leave: "leave",
  tasks: "tasks",
  projects: "projects",
  vendors: "vendors",
  payment_requests: "payment requests",
  approvals: "approvals",
  staff_advances: "advances",
};

/**
 * Rebuild a short routing query from plan slots — never assistant ₹ prose.
 * Used after follow-up slot merges so tools re-run on entity/period/metric only.
 */
export function novaPlanToRoutingQuery(plan: NovaPlan): string {
  const parts: string[] = [];
  if (plan.person) parts.push(plan.person);
  if (plan.entity) parts.push(plan.entity);

  const metricWord =
    plan.metric?.trim() ||
    (plan.module ? MODULE_ROUTING_WORD[plan.module] : undefined);
  if (metricWord) parts.push(metricWord);

  if (plan.status) parts.push(plan.status);

  if (plan.period?.label) {
    const skipDefault =
      plan.period.source === "default" &&
      (plan.period.grain === "open" || plan.period.grain === "latest");
    if (!skipDefault) parts.push(plan.period.label);
  }

  const built = parts.join(" ").replace(/\s+/g, " ").trim();
  return (built || plan.query).slice(0, 1000);
}

/**
 * Follow-up merge: update slots on the previous plan (entity swap, period swap)
 * instead of appending prose / ₹ history into the LLM.
 */
export function mergeNovaPlanSlots(
  previous: NovaPlan,
  patch: Partial<
    Pick<
      NovaPlan,
      | "module"
      | "metric"
      | "period"
      | "entity"
      | "entityId"
      | "entityType"
      | "entityCode"
      | "person"
      | "status"
      | "tools"
      | "clarifyReason"
      | "interpretedAs"
      | "confidence"
    >
  >
): NovaPlan {
  let merged: NovaPlan = {
    ...previous,
    ...patch,
    tools: patch.tools ?? previous.tools,
    confidence: patch.confidence ?? previous.confidence,
    source: "merged",
    clarifyReason: patch.clarifyReason,
  };

  // Clearing clarify when tools become ready
  if (novaPlanHasReadyTools(merged)) {
    merged.clarifyReason = undefined;
  }

  if (patch.period) {
    merged.period = { ...patch.period, source: patch.period.source ?? "follow_up" };
    merged.periodDefaultApplied = undefined;
  } else if (!merged.period) {
    merged = applyNovaPlanPeriodDefault(merged);
  }

  merged = { ...merged, query: novaPlanToRoutingQuery(merged) };
  return merged;
}

/** Slot patch from a short follow-up utterance (entity / period / status only). */
export function novaPlanFollowUpPatch(followUp: NovaPlan): Partial<NovaPlan> {
  const patch: Partial<NovaPlan> = {};
  if (followUp.entity) patch.entity = followUp.entity;
  if (followUp.person) patch.person = followUp.person;
  if (followUp.period) patch.period = { ...followUp.period, source: "follow_up" };
  if (followUp.status) patch.status = followUp.status;
  if (followUp.module) patch.module = followUp.module;
  if (followUp.metric) patch.metric = followUp.metric;
  if (followUp.tools.length) patch.tools = followUp.tools;
  if (followUp.interpretedAs) patch.interpretedAs = followUp.interpretedAs;
  return patch;
}

/**
 * Enrich a prior turn into a follow-up base plan (lexicon tools; money narrative → sales).
 * Does not read assistant ₹ amounts into the query — only uses narrative as a domain signal.
 */
export function priorNovaPlanForFollowUp(
  recentUser: string,
  recentAsst = "",
  opts?: {
    selectTools?: (q: string) => string[];
    bareEntity?: (q: string) => string | null;
  }
): NovaPlan {
  let plan = buildNovaPlan(recentUser);
  const selectTools = opts?.selectTools;
  if (selectTools && !novaPlanHasReadyTools(plan)) {
    const tools = selectTools(recentUser).filter((t) => t !== "search_entities");
    if (tools.length) plan = withNovaPlanTools(plan, tools);
  }

  const moneyNarrative =
    /₹|rs\.?\s*\d|sales\s+invoice|tax invoice|total collected|grand total|receipts?\b/i.test(
      recentAsst
    );
  // Bare party may resolve via search_entities — still prefer money tools when
  // the prior assistant turn was clearly a money answer about that party.
  const onlyIdentitySearch =
    plan.tools.length > 0 && plan.tools.every((t) => t === "search_entities");
  if ((!novaPlanHasReadyTools(plan) || onlyIdentitySearch) && moneyNarrative) {
    const bare = opts?.bareEntity?.(recentUser);
    plan = {
      ...plan,
      entity: bare ?? plan.entity,
      module: "sales_invoices",
      metric: plan.metric ?? "sales",
      tools: ["sales_summary"],
      confidence: "high",
      clarifyReason: undefined,
      period:
        plan.period ??
        ({ grain: "month", label: "this month", source: "default" } as NovaPlanPeriod),
      source: "follow_up",
    };
  }

  return plan;
}

/** Debug / eval: compact one-line summary. */
export function summarizeNovaPlan(plan: NovaPlan): string {
  const parts = [
    plan.module && `module=${plan.module}`,
    plan.metric && `metric=${plan.metric}`,
    plan.period && `period=${plan.period.label}(${plan.period.source})`,
    plan.entity && `entity=${plan.entity}`,
    plan.person && `person=${plan.person}`,
    plan.status && `status=${plan.status}`,
    `tools=[${plan.tools.join(",")}]`,
    `conf=${plan.confidence}`,
    plan.clarifyReason && "clarify",
  ].filter(Boolean);
  return parts.join(" ");
}
