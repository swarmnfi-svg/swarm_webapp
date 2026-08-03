/**
 * Multi-turn follow-up resolution for NOVA (read-only).
 * Phase C: entity / period / status follow-ups merge NovaPlan slots
 * (`mergeNovaPlanSlots`) instead of feeding prior assistant ₹ prose into routing.
 */

import { selectNovaTools } from "@/lib/ai/nova-tools";
import { normalizeNovaQuery } from "@/lib/ai/nova-normalize";
import { parseIndianFyToken, parseNovaDateRange } from "@/lib/ai/nova-dates";
import {
  extractNovaBareEntityCandidate,
  extractNovaPersonHint,
  stripNovaEntityFromMetricQuery,
} from "@/lib/ai/nova-lexicon";
import {
  buildNovaPlan,
  mergeNovaPlanSlots,
  novaPlanHasReadyTools,
  novaPlanToRoutingQuery,
  priorNovaPlanForFollowUp,
  type NovaPlan,
  type NovaPlanPeriod,
} from "@/lib/ai/nova-plan";
import {
  looksLikeNovaClarifyReply,
  matchNovaClarifySelection,
  parseNovaClarifyOptionsFromAssistant,
} from "@/lib/ai/nova-clarify";
import {
  canNovaInheritConversationSlots,
  detectNovaSlotFamily,
  isNovaBindableEntityType,
  matchNovaClarifyTypeDeixis,
  resolveNovaClarifyReply,
  shouldKeepNovaBoundEntityOnTopicSwitch,
  stickyModuleFollowUpClarifyReason,
  utteranceReferencesBoundEntity,
  type NovaClarifyAct,
  type NovaDialogBound,
  type NovaDialogState,
  type NovaSlotFamily,
  NOVA_CONVERSATION_SLOT_MAX_TURNS,
} from "@/lib/nova/dialog-state";
import { isNovaModuleOnlyFollowUp, isNovaTemporalOrModuleEntityNoise } from "@/lib/nova/query-structure";

export type NovaChatTurn = { role: "user" | "assistant"; content: string };

export type NovaBoundEntity = {
  id: string;
  type: "customer" | "vendor" | "project";
  code?: string | null;
  label?: string;
};

export type ResolvedNovaQuery = {
  /** Effective query used for tools + LLM */
  query: string;
  /** Optional forced tool list (skips heuristic when set) */
  forcedTools?: string[];
  /** True when we treated this as a follow-up */
  isFollowUp: boolean;
  /** Phase C: merged plan when follow-up updated slots */
  plan?: NovaPlan;
  /** Bound from ClarifyAct — tools must skip fuzzy entity resolve */
  boundEntity?: NovaBoundEntity;
  /** Soft re-ask when pending clarify reply missed */
  clarifyReask?: string;
  /** Pending clarify was cancelled (topic switch) */
  cancelledPendingClarify?: boolean;
};

const METRIC_WORD =
  /\b(sales|revenue|receipts?|collections?|invoices?|billing|turnover|projects?|late|attendance|stock|vendors?|tasks?|kpi|approvals?|payables?|receivables?|activity|overview|summary|summaris[ee]|summarize|dashboard|order\s*book|bank|salary|payroll|leave|advances?|incentives?|grn|profitability|fund\s+position)\b/i;

function lastUserText(history: NovaChatTurn[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") return history[i].content;
  }
  return "";
}

/** Most recent prior user ask that already named a metric (not just a period). */
function lastMetricUserText(history: NovaChatTurn[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== "user") continue;
    const c = history[i].content;
    if (METRIC_WORD.test(c)) return c;
  }
  return lastUserText(history);
}

const MONEY_METRIC_RE =
  /\b(sales|revenue|receipts?|collections?|invoices?|billing|turnover|outstanding|receivables?|payables?)\b/i;

/**
 * Prior money ask only when still in the same conversational window —
 * stops at topic-switch or after MAX_TURNS user messages (history fallback
 * when DialogState slots are absent/expired).
 */
export function lastFreshMoneyUserText(
  history: NovaChatTurn[],
  opts?: { maxTurns?: number; targetFamily?: NovaSlotFamily }
): string {
  const maxTurns = opts?.maxTurns ?? NOVA_CONVERSATION_SLOT_MAX_TURNS;
  const want = opts?.targetFamily ?? "money";
  let userTurns = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== "user") continue;
    userTurns += 1;
    if (userTurns > maxTurns) return "";
    const c = history[i].content;
    const fam = detectNovaSlotFamily(c);
    if (fam && fam !== want) return ""; // topic already switched
    if (want === "money" && MONEY_METRIC_RE.test(c)) return c;
    if (fam === want && METRIC_WORD.test(c)) return c;
  }
  return "";
}

function lastAssistantText(history: NovaChatTurn[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "assistant") return history[i].content;
  }
  return "";
}

function dialogBoundToNovaBoundEntity(
  bound: NovaDialogBound | null | undefined
): NovaBoundEntity | undefined {
  if (!bound?.entityType || !isNovaBindableEntityType(bound.entityType)) return undefined;
  const id = bound.entityId?.trim();
  if (!id) return undefined;
  return {
    id,
    type: bound.entityType,
    code: bound.entityCode,
    label: bound.entityLabel,
  };
}

/**
 * Most recent user turn that is safe to recheck — never leap past a topic-switch
 * (or non-ERP turn) back to an older metric ask.
 */
function lastRecheckableUserText(history: NovaChatTurn[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== "user") continue;
    const c = history[i].content.trim();
    if (!c) continue;
    // Skip clarify digits / bare follow-up noise
    if (/^(?:#?\d{1,2}|option\s+\d{1,2})$/i.test(c)) continue;
    if (isFollowUpPhrase(c)) continue;
    const tools = selectNovaTools(c).filter((t) => t !== "search_entities");
    if (METRIC_WORD.test(c) || tools.length > 0) return c;
    // Non-ERP recent turn — stop (do not leap to older sales/receipts after topic left).
    return "";
  }
  return "";
}

function isFollowUpPhrase(q: string): boolean {
  const t = q.trim();
  // Bare pronouns alone are not follow-ups (false positives merged wrong tools)
  if (/^(it|that|those|them|this)$/i.test(t)) return false;

  return (
    /\b(recheck|check\s+again|again|confirm|verify|double[- ]?check)\b/i.test(q) ||
    /\b(i mean|no i meant|actually|rather|instead)\b/i.test(q) ||
    /\b(the same|same thing|same as before)\b/i.test(q) ||
    /\b(what about|how about)\b/i.test(q) ||
    /\b(about|for|on)\s+(that|it|those|them)\b/i.test(q) ||
    /\b(that|it|those)\s+(again|please|too)\b/i.test(q)
  );
}

/**
 * “Who are they / list them / names / details” — only meaningful with prior domain context.
 * Bare “it/that” stay excluded (see isFollowUpPhrase).
 * Also: “can u list”, “can you list”, bare “list” / “list please”.
 */
export function isPronounOrListFollowUp(q: string): boolean {
  const t = q.trim();
  if (!t) return false;
  if (/^(it|that|those|them|this)$/i.test(t)) return false;

  return (
    /^(who|who\??)$/i.test(t) ||
    /\bwho\s+are\s+(they|those|them)\b/i.test(t) ||
    /\bwhich\s+(customers?|clients?|vendors?|suppliers?|ones?|parties|invoices?|people)\b/i.test(t) ||
    /\b(list|show|name)\s+(them|those|these|the\s+(customers?|clients?|vendors?|invoices?|ones?|parties))\b/i.test(
      t
    ) ||
    /^(list|show)\s+them\b/i.test(t) ||
    /^(names?|details?|show\s+them|list\s+them)\b/i.test(t) ||
    /\b(their\s+names?|the\s+names?|give\s+(me\s+)?(the\s+)?names?)\b/i.test(t) ||
    /^(?:can\s+(?:u|you)\s+)?(?:please\s+)?list(?:\s+them)?(?:\s+please)?\s*[.?!]?\s*$/i.test(t) ||
    /^(?:please\s+)?(?:show|list)(?:\s+please)?\s*[.?!]?\s*$/i.test(t)
  );
}

/** Infer domain tools from recent user/assistant turns for pronoun/list follow-ups. */
export function toolsFromRecentNovaContext(
  recentUser: string,
  recentAsst: string
): string[] | null {
  const blob = `${recentUser} ${recentAsst}`.toLowerCase();
  if (
    /\b(receivable|debtor|aging|ar\b|outstanding)\b/.test(blob) ||
    (/\boverdue\b/.test(blob) && /\b(invoice|bill|receivable)/.test(blob)) ||
    /\bunpaid\s+invoices?\b/.test(blob)
  ) {
    return ["receivables_summary", "overdue_invoices"];
  }
  if (
    /\b(late\s*comers?|attendance|late\s+minutes|who\s+(is|was|were)\s+late|came\s+late)\b/.test(blob) ||
    (/\blate\b/.test(blob) && !/\b(late\s+payment|late\s+fee|payment\s+late)\b/.test(blob))
  ) {
    return ["attendance_late_summary"];
  }
  if (/\b(task|tasks|assignee|assignees)\b/.test(blob)) {
    return ["tasks_summary"];
  }
  if (
    /\bpayment\s+requests?\b/.test(blob) ||
    (/\b(awaiting|pending)\b/.test(blob) && /\bpayments?\b/.test(blob) && !/\bstaff\s+advance/.test(blob))
  ) {
    return ["payment_requests_summary"];
  }
  if (/\b(payable|purchase\s+bills?|creditor)\b/.test(blob)) {
    return ["purchase_bills_summary"];
  }
  if (/\b(vendor|supplier)s?\b/.test(blob)) {
    return ["vendors_summary"];
  }
  if (/\b(customer|client)s?\b/.test(blob)) {
    return ["customers_summary"];
  }
  if (/\b(project|projects)\b/.test(blob)) {
    return ["projects_summary"];
  }
  const fromPrior = selectNovaTools(recentUser || recentAsst).filter((t) => t !== "search_entities");
  return fromPrior.length ? fromPrior : null;
}

/**
 * Full asks like “yesterday receipts” / “FY sales” are new questions —
 * never merge them into prior turns (that caused tasks+sales bleed).
 */
export function isStandaloneNovaQuery(q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return false;
  // Day/period activity / summary asks are always new questions
  if (
    /\b(activity|overview|dashboard)\b/.test(t) &&
    (parseNovaDateRange(t) || /\b(today|yesterday|this\s+week|last\s+week|this\s+month)\b/.test(t))
  ) {
    return true;
  }
  if (/\b(summaris[ee]|summarize)\b/.test(t) && parseNovaDateRange(t)) {
    return true;
  }
  if (!METRIC_WORD.test(t)) return false;
  // Has its own period or is an explicit workflow ask
  if (
    parseNovaDateRange(t) ||
    /\b(pending|overdue|open|my work|biggest|largest|who|how many)\b/.test(t)
  ) {
    return true;
  }
  // Metric + enough context without needing history
  return t.split(/\s+/).length >= 2;
}

/** Short period-only replies like “26-27” or “this month” after a metric question. */
function isPeriodOnlyFollowUp(q: string): boolean {
  const t = q.trim().toLowerCase();
  // Any verb / ask word means a new question, not a bare period clarification
  if (
    /\b(summaris[ee]|summarize|list|show|give|tell|what|how|who|find|get|check|activity|overview|dashboard|report)\b/i.test(
      t
    )
  ) {
    return false;
  }
  if (METRIC_WORD.test(t)) return false; // has a metric → not period-only
  if (parseIndianFyToken(t) && t.split(/\s+/).length <= 3) return true;
  if (/^(this|last)\s+(month|week|year|fy)$/i.test(t)) return true;
  if (/^(today|yesterday)$/i.test(t)) return true;
  // Bare period phrases only (e.g. "this week", "july", "26-27") — not full sentences
  if (parseNovaDateRange(t) && t.split(/\s+/).length <= 3 && !/\b(for|of|about|from)\b/.test(t)) {
    return true;
  }
  return false;
}

function basePriorPlan(recentUser: string, recentAsst: string): NovaPlan {
  return priorNovaPlanForFollowUp(recentUser, recentAsst, {
    selectTools: selectNovaTools,
    bareEntity: extractNovaBareEntityCandidate,
  });
}

function resolvedFromMergedPlan(
  merged: NovaPlan,
  extra?: Partial<ResolvedNovaQuery>
): ResolvedNovaQuery {
  const query = novaPlanToRoutingQuery(merged);
  const tools = merged.tools.filter((t) => t !== "search_entities");
  return {
    query,
    forcedTools: tools.length ? tools : undefined,
    isFollowUp: true,
    plan: { ...merged, query, source: "merged" },
    ...extra,
  };
}

function boundEntityFromClarifyOption(picked: {
  id: string;
  type: string;
  label: string;
  code?: string | null;
  reply?: string;
}): NovaBoundEntity | undefined {
  if (!isNovaBindableEntityType(picked.type as "customer" | "vendor" | "project")) {
    return undefined;
  }
  return {
    id: picked.id,
    type: picked.type as "customer" | "vendor" | "project",
    code: picked.code,
    label: picked.label,
  };
}

function mergeEntityClarifyPick(
  priorPlan: NovaPlan,
  recentUser: string,
  picked: {
    id: string;
    type: string;
    label: string;
    code?: string | null;
    reply: string;
  }
): ResolvedNovaQuery {
  const bound = boundEntityFromClarifyOption(picked);
  // Prefer display label for routing text; bind id/code separately for tools.
  const entityName = picked.label || picked.code?.trim() || picked.reply;
  let merged = mergeNovaPlanSlots(priorPlan, {
    entity: entityName,
    ...(bound
      ? {
          entityId: bound.id,
          entityType: bound.type,
          entityCode: bound.code ?? undefined,
        }
      : {}),
    confidence: "high",
    clarifyReason: undefined,
  });

  // Resume stated intent (e.g. “… projects”) before inventing silent month sales.
  if (!novaPlanHasReadyTools(merged) && /\bprojects?\b/i.test(recentUser)) {
    const tools = selectNovaTools(
      bound?.type === "customer"
        ? `${entityName} projects`
        : bound?.type === "project"
          ? `${entityName} project`
          : `${recentUser}`
    ).filter((t) => t !== "search_entities");
    const projectTools = tools.length ? tools : ["projects_summary"];
    merged = mergeNovaPlanSlots(merged, {
      module: "projects",
      metric: "projects",
      tools: projectTools,
      confidence: "high",
    });
    return resolvedFromMergedPlan(merged, { boundEntity: bound });
  }

  if (!novaPlanHasReadyTools(merged) && METRIC_WORD.test(recentUser)) {
    const metricOnly = stripNovaEntityFromMetricQuery(recentUser) || "sales";
    const tools = selectNovaTools(`${entityName} ${metricOnly}`).filter(
      (t) => t !== "search_entities"
    );
    if (tools.length) {
      merged = mergeNovaPlanSlots(merged, { tools, confidence: "high" });
    }
  }
  if (!novaPlanHasReadyTools(merged)) {
    // Prefer metric clarify over silent sales when original ask was bare party.
    const bareParty =
      !METRIC_WORD.test(recentUser) ||
      (/^\s*[\w&.\-\s]{2,60}\s*$/i.test(recentUser) &&
        !/\b(sales|receipts|outstanding|invoices?|tasks?)\b/i.test(recentUser));
    if (bareParty && !/\b(sales|receipts|outstanding|invoices?|tasks?)\b/i.test(recentUser)) {
      // Sticky bind only — caller confirms selection via entity-metric clarify (never search dump).
      return resolvedFromMergedPlan(
        mergeNovaPlanSlots(merged, { tools: [], confidence: "high" }),
        { boundEntity: bound }
      );
    }
    // Never widen an explicit/follow-up period (e.g. today) to "this month".
    const period =
      merged.period && merged.period.source !== "default"
        ? merged.period
        : merged.period ??
          ({ grain: "month", label: "this month", source: "default" } satisfies NovaPlanPeriod);
    const withSales = mergeNovaPlanSlots(merged, {
      module: "sales_invoices",
      metric: "sales",
      tools: ["sales_summary"],
      confidence: "high",
      period,
    });
    return resolvedFromMergedPlan(withSales, { boundEntity: bound });
  }
  return resolvedFromMergedPlan(merged, { boundEntity: bound });
}

/**
 * Resolve against a structured pending ClarifyAct (preferred over prose history).
 */
export function resolveNovaPendingClarify(
  rawQuery: string,
  dialogState: NovaDialogState | null | undefined
): ResolvedNovaQuery | null {
  const pending = dialogState?.pendingClarify ?? null;
  if (!pending) return null;
  const result = resolveNovaClarifyReply(rawQuery, pending);
  if (result.kind === "matched") {
    // Prefer full routing query + resume slots so period/metric survive the pick.
    const resumeBase =
      pending.resume?.routingQuery?.trim() || pending.originalQuery;
    const priorPlan = basePriorPlan(resumeBase, "");
    if (pending.resume?.tools?.length) {
      priorPlan.tools = [...pending.resume.tools];
    }
    if (pending.resume?.metric) priorPlan.metric = pending.resume.metric;
    if (pending.resume?.module) priorPlan.module = pending.resume.module as NovaPlan["module"];
    if (pending.resume?.periodLabel) {
      priorPlan.period = {
        label: pending.resume.periodLabel,
        grain: pending.resume.periodGrain ?? priorPlan.period?.grain ?? "day",
        source: pending.resume.periodSource ?? "follow_up",
      };
      priorPlan.periodDefaultApplied = undefined;
    }
    if (result.option.type === "staff") {
      const merged = mergeNovaPlanSlots(priorPlan, {
        person: result.option.code || result.option.label,
        tools: priorPlan.tools.length ? priorPlan.tools : ["attendance_late_summary"],
        confidence: "high",
        clarifyReason: undefined,
      });
      return resolvedFromMergedPlan(merged);
    }
    if (result.option.type === "metric" || result.option.type === "period") {
      // Metric/period picks do not carry entity options — reattach sticky DialogState bind.
      const stickyBound = dialogBoundToNovaBoundEntity(dialogState?.bound);
      const reply = result.option.code || result.option.label;
      const followPlan = buildNovaPlan(reply);
      let merged = mergeNovaPlanSlots(priorPlan, {
        ...(stickyBound
          ? {
              entity: stickyBound.label || stickyBound.code || stickyBound.id,
              entityId: stickyBound.id,
              entityType: stickyBound.type,
              entityCode: stickyBound.code ?? undefined,
            }
          : {}),
        ...(result.option.type === "metric"
          ? {
              metric: reply,
              ...(followPlan.module ? { module: followPlan.module } : {}),
              ...(followPlan.tools.length ? { tools: followPlan.tools } : {}),
            }
          : {
              period: followPlan.period ?? {
                grain: "day" as const,
                label: reply,
                source: "follow_up" as const,
              },
            }),
        confidence: "high",
        clarifyReason: undefined,
      });
      // Keep pre-clarify period when picking a metric (never widen to month).
      if (
        result.option.type === "metric" &&
        pending.resume?.periodLabel &&
        (!merged.period || merged.period.source === "default")
      ) {
        merged = mergeNovaPlanSlots(merged, {
          period: {
            label: pending.resume.periodLabel,
            grain: pending.resume.periodGrain ?? "day",
            source: pending.resume.periodSource ?? "follow_up",
          },
        });
      }
      if (!novaPlanHasReadyTools(merged)) {
        const tools = selectNovaTools(novaPlanToRoutingQuery(merged)).filter(
          (t) => t !== "search_entities"
        );
        if (tools.length) merged = mergeNovaPlanSlots(merged, { tools, confidence: "high" });
      }
      if (result.option.type === "period" && pending.originalQuery) {
        const mergedQ = normalizeNovaQuery(`${pending.originalQuery} ${reply}`).slice(0, 1000);
        const tools = selectNovaTools(mergedQ).filter((t) => t !== "search_entities");
        return {
          query: mergedQ,
          forcedTools: tools.length ? tools : undefined,
          isFollowUp: true,
          plan: { ...merged, query: mergedQ, source: "merged" },
          boundEntity: stickyBound,
        };
      }
      if (result.option.type === "metric" && pending.originalQuery) {
        const bareEntity = extractNovaBareEntityCandidate(pending.originalQuery);
        const entityLabel =
          stickyBound?.label || stickyBound?.code || bareEntity || undefined;
        // Catalog near-miss (generic Did-you-mean): run the phrase alone — don't prepend the typo.
        const catalogNearMiss =
          pending.kind === "generic" && !entityLabel && !stickyBound;
        const mergedQ = normalizeNovaQuery(
          catalogNearMiss
            ? reply
            : entityLabel
              ? `${entityLabel} ${reply}`
              : `${pending.originalQuery} ${reply}`
        ).slice(0, 1000);
        // Prefer plan routing (keeps period) over string merge that drops "today".
        const routed = novaPlanToRoutingQuery(merged);
        const q =
          catalogNearMiss || routed.includes(reply) ? (catalogNearMiss ? mergedQ : routed) : mergedQ;
        const tools = selectNovaTools(q).filter((t) => t !== "search_entities");
        return {
          query: q,
          forcedTools: tools.length ? tools : undefined,
          isFollowUp: true,
          plan: { ...merged, query: q, source: "merged" },
          boundEntity: stickyBound,
        };
      }
      return resolvedFromMergedPlan(merged, stickyBound ? { boundEntity: stickyBound } : undefined);
    }
    return mergeEntityClarifyPick(priorPlan, resumeBase, {
      id: result.option.id,
      type: result.option.type,
      label: result.option.label,
      code: result.option.code,
      reply: result.option.code || result.option.label,
    });
  }
  if (result.kind === "reask") {
    return {
      query: rawQuery.trim(),
      isFollowUp: true,
      clarifyReask:
        "Please reply with the **number** of the option you meant (e.g. **1**), or the full name/code.",
    };
  }
  if (result.kind === "cancel") {
    return {
      query: rawQuery.trim(),
      isFollowUp: false,
      cancelledPendingClarify: true,
    };
  }
  return null;
}

/**
 * Build a pending ClarifyAct from history markdown (fallback when dialogState empty).
 */
export function clarifyActFromHistory(
  history: NovaChatTurn[],
  originalQueryFallback?: string
): NovaClarifyAct | null {
  const recentAsst = lastAssistantText(history);
  if (!recentAsst) return null;
  const opts = parseNovaClarifyOptionsFromAssistant(recentAsst);
  if (opts.length < 1) return null;
  if (
    !/\bDid you mean\b|\bwhich (metric|period)\b|\bwhat should I look up\b|\bPending what\b|\bReply with the number\b/i.test(
      recentAsst
    ) &&
    !/^\s*\d+\.\s+\*\*/m.test(recentAsst)
  ) {
    return null;
  }
  const kind: NovaClarifyAct["kind"] = opts.some(
    (o) => o.type === "customer" || o.type === "vendor" || o.type === "project"
  )
    ? "entity"
    : opts.some((o) => o.type === "staff")
      ? "person"
      : opts.every((o) => o.type === "period")
        ? "period"
        : opts.every((o) => o.type === "metric")
          ? "metric"
          : "generic";
  const recentUser = lastMetricUserText(history) || originalQueryFallback || "";
  return {
    id: "history_fallback",
    kind,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    originalQuery: recentUser,
    options: opts.map((o) => ({
      n: o.n,
      id: o.id,
      type: o.type,
      label: o.label,
      code: o.code,
    })),
  };
}

/**
 * Resolve the current user message against recent turns.
 * History should be prior turns only (not including the current message).
 *
 * @param dialogState optional structured pending ClarifyAct (wins over prose parse)
 */
export function resolveNovaFollowUp(
  rawQuery: string,
  history: NovaChatTurn[] = [],
  dialogState?: NovaDialogState | null
): ResolvedNovaQuery {
  const query = normalizeNovaQuery(rawQuery).slice(0, 1000);
  if (!query) return { query: "", isFollowUp: false };

  // Structured pending act wins; else synthesize from prior clarify markdown.
  // When sticky bind is already set, do NOT re-open a stale prose ClarifyAct from history
  // (that cancels module follow-ups like “pending tasks” / “invoices”).
  const pending =
    dialogState?.pendingClarify ??
    (dialogState?.bound?.entityId ? null : clarifyActFromHistory(history));
  if (pending) {
    const fromAct = resolveNovaPendingClarify(rawQuery, {
      pendingClarify: pending,
      updatedAt: new Date().toISOString(),
    });
    if (fromAct?.clarifyReask) return fromAct;
    if (fromAct?.boundEntity || (fromAct?.isFollowUp && fromAct.plan)) return fromAct;
    if (fromAct?.forcedTools?.length && fromAct.isFollowUp) return fromAct;
    if (fromAct?.cancelledPendingClarify) {
      return { query, isFollowUp: false, cancelledPendingClarify: true };
    }
  }

  const prior = history
    .slice(-8)
    .map((h) => ({
      role: h.role,
      content: normalizeNovaQuery(h.content).slice(0, 800),
    }))
    .filter((h) => h.content.length > 0);

  // Sticky person + module-only *task* follow-up — DialogState alone is enough (no chat history).
  // Do not steal finance/approvals module-only asks (“pending invoices”) into tasks_summary.
  {
    const personSticky = dialogState?.slots?.personHint?.trim();
    const taskModuleOnly =
      isNovaModuleOnlyFollowUp(query) &&
      /\b(tasks?|todos?)\b/i.test(query) &&
      !/\b(invoices?|receipts?|approvals?|collections?|receivables?|outstanding|bills?)\b/i.test(
        query
      );
    if (personSticky && taskModuleOnly) {
      const followPlan = buildNovaPlan(`${personSticky} ${query}`.slice(0, 200));
      let merged = mergeNovaPlanSlots(followPlan, {
        tools: ["tasks_summary"],
        module: "tasks",
        metric: followPlan.metric ?? "tasks",
        person: personSticky,
        confidence: "high",
        clarifyReason: undefined,
      });
      if (!novaPlanHasReadyTools(merged)) {
        merged = mergeNovaPlanSlots(merged, { tools: ["tasks_summary"], confidence: "high" });
      }
      return {
        ...resolvedFromMergedPlan(merged),
        query: `${personSticky} ${query}`.slice(0, 200),
      };
    }
  }

  if (prior.length === 0 && !dialogState?.bound) {
    return { query, isFollowUp: false };
  }

  const recentUser = lastMetricUserText(prior);
  const recentAsst = lastAssistantText(prior);
  const blob = `${recentUser} ${recentAsst} ${query}`.toLowerCase();

  // P1: module-only follow-up + prior entity hint but no bind → clarify (never org-wide).
  // Sticky person slot skips party clarify (personal-task follow-ups).
  {
    const stickyClarify = stickyModuleFollowUpClarifyReason(query, dialogState);
    if (stickyClarify) {
      return {
        query,
        isFollowUp: true,
        clarifyReask: stickyClarify,
        plan: {
          ...buildNovaPlan(query),
          tools: [],
          clarifyReason: stickyClarify,
          confidence: "high",
        },
      };
    }
  }

  // Sticky DialogState bind + {module} / “this project” — never re-run bare entity search.
  {
    const bound = dialogState?.bound;
    const boundEntity = dialogBoundToNovaBoundEntity(bound);
    const family = detectNovaSlotFamily(query);
    const slotsFresh =
      canNovaInheritConversationSlots(dialogState) ||
      Boolean(boundEntity && shouldKeepNovaBoundEntityOnTopicSwitch(query, family, bound));
    if (
      boundEntity &&
      slotsFresh &&
      (utteranceReferencesBoundEntity(query, bound) ||
        (METRIC_WORD.test(query) && shouldKeepNovaBoundEntityOnTopicSwitch(query, family, bound)))
    ) {
      const entityLabel =
        bound?.entityLabel || bound?.entityCode || boundEntity.label;
      const followPlan = buildNovaPlan(query);
      const priorPlan = basePriorPlan(
        `${entityLabel} ${query}`.slice(0, 200),
        recentAsst
      );
      let merged = mergeNovaPlanSlots(priorPlan, {
        entity: entityLabel,
        entityId: boundEntity.id,
        entityType: boundEntity.type,
        entityCode: boundEntity.code ?? undefined,
        ...(followPlan.module ? { module: followPlan.module } : {}),
        ...(followPlan.metric ? { metric: followPlan.metric } : {}),
        ...(followPlan.tools.length ? { tools: followPlan.tools } : {}),
        ...(followPlan.period ? { period: followPlan.period } : {}),
        confidence: "high",
        clarifyReason: undefined,
      });
      if (!novaPlanHasReadyTools(merged)) {
        const tools = selectNovaTools(
          normalizeNovaQuery(`${entityLabel} ${query}`).slice(0, 1000)
        ).filter((t) => t !== "search_entities");
        if (tools.length) {
          merged = mergeNovaPlanSlots(merged, { tools, confidence: "high" });
        } else {
          const moduleTools = selectNovaTools(query).filter((t) => t !== "search_entities");
          if (moduleTools.length) {
            merged = mergeNovaPlanSlots(merged, { tools: moduleTools, confidence: "high" });
          }
        }
      }
      // Never treat search_entities-only as sticky success (reopens search dump / chip loop).
      const stickyTools = merged.tools.filter((t) => t !== "search_entities");
      if (stickyTools.length > 0 && novaPlanHasReadyTools({ ...merged, tools: stickyTools })) {
        return resolvedFromMergedPlan(
          stickyTools.length === merged.tools.length
            ? merged
            : mergeNovaPlanSlots(merged, { tools: stickyTools, confidence: "high" }),
          { boundEntity }
        );
      }
    }
  }

  if (prior.length === 0) {
    return { query, isFollowUp: false };
  }

  // “Why Tata?” / “Why is Tata in attention?” — bind-by-id from DialogState; never re-fuzzy.
  {
    const bound = dialogState?.bound;
    const slotsFresh = canNovaInheritConversationSlots(dialogState);
    const whyCue = /\bwhy\b/i.test(query);
    const attentionCue = /\b(attention|overdue|outstanding|finding)\b/i.test(query);
    if (
      bound &&
      slotsFresh &&
      (whyCue || attentionCue) &&
      utteranceReferencesBoundEntity(query, bound)
    ) {
      const boundEntity = dialogBoundToNovaBoundEntity(bound);
      if (boundEntity) {
        const topic =
          lastFreshMoneyUserText(prior) ||
          recentUser ||
          "customer outstanding overdue";
        const priorPlan = basePriorPlan(topic, recentAsst);
        let merged = mergeNovaPlanSlots(priorPlan, {
          entity: bound.entityLabel || bound.entityCode || boundEntity.label,
          confidence: "high",
          clarifyReason: undefined,
        });
        if (dialogState?.slots?.tools?.length && !merged.tools.length) {
          merged = mergeNovaPlanSlots(merged, { tools: [...dialogState.slots.tools] });
        }
        if (!novaPlanHasReadyTools(merged)) {
          merged = mergeNovaPlanSlots(merged, {
            tools: ["customer_outstanding", "overdue_invoices"],
            metric: merged.metric ?? "outstanding",
            module: merged.module ?? "receivables",
            confidence: "high",
          });
        }
        if (
          dialogState?.slots?.periodLabel &&
          (!merged.period || merged.period.source === "default")
        ) {
          merged = mergeNovaPlanSlots(merged, {
            period: {
              grain: dialogState.slots.periodGrain ?? "month",
              label: dialogState.slots.periodLabel,
              source:
                (dialogState.slots.periodSource as NovaPlanPeriod["source"]) ?? "follow_up",
            },
          });
        }
        return resolvedFromMergedPlan(merged, { boundEntity });
      }
    }
  }

  // Legacy prose path kept for non-act cases; entity picks normally handled above.
  if (looksLikeNovaClarifyReply(query, recentAsst) && !pending) {
    const opts = parseNovaClarifyOptionsFromAssistant(recentAsst);
    const pickedRaw =
      matchNovaClarifySelection(query, opts) ??
      matchNovaClarifyTypeDeixis(
        query,
        opts.map((o) => ({
          n: o.n,
          id: o.id,
          type: o.type,
          label: o.label,
          code: o.code,
        }))
      );
    const picked = pickedRaw
      ? {
          ...pickedRaw,
          reply:
            "reply" in pickedRaw && typeof pickedRaw.reply === "string" && pickedRaw.reply
              ? pickedRaw.reply
              : pickedRaw.code?.trim() || pickedRaw.label,
        }
      : null;
    if (picked) {
      const priorPlan = basePriorPlan(recentUser, recentAsst);
      if (picked.type === "staff") {
        const merged = mergeNovaPlanSlots(priorPlan, {
          person: picked.reply,
          tools: priorPlan.tools.length ? priorPlan.tools : ["attendance_late_summary"],
          confidence: "high",
          clarifyReason: undefined,
        });
        return resolvedFromMergedPlan(merged);
      }
      if (picked.type === "metric" || picked.type === "period") {
        const followPlan = buildNovaPlan(picked.reply);
        let merged = mergeNovaPlanSlots(priorPlan, {
          ...(picked.type === "metric"
            ? {
                metric: picked.reply,
                ...(followPlan.module ? { module: followPlan.module } : {}),
                ...(followPlan.tools.length ? { tools: followPlan.tools } : {}),
              }
            : {
                period: followPlan.period ?? {
                  grain: "day" as const,
                  label: picked.reply,
                  source: "follow_up" as const,
                },
              }),
          confidence: "high",
          clarifyReason: undefined,
        });
        if (!novaPlanHasReadyTools(merged)) {
          const tools = selectNovaTools(novaPlanToRoutingQuery(merged)).filter(
            (t) => t !== "search_entities"
          );
          if (tools.length) merged = mergeNovaPlanSlots(merged, { tools, confidence: "high" });
        }
        if (picked.type === "period" && recentUser) {
          const mergedQ = normalizeNovaQuery(`${recentUser} ${picked.reply}`).slice(0, 1000);
          const tools = selectNovaTools(mergedQ).filter((t) => t !== "search_entities");
          return {
            query: mergedQ,
            forcedTools: tools.length ? tools : undefined,
            isFollowUp: true,
            plan: { ...merged, query: mergedQ, source: "merged" },
          };
        }
        if (picked.type === "metric" && recentUser) {
          const bareEntity = extractNovaBareEntityCandidate(recentUser);
          const mergedQ = normalizeNovaQuery(
            bareEntity ? `${bareEntity} ${picked.reply}` : `${recentUser} ${picked.reply}`
          ).slice(0, 1000);
          const tools = selectNovaTools(mergedQ).filter((t) => t !== "search_entities");
          return {
            query: mergedQ,
            forcedTools: tools.length ? tools : undefined,
            isFollowUp: true,
            plan: { ...merged, query: mergedQ, source: "merged" },
          };
        }
        return resolvedFromMergedPlan(merged);
      }
      return mergeEntityClarifyPick(priorPlan, recentUser, picked);
    }
    if (/^(?:#\s*)?\d{1,2}$/.test(query) || /^option\s+\d{1,2}$/i.test(query)) {
      return {
        query,
        isFollowUp: true,
        clarifyReask:
          "Please reply with the **number** of the option you meant (e.g. **1**), or the full name/code.",
      };
    }
  }

  // Explicit follow-up phrases first (“recheck that”, “i mean …”)
  if (isFollowUpPhrase(query)) {
    // Clarifying to project value / biggest project.
    // #6 fix: re-run the PRIOR project plan directly (clean routing query + carried
    // plan) instead of string-concatenating prior text + slot expansion + utterance.
    // The old merge produced a garbled routing query
    // ("biggest project can u recheck that active projects value biggest project")
    // with no plan, so downstream rebuilt a plan from that noise and misfired into
    // entity_resolve / clarify.
    if (
      /\b(project\s*value|projects?\s+value|biggest\s+project|largest\s+project|active\s+projects?)\b/i.test(
        query
      ) ||
      (/\bproject/.test(query) && /\b(value|worth|biggest|largest|recheck|that)\b/i.test(query)) ||
      (/\b(recheck|that|again|confirm)\b/i.test(query) && /\bproject/.test(blob))
    ) {
      const priorPlan = basePriorPlan(recentUser, recentAsst);
      if (priorPlan.module === "projects" && novaPlanHasReadyTools(priorPlan)) {
        return resolvedFromMergedPlan(priorPlan);
      }
      const projectsBase =
        priorPlan.module === "projects" ? priorPlan : buildNovaPlan("biggest project value");
      const merged = mergeNovaPlanSlots(projectsBase, {
        module: "projects",
        metric: projectsBase.metric ?? "projects",
        tools: ["projects_summary"],
        confidence: "high",
        clarifyReason: undefined,
      });
      return resolvedFromMergedPlan(merged);
    }

    // Recheck receipts / sales / etc. from prior topic — re-run the prior plan
    // directly; never re-emit the prior question text alongside the "recheck" utterance.
    if (/\b(recheck|again|confirm|verify|that|those)\b/i.test(query)) {
      // Prefer most-recent recheckable turn (topic-switch aware); fall back to metric scan.
      const topic = lastRecheckableUserText(prior) || recentUser;
      if (!topic || isFollowUpPhrase(topic)) {
        return {
          query,
          isFollowUp: true,
          clarifyReask:
            "I’m not sure what to recheck. Ask again with the topic (e.g. **receipts today** or **biggest project**).",
        };
      }
      const priorPlan = basePriorPlan(topic, recentAsst);
      if (novaPlanHasReadyTools(priorPlan)) {
        return resolvedFromMergedPlan(priorPlan);
      }
      const tools = selectNovaTools(topic).filter((t) => t !== "search_entities");
      if (tools.length) {
        return resolvedFromMergedPlan(
          mergeNovaPlanSlots(priorPlan, {
            tools,
            confidence: "high",
            clarifyReason: undefined,
          })
        );
      }
      // Empty prior plan — ask once; never route as bare "recheck that" or leap to stale text.
      return {
        query,
        isFollowUp: true,
        clarifyReask:
          "I’m not sure what to recheck. Ask again with the topic (e.g. **receipts today** or **biggest project**).",
      };
    }

    // “what about Avaada” / “how about X” — replace entity slot, keep metric/period
    const aboutEntity = query.match(
      /^(?:what|how)\s+about\s+(.+?)(?:\s+please|\s+pls)?$/i
    );
    if (aboutEntity) {
      const newEntity = aboutEntity[1].trim();
      if (newEntity && !isNovaEntityNoiseQuick(newEntity) && recentUser && METRIC_WORD.test(recentUser)) {
        const priorPlan = basePriorPlan(recentUser, recentAsst);
        const merged = mergeNovaPlanSlots(priorPlan, { entity: newEntity });
        if (novaPlanHasReadyTools(merged) || priorPlan.module) {
          // Ensure money module stays when prior named a sales metric but tools were cleared
          if (!novaPlanHasReadyTools(merged) && METRIC_WORD.test(recentUser)) {
            const metricOnly = stripNovaEntityFromMetricQuery(recentUser) || "sales";
            const tools = selectNovaTools(`${newEntity} ${metricOnly}`).filter(
              (t) => t !== "search_entities"
            );
            if (tools.length) {
              return resolvedFromMergedPlan(
                mergeNovaPlanSlots(merged, { tools, confidence: "high" })
              );
            }
          }
          return resolvedFromMergedPlan(merged);
        }
      }
    }

    // Generic “i mean …” — keep prior metric, allow new words
    const merged = normalizeNovaQuery(`${recentUser} ${query}`).slice(0, 1000);
    return {
      query: merged,
      forcedTools: selectNovaTools(merged).filter(
        (t) => t !== "search_entities" || selectNovaTools(merged).length === 1
      ),
      isFollowUp: true,
    };
  }

  // Bare party name after a money/domain turn — swap entity slot, keep metric/period.
  // Gated by DialogState slot TTL / topic-switch so stale receipts don't stick forever.
  {
    const bareEntity = extractNovaBareEntityCandidate(query);
    const slotsFresh = canNovaInheritConversationSlots(dialogState, { family: "money" });
    const freshMoneyUser = lastFreshMoneyUserText(prior, { targetFamily: "money" });
    // Prefer DialogState-backed inherit when slots are live; else recent same-family history.
    const moneyPriorUser = slotsFresh
      ? freshMoneyUser || (MONEY_METRIC_RE.test(recentUser) ? recentUser : "")
      : freshMoneyUser;
    const asstLooksLikeMoney =
      /₹|rs\.?\s*\d|sales\s+invoice|tax invoice|total collected|grand total|receipts?\b/i.test(
        recentAsst
      );
    // Assistant money narrative alone counts — prior user may have been bare “tata steels”
    const priorMoneyNarrative = asstLooksLikeMoney && Boolean(moneyPriorUser || recentUser);
    const priorMoneyAsk = MONEY_METRIC_RE.test(moneyPriorUser);
    if (
      bareEntity &&
      (priorMoneyAsk || priorMoneyNarrative) &&
      (slotsFresh || Boolean(freshMoneyUser) || (asstLooksLikeMoney && Boolean(recentUser)))
    ) {
      const topicForPlan = moneyPriorUser || recentUser;
      const priorPlan = basePriorPlan(topicForPlan, recentAsst);
      if (
        slotsFresh &&
        dialogState?.slots?.periodLabel &&
        (!priorPlan.period || priorPlan.period.source === "default")
      ) {
        priorPlan.period = {
          grain: dialogState.slots.periodGrain ?? "day",
          label: dialogState.slots.periodLabel,
          source: (dialogState.slots.periodSource as NovaPlanPeriod["source"]) ?? "follow_up",
        };
      }
      if (slotsFresh && dialogState?.slots?.tools?.length && !priorPlan.tools.length) {
        priorPlan.tools = [...dialogState.slots.tools];
      }
      if (slotsFresh && dialogState?.slots?.metric && !priorPlan.metric) {
        priorPlan.metric = dialogState.slots.metric;
      }
      const merged = mergeNovaPlanSlots(priorPlan, { entity: bareEntity });
      const onlyIdentitySearch =
        merged.tools.length > 0 && merged.tools.every((t) => t === "search_entities");
      if (!novaPlanHasReadyTools(merged) || onlyIdentitySearch) {
        const period =
          merged.period && merged.period.source !== "default"
            ? merged.period
            : merged.period ??
              ({ grain: "month", label: "this month", source: "default" } satisfies NovaPlanPeriod);
        const withSales = mergeNovaPlanSlots(merged, {
          module: "sales_invoices",
          metric: "sales",
          tools: ["sales_summary"],
          confidence: "high",
          period,
        });
        return resolvedFromMergedPlan(withSales);
      }
      return resolvedFromMergedPlan(merged);
    }
  }

  // Bare person after attendance — merge person slot; prefer present (register status)
  // so “Madhu” after late comers answers subjectAttendance, not “0 late”.
  {
    const tokens = query.trim().split(/\s+/).filter(Boolean);
    const priorAttendance =
      /\b(attendance|late\s*comers?|late\s+minutes|punched|who\s+(is|was|were)\s+late|came\s+late|absent|present|missing\s+punch)\b/i.test(
        `${recentUser} ${recentAsst}`
      );
    if (
      priorAttendance &&
      tokens.length >= 1 &&
      tokens.length <= 3 &&
      /^[A-Za-z][A-Za-z'.\-]+(?:\s+[A-Za-z][A-Za-z'.\-]+){0,2}$/.test(query.trim()) &&
      !METRIC_WORD.test(query) &&
      !parseNovaDateRange(query) &&
      !/\b(capabilities?|commands?|features?|help|what|who|how)\b/i.test(query)
    ) {
      const personName = query.trim();
      const priorPlan = basePriorPlan(recentUser, recentAsst);
      const merged = mergeNovaPlanSlots(priorPlan, {
        person: personName,
        module: "attendance",
        metric: "present",
        tools: priorPlan.tools.length ? priorPlan.tools : ["attendance_late_summary"],
        confidence: "high",
      });
      if (novaPlanHasReadyTools(merged) || merged.module === "attendance") {
        return resolvedFromMergedPlan(merged);
      }
    }
  }

  // Pronoun / list follow-ups (“who are they”, “list them”, “names”) after a domain answer
  if (isPronounOrListFollowUp(query)) {
    const forced = toolsFromRecentNovaContext(recentUser, recentAsst);
    if (forced?.length) {
      const priorPerson = extractNovaPersonHint(recentUser);
      const topic = recentUser || "details";
      const merged = normalizeNovaQuery(
        `${priorPerson ? `${priorPerson} ` : ""}${topic} ${query} names details list`
      ).slice(0, 1000);
      return {
        query: merged,
        forcedTools: forced,
        isFollowUp: true,
      };
    }
  }

  // Complete new question (e.g. “yesterday receipts”) — never inherit prior tools
  if (isStandaloneNovaQuery(query)) {
    return { query, isFollowUp: false };
  }

  // Period-only follow-up: merge period slot onto prior plan (“26-27” after “sales?”)
  if (isPeriodOnlyFollowUp(query) && recentUser) {
    const priorPlan = basePriorPlan(recentUser, recentAsst);
    const followPlan = buildNovaPlan(query);
    const periodLabel = query.trim(); // keep "yesterday" / "26-27" for routing + tests
    const period =
      followPlan.period != null
        ? { ...followPlan.period, label: periodLabel, source: "follow_up" as const }
        : { grain: "day" as const, label: periodLabel, source: "follow_up" as const };

    let merged = mergeNovaPlanSlots(priorPlan, { period });
    const priorPerson = extractNovaPersonHint(recentUser);
    if (priorPerson && !extractNovaPersonHint(query)) {
      merged = mergeNovaPlanSlots(merged, { person: priorPerson });
    }
    if (!novaPlanHasReadyTools(merged)) {
      const tools = selectNovaTools(novaPlanToRoutingQuery(merged)).filter(
        (t) => t !== "search_entities"
      );
      if (tools.length) merged = mergeNovaPlanSlots(merged, { tools, confidence: "high" });
    }
    if (novaPlanHasReadyTools(merged) || merged.module) {
      return resolvedFromMergedPlan(merged);
    }
    // Fallback string merge (legacy)
    const mergedQ = normalizeNovaQuery(
      `${priorPerson && !extractNovaPersonHint(query) ? `${priorPerson} ` : ""}${recentUser} ${query}`
    ).slice(0, 1000);
    const tools = selectNovaTools(mergedQ).filter((t) => t !== "search_entities");
    return {
      query: mergedQ,
      forcedTools: tools.length ? tools : selectNovaTools(mergedQ),
      isFollowUp: true,
    };
  }

  // Short domain follow-up after a named person (“leave?” after “Zeeshan tasks”)
  if (
    recentUser &&
    extractNovaPersonHint(recentUser) &&
    !extractNovaPersonHint(query) &&
    query.split(/\s+/).length <= 4 &&
    METRIC_WORD.test(query)
  ) {
    const priorPerson = extractNovaPersonHint(recentUser)!;
    const followPlan = buildNovaPlan(query);
    const priorPlan = basePriorPlan(recentUser, recentAsst);
    const merged = mergeNovaPlanSlots(priorPlan, {
      person: priorPerson,
      ...(followPlan.module ? { module: followPlan.module } : {}),
      ...(followPlan.metric ? { metric: followPlan.metric } : {}),
      ...(followPlan.tools.length ? { tools: followPlan.tools } : {}),
    });
    if (novaPlanHasReadyTools(merged) || followPlan.module) {
      return resolvedFromMergedPlan(merged);
    }
    const mergedQ = normalizeNovaQuery(`${priorPerson} ${query}`).slice(0, 1000);
    const tools = selectNovaTools(mergedQ).filter((t) => t !== "search_entities");
    return {
      query: mergedQ,
      forcedTools: tools.length ? tools : undefined,
      isFollowUp: true,
    };
  }

  return { query, isFollowUp: false };
}

function isNovaEntityNoiseQuick(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n || n.length < 2) return true;
  // Shared noise source with lexicon extract + parse-entity-module.
  if (isNovaTemporalOrModuleEntityNoise(n)) return true;
  return /\b(sales|receipts?|today|yesterday|month|week|project|task|leave)\b/i.test(n);
}
