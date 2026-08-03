/**
 * Phase F / F2 — Nova inference layer (intelligence / differentiation only).
 *
 * Runs *before* follow-up merge and NovaPlan. Classifies the user utterance so
 * meta / garbage / WH-questions / topic-switches never become sticky wrong-module
 * tool runs. NovaPlan backend (plan → tools → facts → answer) is unchanged.
 *
 * Note: chitchat / company-knowledge short-circuits stay in `answerNovaQuery`
 * (avoids circular imports with `nova.ts`). This module owns question-type
 * differentiation for ERP vs meta vs follow-up vs garbage.
 */

import { normalizeNovaQuery } from "@/lib/ai/nova-normalize";
import {
  extractNovaPersonHint,
  matchNovaTopics,
  selectToolsFromLexicon,
  type NovaTopicId,
} from "@/lib/ai/nova-lexicon";
import {
  isPronounOrListFollowUp,
  isStandaloneNovaQuery,
  type NovaChatTurn,
} from "@/lib/ai/nova-context";
import { parseNovaDateRange } from "@/lib/ai/nova-dates";
import { looksLikeNovaClarifyReply } from "@/lib/ai/nova-clarify";
import { detectNovaAwareQuery } from "@/lib/ai/nova-aware";

export type NovaInferenceKind =
  | "meta"
  | "erp_query"
  | "follow_up"
  | "unclear"
  | "garbage";

export type NovaInference = {
  kind: NovaInferenceKind;
  /** Normalized query for downstream (may equal input). */
  query: string;
  /** Why this kind was chosen (debug / tests). */
  reason: string;
  /** Never extract / merge person from this utterance. */
  suppressPerson: boolean;
  /** Never extract / merge customer-project entity from this utterance. */
  suppressEntity: boolean;
  /** Safe to run resolveNovaFollowUp slot merge. */
  allowFollowUpMerge: boolean;
  /** Safe to build/run NovaPlan + tools. */
  allowNovaPlan: boolean;
  /** Best-effort topic hint for tests/debug — never overrides ready tools. */
  moduleHint?: NovaTopicId;
};

/** Tokens that must never be treated as a staff / party name (alone or in a span). */
export const NOVA_INFERENCE_NAME_STOP = new Set([
  "ur",
  "your",
  "you",
  "u",
  "my",
  "me",
  "mine",
  "our",
  "we",
  "i",
  "im",
  "i'm",
  "capabilities",
  "capability",
  "commands",
  "command",
  "features",
  "feature",
  "modules",
  "module",
  "permissions",
  "permission",
  "access",
  "help",
  "hello",
  "hi",
  "hey",
  "thanks",
  "thank",
  "please",
  "pls",
  "what",
  "which",
  "when",
  "where",
  "why",
  "how",
  "who",
  "whose",
  "whom",
  "kaun",
  "kon",
  "kiska",
  "kisne",
  "kisko",
  "punched",
  "punch",
  "came",
  "come",
  "was",
  "were",
  "are",
  "is",
  "did",
  "does",
  "can",
  "could",
  "would",
  "should",
  "about",
  "tell",
  "show",
  "list",
  "give",
  "get",
  "check",
  "find",
  "more",
  "most",
  "today",
  "yesterday",
  "tomorrow",
  "week",
  "month",
  "year",
  "fy",
  "late",
  "attendance",
  "absent",
  "present",
  "tasks",
  "task",
  "sales",
  "receipts",
  "receipt",
  "revenue",
  "billing",
  "turnover",
  "business",
  "company",
  "ops",
  "things",
  "numbers",
  "performance",
  "health",
  "banking",
  "cash",
  "bank",
  "going",
  "doing",
  "leave",
  "notifications",
  "whatsapp",
  "portal",
  "automation",
  "links",
  "documents",
  "settings",
  "nova",
  "empower",
  "erp",
  "ai",
  "assistant",
  "bot",
]);

/** How-is / how's / how-are health frames — never entity/party names. */
export const NOVA_HOW_IS_FRAME =
  /\b(how(?:'s|\s+is|\s+are)|how\s+are\s+we)\b/i;

export const NOVA_META_PHRASE =
  /\b(help|capabilities?|commands?|features?|modules?\s+(do\s+i|can\s+i|have)|what\s+modules|what\s+can\s+(you|u|i)\s+do|what\s+do\s+you\s+do|how\s+do\s+(you|i)\s+use|your\s+capabilities|ur\s+capabilities|ur\s+features|your\s+features|what\s+are\s+your\s+(capabilities|features)|what\s+can\s+you\s+(see|access)|my\s+(access|permissions|modules)|what\s+permissions)\b/i;

const GARBAGE_ONLY =
  /^(ok|okay|cool|great|nice|hmm+|hmmm+|lol|haha|yes|no|yep|nope|idk|wtf|test|asdf+|xxx+|abc|\.+|\?+|!+)$/i;

const ATTENDANCE_PRIOR =
  /\b(attendance|late\s*comers?|late\s+minutes|punched|who\s+(is|was|were)\s+late|came\s+late)\b/i;

/**
 * True when a candidate name/entity span is interrogative, meta, or otherwise non-referential.
 */
export function isNovaNonReferentialName(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (!n || n.length < 2) return true;
  if (NOVA_INFERENCE_NAME_STOP.has(n)) return true;
  const tokens = n.split(/\s+/).filter(Boolean);
  if (tokens.some((t) => NOVA_INFERENCE_NAME_STOP.has(t))) return true;
  if (NOVA_META_PHRASE.test(n)) return true;
  if (NOVA_HOW_IS_FRAME.test(n)) return true;
  if (/^(who|whose|what|which|when|where|why|how|kaun|kon)\b/.test(n)) return true;
  // Multi-token WH leftovers after metric strip (“how is”, “what about”)
  if (tokens.length <= 3 && tokens.some((t) => /^(who|what|which|when|where|why|how)$/.test(t))) {
    return true;
  }
  return false;
}

function tooledTopicIds(q: string): NovaTopicId[] {
  return matchNovaTopics(q)
    .filter((t) => t.tools.length > 0)
    .map((t) => t.id);
}

function bestModuleHint(q: string): NovaTopicId | undefined {
  const ids = tooledTopicIds(q);
  if (ids.length === 1) return ids[0];
  return undefined;
}

function hasErpSignal(q: string): boolean {
  // Lexicon topic hits (tooled) — prefer over hardcoded mega-regex
  if (tooledTopicIds(q).length > 0) return true;
  const lex = selectToolsFromLexicon(q).tools.filter((t) => t !== "search_entities");
  if (lex.length > 0) return true;
  const person = extractNovaPersonHint(q);
  if (person && !isNovaNonReferentialName(person)) return true;
  if (
    parseNovaDateRange(q) &&
    /\b(sales|receipts?|late|attendance|tasks?|kpi|leave|payment|expense|delivery|stock|salary|invoice|purchase|order|bank|recon|grn|approvals?)\b/i.test(
      q
    )
  ) {
    return true;
  }
  return false;
}

function lastUserContent(history: NovaChatTurn[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") return history[i].content;
  }
  return "";
}

/** Mid-thread metric change → new erp_query, never sticky prior tools. */
function isCrossModuleTopicSwitch(q: string, history: NovaChatTurn[]): boolean {
  if (history.length === 0) return false;
  const current = tooledTopicIds(q);
  if (current.length === 0) return false;
  const priorRaw = lastUserContent(history);
  if (!priorRaw) return false;
  const prior = tooledTopicIds(normalizeNovaQuery(priorRaw));
  if (prior.length === 0) return false;
  return current.some((id) => !prior.includes(id));
}

function looksLikeBarePersonFollowUp(q: string, history: NovaChatTurn[]): boolean {
  if (history.length === 0) return false;
  const tokens = q.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 3) return false;
  if (isNovaNonReferentialName(q)) return false;
  if (hasErpSignal(q) || parseNovaDateRange(q)) return false;
  if (!/^[A-Za-z][A-Za-z'.\-\s]{1,40}$/.test(q.trim())) return false;
  const blob = history
    .slice(-4)
    .map((h) => h.content)
    .join(" ");
  return ATTENDANCE_PRIOR.test(blob) || ATTENDANCE_PRIOR.test(lastUserContent(history));
}

function lastAssistantContent(history: NovaChatTurn[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "assistant") return history[i].content;
  }
  return "";
}

function looksLikeFollowUpCandidate(q: string, history: NovaChatTurn[]): boolean {
  if (history.length === 0) return false;
  if (looksLikeNovaClarifyReply(q, lastAssistantContent(history))) return true;
  if (isPronounOrListFollowUp(q)) return true;
  if (
    /\b(recheck|check\s+again|again|confirm|verify|double[- ]?check|i mean|what about|how about|same thing)\b/i.test(
      q
    )
  ) {
    return true;
  }
  if (isStandaloneNovaQuery(q)) return false;
  const tokens = q.trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 4 && !NOVA_META_PHRASE.test(q) && !GARBAGE_ONLY.test(q.trim())) {
    return true;
  }
  return false;
}

/**
 * Classify a user utterance before follow-up merge / NovaPlan.
 */
export function inferNovaQuery(
  rawQuery: string,
  history: NovaChatTurn[] = []
): NovaInference {
  const query = normalizeNovaQuery(rawQuery).slice(0, 1000);
  const raw = rawQuery.trim();
  const moduleHint = query ? bestModuleHint(query) : undefined;

  if (!query) {
    return {
      kind: "unclear",
      query: "",
      reason: "empty",
      suppressPerson: true,
      suppressEntity: true,
      allowFollowUpMerge: false,
      allowNovaPlan: false,
    };
  }

  // Meta / capabilities — always, even mid-attendance thread
  if (NOVA_META_PHRASE.test(query) || NOVA_META_PHRASE.test(raw) || detectNovaAwareQuery(raw)) {
    return {
      kind: "meta",
      query,
      reason: detectNovaAwareQuery(raw) ? "nova_aware" : "capabilities_or_help",
      suppressPerson: true,
      suppressEntity: true,
      allowFollowUpMerge: false,
      allowNovaPlan: false,
      moduleHint,
    };
  }

  if (GARBAGE_ONLY.test(query) || GARBAGE_ONLY.test(raw)) {
    return {
      kind: "garbage",
      query,
      reason: "non_entity_token",
      suppressPerson: true,
      suppressEntity: true,
      allowFollowUpMerge: false,
      allowNovaPlan: false,
    };
  }

  // F2c — topic-switch mid-thread: never merge sticky prior tools
  if (isCrossModuleTopicSwitch(query, history)) {
    return {
      kind: "erp_query",
      query,
      reason: "topic_switch",
      suppressPerson: false,
      suppressEntity: false,
      allowFollowUpMerge: false,
      allowNovaPlan: true,
      moduleHint,
    };
  }

  // “Why Tata?” / “Why is Tata in attention?” after a pack/answer — follow-up merge
  // so DialogState bind-by-id wins (never soft-fuzzy the already-bound party).
  if (
    history.length > 0 &&
    /\bwhy\b/i.test(query) &&
    (/\b(attention|overdue|outstanding|finding)\b/i.test(query) ||
      /\bwhy\s+[A-Za-z][A-Za-z0-9&.\-']{1,40}\s*\??$/i.test(query.trim()))
  ) {
    return {
      kind: "follow_up",
      query,
      reason: "why_attention_follow_up",
      suppressPerson: true,
      suppressEntity: false,
      allowFollowUpMerge: true,
      allowNovaPlan: true,
      moduleHint,
    };
  }

  // Bare period (“today”, “this month”, “26-27”) — before non-referential stop
  if (
    parseNovaDateRange(query) ||
    /^(today|yesterday|this\s+week|last\s+week|this\s+month|last\s+month|this\s+fy|this\s+year)$/i.test(
      query.trim()
    )
  ) {
    if (!hasErpSignal(query) && !isStandaloneNovaQuery(query)) {
      return {
        kind: "erp_query",
        query,
        reason: "bare_period",
        suppressPerson: true,
        suppressEntity: true,
        allowFollowUpMerge: true,
        allowNovaPlan: true,
        moduleHint,
      };
    }
  }

  if (hasErpSignal(query) || isStandaloneNovaQuery(query)) {
    return {
      kind: "erp_query",
      query,
      reason: "erp_signal",
      suppressPerson: false,
      suppressEntity: false,
      allowFollowUpMerge: false,
      allowNovaPlan: true,
      moduleHint,
    };
  }

  // F2b — bare person after attendance → follow_up + person merge
  if (looksLikeBarePersonFollowUp(query, history)) {
    return {
      kind: "follow_up",
      query,
      reason: "attendance_person_follow_up",
      suppressPerson: false,
      suppressEntity: true,
      allowFollowUpMerge: true,
      allowNovaPlan: true,
      moduleHint: "attendance",
    };
  }

  if (looksLikeFollowUpCandidate(query, history)) {
    // Clarify option pick (“1”, label) — never treat as garbage / non-referential name
    if (looksLikeNovaClarifyReply(query, lastAssistantContent(history))) {
      return {
        kind: "follow_up",
        query,
        reason: "clarify_option_pick",
        suppressPerson: false,
        suppressEntity: false,
        allowFollowUpMerge: true,
        allowNovaPlan: true,
        moduleHint,
      };
    }
    // Only block bare name-shaped garbage (“ur capabilities”), not “can u recheck that”
    const tokens = query.split(/\s+/).filter(Boolean);
    const followUpVerb = /\b(recheck|confirm|verify|mean|about|again)\b/i.test(query);
    if (!followUpVerb && tokens.length <= 3 && isNovaNonReferentialName(query)) {
      return {
        kind: "garbage",
        query,
        reason: "follow_up_candidate_non_referential",
        suppressPerson: true,
        suppressEntity: true,
        allowFollowUpMerge: false,
        allowNovaPlan: false,
      };
    }
    return {
      kind: "follow_up",
      query,
      reason: "short_or_pronoun_after_history",
      suppressPerson: false,
      suppressEntity: false,
      allowFollowUpMerge: true,
      allowNovaPlan: true,
      moduleHint,
    };
  }

  // Likely bare party / acronym / underspecified ask — let NovaPlan clarify
  return {
    kind: "unclear",
    query,
    reason: "no_signal",
    suppressPerson: isNovaNonReferentialName(query),
    suppressEntity: isNovaNonReferentialName(query),
    allowFollowUpMerge: false,
    allowNovaPlan: true,
    moduleHint,
  };
}
