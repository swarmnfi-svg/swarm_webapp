/**
 * NovaDialogState — session DST for pending clarify acts + conversation slots.
 * Short replies bind by option id/type; never re-fuzzy the display name.
 * Conversation slots TTL / topic-switch stop infinite sticky metric/period/entity.
 */

import {
  matchNovaClarifySelection,
  type NovaClarifyKind,
  type NovaClarifyOption,
  type NovaClarifyOptionType,
} from "@/lib/ai/nova-clarify";
import {
  isNovaModuleOnlyFollowUp,
  stickyModuleFollowUpNeedsBind,
} from "@/lib/nova/query-structure";
import {
  looksLikeHardPartyOrProjectName,
  looksLikePartyOrProjectName,
  looksLikeSingleTokenPartyLabel,
} from "@/lib/nova/party-name";

/** Lightweight topic-switch signal (avoid importing nova-context → cycle). */
function looksLikeStandaloneErpAsk(q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return false;
  if (/\b(leave\s+balance|my\s+leave|what can i|help)\b/.test(t)) return true;
  // Drawing / document asks (P&ID) are standalone — not a catalog chip pick
  if (
    /\b(p\s*&\s*id|p\s+and\s+id|pnids?|documents?|drawings?|files?|photos?|attachments?)\b/.test(
      t
    )
  ) {
    return true;
  }
  const metric =
    /\b(sales|revenue|receipts?|collections?|invoices?|billing|turnover|projects?|late|attendance|stock|vendors?|tasks?|kpi|approvals?|payables?|receivables?|expenses?|reimburs\w*|claims?|spend|spent|salary|payroll|leave|advances?|incentives?|grn|profitability)\b/;
  if (!metric.test(t)) return false;
  if (
    /\b(today|yesterday|this\s+week|last\s+week|this\s+month|pending|overdue|open|my work|biggest|largest|who|how many)\b/.test(
      t
    )
  ) {
    return true;
  }
  return t.split(/\s+/).length >= 2;
}

/** Pending clarify — slightly longer than slots so a mid-pick reply still binds. */
export const NOVA_CLARIFY_ACT_TTL_MS = 30 * 60 * 1000; // 30 minutes
/** Working conversation slots (metric/period/entity) — wall-clock idle. */
export const NOVA_CONVERSATION_SLOT_TTL_MS = 20 * 60 * 1000; // 20 minutes
/** Working conversation slots — max user turns without a same-family refresh. */
export const NOVA_CONVERSATION_SLOT_MAX_TURNS = 10;
/**
 * lastSavablePack may hold full pack + ₹ narrative for “save report”.
 * Align with slot TTL so DialogState does not retain money after idle expiry (L1).
 */
export const NOVA_LAST_SAVABLE_PACK_TTL_MS = NOVA_CONVERSATION_SLOT_TTL_MS;

export type NovaSlotFamily =
  | "money"
  | "attendance"
  | "tasks"
  | "leave"
  | "approvals"
  | "projects"
  | "staff"
  | "other";

export type NovaClarifyActOption = {
  n: number;
  id: string;
  type: NovaClarifyOptionType;
  label: string;
  code?: string | null;
};

export type NovaClarifyAct = {
  id: string;
  kind: NovaClarifyKind;
  createdAt: string;
  expiresAt: string;
  originalQuery: string;
  hint?: string;
  options: NovaClarifyActOption[];
  resume?: {
    tools?: string[];
    metric?: string | null;
    /** Preserve explicit period across clarify pick — never re-default to month. */
    periodLabel?: string | null;
    periodGrain?: "day" | "week" | "month" | "fy" | "latest" | "open" | null;
    periodSource?: "explicit" | "default" | "follow_up" | null;
    module?: string | null;
    /** Full routing query at clarify time (e.g. "tata receipts today"). */
    routingQuery?: string | null;
  };
};

export type NovaDialogBound = {
  entityId?: string;
  entityType?: "customer" | "vendor" | "project";
  entityCode?: string;
  entityLabel?: string;
  personUserId?: string;
};

/** T1 working slots — expire by wall-clock and/or turn count (not sticky ₹ memory). */
export type NovaConversationSlots = {
  family: NovaSlotFamily | null;
  metric?: string | null;
  tools?: string[];
  module?: string | null;
  entityHint?: string | null;
  /** Sticky person for personal-task follow-ups (“pending tasks” after Arif). */
  personHint?: string | null;
  periodLabel?: string | null;
  periodGrain?: "day" | "week" | "month" | "fy" | "latest" | "open" | null;
  periodSource?: "explicit" | "default" | "follow_up" | null;
  /** User turns since slots were last set/refreshed for this family. */
  turnCount: number;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
};

/** Last Month / Project / Collection pack eligible for chat “save report”. */
export type NovaLastSavablePack = {
  pack: import("@/lib/nova/pack-result").NovaPackResult;
  narrative: string;
  capturedAt: string;
};

export type NovaDialogState = {
  conversationId?: string;
  userId?: string;
  pendingClarify: NovaClarifyAct | null;
  bound?: NovaDialogBound;
  /** Last compatible metric/period/entity for short follow-ups — TTL'd. */
  slots?: NovaConversationSlots | null;
  /** Pack snapshot for “save/give report” follow-up (NOVA plane only). */
  lastSavablePack?: NovaLastSavablePack | null;
  updatedAt: string;
};

export type NovaClarifyResolveHit = {
  kind: "matched";
  option: NovaClarifyActOption;
  act: NovaClarifyAct;
};

export type NovaClarifyResolveMiss = {
  kind: "reask" | "cancel" | "none";
  reason: string;
};

export type NovaClarifyResolveResult = NovaClarifyResolveHit | NovaClarifyResolveMiss;

function newActId(): string {
  return `clarify_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyNovaDialogState(
  partial?: Partial<NovaDialogState>
): NovaDialogState {
  return {
    pendingClarify: null,
    slots: null,
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

export function isNovaClarifyActExpired(
  act: NovaClarifyAct,
  now = new Date()
): boolean {
  const exp = Date.parse(act.expiresAt);
  if (!Number.isFinite(exp)) return true;
  return now.getTime() > exp;
}

function parseConversationSlots(raw: unknown): NovaConversationSlots | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const family =
    typeof s.family === "string" || s.family === null
      ? (s.family as NovaSlotFamily | null)
      : null;
  const turnCount = typeof s.turnCount === "number" && Number.isFinite(s.turnCount) ? s.turnCount : 0;
  const createdAt = typeof s.createdAt === "string" ? s.createdAt : new Date().toISOString();
  const updatedAt = typeof s.updatedAt === "string" ? s.updatedAt : createdAt;
  const expiresAt =
    typeof s.expiresAt === "string"
      ? s.expiresAt
      : new Date(Date.parse(updatedAt) + NOVA_CONVERSATION_SLOT_TTL_MS).toISOString();
  return {
    family,
    metric: typeof s.metric === "string" ? s.metric : s.metric === null ? null : undefined,
    tools: Array.isArray(s.tools) ? s.tools.map(String) : undefined,
    module: typeof s.module === "string" ? s.module : s.module === null ? null : undefined,
    entityHint:
      typeof s.entityHint === "string" ? s.entityHint : s.entityHint === null ? null : undefined,
    personHint:
      typeof s.personHint === "string" ? s.personHint : s.personHint === null ? null : undefined,
    periodLabel:
      typeof s.periodLabel === "string"
        ? s.periodLabel
        : s.periodLabel === null
          ? null
          : undefined,
    periodGrain:
      typeof s.periodGrain === "string"
        ? (s.periodGrain as NovaConversationSlots["periodGrain"])
        : s.periodGrain === null
          ? null
          : undefined,
    periodSource:
      typeof s.periodSource === "string"
        ? (s.periodSource as NovaConversationSlots["periodSource"])
        : s.periodSource === null
          ? null
          : undefined,
    turnCount,
    createdAt,
    expiresAt,
    updatedAt,
  };
}

function parseLastSavablePack(raw: unknown): NovaLastSavablePack | null | undefined {
  if (raw === null) return null;
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const pack = o.pack;
  if (!pack || typeof pack !== "object") return null;
  const packId = (pack as { packId?: unknown }).packId;
  const schemaVersion = (pack as { schemaVersion?: unknown }).schemaVersion;
  if (typeof packId !== "string" || typeof schemaVersion !== "number") return null;
  return {
    pack: pack as NovaLastSavablePack["pack"],
    narrative: typeof o.narrative === "string" ? o.narrative : "",
    capturedAt: typeof o.capturedAt === "string" ? o.capturedAt : new Date().toISOString(),
  };
}

export function parseNovaDialogState(raw: unknown): NovaDialogState | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const pending = obj.pendingClarify;
  if (pending != null && typeof pending !== "object") return null;
  return {
    conversationId: typeof obj.conversationId === "string" ? obj.conversationId : undefined,
    userId: typeof obj.userId === "string" ? obj.userId : undefined,
    pendingClarify: (pending as NovaClarifyAct | null) ?? null,
    bound:
      obj.bound && typeof obj.bound === "object"
        ? (obj.bound as NovaDialogBound)
        : undefined,
    slots: parseConversationSlots(obj.slots),
    lastSavablePack: parseLastSavablePack(obj.lastSavablePack),
    updatedAt:
      typeof obj.updatedAt === "string" ? obj.updatedAt : new Date().toISOString(),
  };
}

/** Remember pack for chat “save report” / “give report” follow-ups. */
export function setNovaLastSavablePack(
  state: NovaDialogState,
  pack: NovaLastSavablePack["pack"],
  narrative: string,
  opts?: { now?: Date }
): NovaDialogState {
  const now = opts?.now ?? new Date();
  return {
    ...state,
    lastSavablePack: {
      pack,
      narrative: narrative.slice(0, 50_000),
      capturedAt: now.toISOString(),
    },
    updatedAt: now.toISOString(),
  };
}

export function clearNovaLastSavablePack(state: NovaDialogState): NovaDialogState {
  return {
    ...state,
    lastSavablePack: null,
    updatedAt: new Date().toISOString(),
  };
}

export function isNovaLastSavablePackExpired(
  snap: NovaLastSavablePack | null | undefined,
  now = new Date(),
  ttlMs = NOVA_LAST_SAVABLE_PACK_TTL_MS
): boolean {
  if (!snap) return true;
  const captured = Date.parse(snap.capturedAt);
  if (!Number.isFinite(captured)) return true;
  return now.getTime() - captured > ttlMs;
}

/** Classify utterance into a coarse slot family for topic-switch. */
export function detectNovaSlotFamily(q: string): NovaSlotFamily | null {
  const t = q.trim().toLowerCase();
  if (!t) return null;
  // Attendance before bare "late payment" money — exclude late fee/payment.
  if (/\b(late\s+payment|late\s+fee|payment\s+late)\b/.test(t)) {
    /* fall through to money */
  } else if (
    /\b(attendance|late\s*comers?|latecomers|punched|absent|present|who\s+(was|is|were)\s+late|who\s+came\s+late|who\s+punched\s+late)\b/.test(
      t
    ) ||
    (/\blate\b/.test(t) && /\b(who|was|were|comers?|minutes|list)\b/.test(t))
  ) {
    return "attendance";
  }
  // “staff Arif” / “employee Zeeshan” — HR people, not sticky money party
  if (
    /^(staff|employee)\s+[a-z]/i.test(t) ||
    /^(who\s+(?:is|are)|who's)\s+(?!late\b|absent\b|present\b|most\b)/i.test(t) ||
    (/\b(staff|employees?)\b/.test(t) &&
      !/\b(expense|expenses|kharcha|advance|advances|incentive|salary|payroll)\b/.test(t))
  ) {
    return "staff";
  }
  if (/\b(expenses?|reimburs\w*|claims?|spend|spent|kharcha)\b/.test(t)) return "money";
  if (/\b(leave(\s+balance)?|payroll|salary|advances?|incentives?)\b/.test(t)) return "leave";
  if (/\b(tasks?|todos?|my work)\b/.test(t)) return "tasks";
  if (/\b(approvals?)\b/.test(t)) return "approvals";
  if (
    /\b(sales|revenue|receipts?|collections?|invoices?|billing|turnover|outstanding|receivables?|payables?|expenses?|reimburs\w*|claims?|spend|spent)\b/.test(
      t
    )
  ) {
    return "money";
  }
  if (/\bprojects?\b/.test(t)) return "projects";
  return null;
}

export function isNovaConversationSlotsExpired(
  slots: NovaConversationSlots | null | undefined,
  now = new Date()
): boolean {
  if (!slots) return true;
  const exp = Date.parse(slots.expiresAt);
  if (!Number.isFinite(exp) || now.getTime() > exp) return true;
  if (slots.turnCount >= NOVA_CONVERSATION_SLOT_MAX_TURNS) return true;
  return false;
}

/** True when short follow-ups may still inherit metric/period/entity. */
export function canNovaInheritConversationSlots(
  state: NovaDialogState | null | undefined,
  opts?: { family?: NovaSlotFamily | null; now?: Date }
): boolean {
  const slots = state?.slots;
  if (!slots || isNovaConversationSlotsExpired(slots, opts?.now)) return false;
  if (opts?.family && slots.family && opts.family !== slots.family) return false;
  return Boolean(slots.family || slots.metric || slots.tools?.length);
}

/** True when utterance clearly continues the bound party (full label, code, or significant token). */
export function utteranceReferencesBoundEntity(
  query: string,
  bound?: NovaDialogBound
): boolean {
  if (!bound) return false;
  const t = query.trim().toLowerCase();
  if (!t) return false;
  // Deixis: this/that/the project|customer|vendor — typo-tolerant “i this project” normalized upstream.
  if (
    /\b(their|its|same\s+(one|party|customer|vendor|project)|(?:this|that|the)\s+(customer|vendor|project|party|one))\b/.test(
      t
    )
  ) {
    return true;
  }
  const needles = [bound.entityLabel, bound.entityCode].filter(Boolean) as string[];
  if (needles.some((n) => n.length >= 2 && t.includes(n.toLowerCase()))) return true;
  // “Why Tata?” after bound “Tata Steels” — match significant label tokens (≥3 chars)
  const tokens = String(bound.entityLabel ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((tok) => tok.length >= 3);
  return tokens.some((tok) => new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t));
}

/** Module families that may reuse sticky entity bind without re-saying the name. */
const NOVA_STICKY_ENTITY_MODULE_FAMILIES: ReadonlySet<NovaSlotFamily> = new Set([
  "money",
  "tasks",
  "projects",
  "approvals",
  "other",
]);

/** HR / people families — always drop party/project sticky bind. */
const NOVA_CLEAR_ENTITY_ON_FAMILY: ReadonlySet<NovaSlotFamily> = new Set([
  "attendance",
  "leave",
  "staff",
]);

/** Self / org-wide cues — never inherit a prior party bind. */
const NOVA_ORG_OR_SELF_SCOPE_RE =
  /\b(my|mine|all|every|everyone|company(?:[- ]wide)?|org(?:anisation|anization)?(?:[- ]wide)?|whole\s+(company|org)|list\s+all)\b/i;

/**
 * Keep sticky entity across {module} follow-ups (tasks / invoices / …).
 * Clear on attendance/leave/staff, self/org-wide asks, or when the utterance
 * does not continue the party and is not a short module-only follow-up.
 */
export function shouldKeepNovaBoundEntityOnTopicSwitch(
  query: string,
  family: NovaSlotFamily | null,
  bound?: NovaDialogBound
): boolean {
  if (!bound?.entityId || !bound.entityType) return false;
  if (family && NOVA_CLEAR_ENTITY_ON_FAMILY.has(family)) return false;
  if (NOVA_ORG_OR_SELF_SCOPE_RE.test(query)) return false;
  if (utteranceReferencesBoundEntity(query, bound)) return true;
  // Short module-only follow-up on a sticky party — keep bind (no re-fuzzy search dump).
  if (family && NOVA_STICKY_ENTITY_MODULE_FAMILIES.has(family)) {
    const tokens = query.trim().split(/\s+/).filter(Boolean);
    if (tokens.length > 0 && tokens.length <= 8) return true;
  }
  return false;
}

export {
  isNovaModuleOnlyFollowUp,
  stickyModuleFollowUpNeedsBind,
} from "@/lib/nova/query-structure";

/**
 * Module-only follow-up with prior entity hint but no sticky bind → clarify.
 * (P1: never silent org-wide after a party-scoped turn lost its bind.)
 */
export function stickyModuleFollowUpClarifyReason(
  query: string,
  state: NovaDialogState | null | undefined
): string | null {
  // Sticky person carry — short “pending tasks” inherits prior staff, no party clarify
  if (state?.slots?.personHint?.trim() && isNovaModuleOnlyFollowUp(query)) {
    return null;
  }
  if (
    !stickyModuleFollowUpNeedsBind({
      isModuleOnly: isNovaModuleOnlyFollowUp(query),
      boundEntityId: state?.bound?.entityId ?? null,
      slotsEntityHint: state?.slots?.entityHint ?? null,
      slotsPersonHint: state?.slots?.personHint ?? null,
    })
  ) {
    return null;
  }
  const hint = state?.slots?.entityHint?.trim() || "that party";
  return `Which project or customer for “${hint}”? Say the name, or pick from the list — I won’t show org-wide ${query.trim().toLowerCase()} without a bind.`;
}

function periodContradictedByUtterance(
  query: string,
  slots: NovaConversationSlots | null | undefined
): boolean {
  if (!slots?.periodLabel && !slots?.periodGrain) return false;
  const t = query.trim().toLowerCase();
  if (!/\b(today|yesterday|this\s+week|last\s+week|this\s+month|last\s+month|this\s+fy|fy\s*\d)\b/.test(t)) {
    return false;
  }
  const prior = String(slots.periodLabel ?? "").toLowerCase();
  if (!prior) return true;
  // Explicit new period token that differs from stored label
  if (/\btoday\b/.test(t) && !/\btoday\b/.test(prior)) return true;
  if (/\byesterday\b/.test(t) && !/\byesterday\b/.test(prior)) return true;
  if (/\bthis\s+month\b/.test(t) && !/\bthis\s+month\b/.test(prior)) return true;
  if (/\blast\s+month\b/.test(t) && !/\blast\s+month\b/.test(prior)) return true;
  if (/\bthis\s+week\b/.test(t) && !/\bthis\s+week\b/.test(prior)) return true;
  return false;
}

/**
 * Drop expired working slots + bound entity, and TTL-clear lastSavablePack
 * so DialogState does not retain full ₹ packs after idle (pending ClarifyAct has its own TTL).
 */
export function expireNovaDialogSlots(
  state: NovaDialogState,
  now = new Date()
): NovaDialogState {
  const slotsExpired = !state.slots || isNovaConversationSlotsExpired(state.slots, now);
  const packExpired = isNovaLastSavablePackExpired(state.lastSavablePack, now);
  const clearSlots = Boolean(state.slots) && slotsExpired;
  const clearPack = Boolean(state.lastSavablePack) && (packExpired || clearSlots);
  if (!clearSlots && !clearPack) return state;
  return {
    ...state,
    ...(clearSlots ? { slots: null, bound: undefined } : {}),
    ...(clearPack ? { lastSavablePack: null } : {}),
    updatedAt: now.toISOString(),
  };
}

/**
 * On family/metric topic-switch, clear incompatible slots.
 * Keep entity for short module follow-ups / deixis; always clear on HR families
 * (even when slots were already null after a prior sticky keep).
 */
export function applyNovaTopicSwitchToDialogState(
  state: NovaDialogState,
  query: string,
  opts?: { now?: Date }
): NovaDialogState {
  const now = opts?.now ?? new Date();
  let next = expireNovaDialogSlots(state, now);

  // Period-only follow-ups (“and last month”) may not carry a family keyword.
  if (
    next.slots &&
    !isNovaConversationSlotsExpired(next.slots, now) &&
    periodContradictedByUtterance(query, next.slots)
  ) {
    next = {
      ...next,
      slots: {
        ...next.slots,
        periodLabel: null,
        periodGrain: null,
        periodSource: null,
        updatedAt: now.toISOString(),
      },
      updatedAt: now.toISOString(),
    };
  }

  const family = detectNovaSlotFamily(query);
  if (!family) return next;

  // HR / people asks always drop party bind (slots may already be null mid sticky).
  if (NOVA_CLEAR_ENTITY_ON_FAMILY.has(family) && next.bound?.entityId) {
    return {
      ...next,
      bound: undefined,
      slots: null,
      updatedAt: now.toISOString(),
    };
  }

  const priorFamily = next.slots?.family ?? null;
  const isSwitch = Boolean(priorFamily && priorFamily !== family);
  if (!isSwitch && next.slots && !isNovaConversationSlotsExpired(next.slots, now)) {
    return next;
  }
  if (!isSwitch) return next;

  const keepEntity = shouldKeepNovaBoundEntityOnTopicSwitch(query, family, next.bound);
  return {
    ...next,
    bound: keepEntity ? next.bound : undefined,
    slots: null,
    updatedAt: now.toISOString(),
  };
}

/** After a successful plan/answer — refresh working slots + renew TTL. */
export function refreshNovaConversationSlots(
  state: NovaDialogState,
  patch: {
    family?: NovaSlotFamily | null;
    metric?: string | null;
    tools?: string[];
    module?: string | null;
    entityHint?: string | null;
    personHint?: string | null;
    periodLabel?: string | null;
    periodGrain?: NovaConversationSlots["periodGrain"];
    periodSource?: NovaConversationSlots["periodSource"];
  },
  opts?: { now?: Date; ttlMs?: number }
): NovaDialogState {
  const now = opts?.now ?? new Date();
  const ttl = opts?.ttlMs ?? NOVA_CONVERSATION_SLOT_TTL_MS;
  const iso = now.toISOString();
  return {
    ...state,
    slots: {
      family: patch.family ?? null,
      metric: patch.metric ?? null,
      tools: patch.tools ? [...patch.tools] : undefined,
      module: patch.module ?? null,
      entityHint: patch.entityHint ?? null,
      personHint: patch.personHint ?? null,
      periodLabel: patch.periodLabel ?? null,
      periodGrain: patch.periodGrain ?? null,
      periodSource: patch.periodSource ?? null,
      turnCount: 0,
      createdAt: state.slots?.createdAt && state.slots.family === patch.family
        ? state.slots.createdAt
        : iso,
      expiresAt: new Date(now.getTime() + ttl).toISOString(),
      updatedAt: iso,
    },
    updatedAt: iso,
  };
}

/** Count a user turn against working slots (toward MAX_TURNS). */
export function bumpNovaConversationSlotTurn(
  state: NovaDialogState,
  opts?: { now?: Date }
): NovaDialogState {
  const now = opts?.now ?? new Date();
  if (!state.slots) return state;
  const nextCount = state.slots.turnCount + 1;
  if (nextCount >= NOVA_CONVERSATION_SLOT_MAX_TURNS) {
    return {
      ...state,
      slots: null,
      bound: undefined,
      lastSavablePack: null,
      updatedAt: now.toISOString(),
    };
  }
  return {
    ...state,
    slots: {
      ...state.slots,
      turnCount: nextCount,
      updatedAt: now.toISOString(),
    },
    updatedAt: now.toISOString(),
  };
}

export function clearNovaConversationSlots(state: NovaDialogState): NovaDialogState {
  return {
    ...state,
    slots: null,
    bound: undefined,
    lastSavablePack: null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Map tools/metric/module → slot family (for refresh after answer).
 */
export function familyFromNovaPlanHints(input: {
  metric?: string | null;
  module?: string | null;
  tools?: string[];
  query?: string;
}): NovaSlotFamily | null {
  if (input.query) {
    const fromQ = detectNovaSlotFamily(input.query);
    if (fromQ) return fromQ;
  }
  const blob = `${input.metric ?? ""} ${input.module ?? ""} ${(input.tools ?? []).join(" ")}`.toLowerCase();
  if (/attendance|late/.test(blob)) return "attendance";
  if (/leave|salary|payroll|advance|incentive/.test(blob)) return "leave";
  if (/task/.test(blob)) return "tasks";
  if (/approval/.test(blob)) return "approvals";
  if (/staff_summary|staff\.|employee/.test(blob)) return "staff";
  if (/receipt|sales|invoice|collection|receivable|payable|billing|revenue/.test(blob)) {
    return "money";
  }
  if (/project/.test(blob)) return "projects";
  return null;
}

export function buildNovaClarifyAct(input: {
  kind: NovaClarifyKind;
  originalQuery: string;
  hint?: string;
  options: NovaClarifyOption[] | NovaClarifyActOption[];
  resume?: NovaClarifyAct["resume"];
  ttlMs?: number;
  now?: Date;
}): NovaClarifyAct {
  const now = input.now ?? new Date();
  const ttl = input.ttlMs ?? NOVA_CLARIFY_ACT_TTL_MS;
  return {
    id: newActId(),
    kind: input.kind,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl).toISOString(),
    originalQuery: input.originalQuery.trim().slice(0, 1000),
    hint: input.hint?.trim().slice(0, 200),
    options: input.options.slice(0, 8).map((o) => ({
      n: o.n,
      id: o.id,
      type: o.type,
      label: o.label,
      code: o.code ?? null,
    })),
    resume: input.resume,
  };
}

/** Type deixis: “the customer” / “the project” when unique among options. */
export function matchNovaClarifyTypeDeixis(
  query: string,
  options: NovaClarifyActOption[]
): NovaClarifyActOption | null {
  const t = query.trim().toLowerCase().replace(/^[#"']+|["']+$/g, "");
  if (!t) return null;
  const map: Array<{ re: RegExp; type: NovaClarifyOptionType }> = [
    { re: /^(the\s+)?customers?$/, type: "customer" },
    { re: /^(the\s+)?vendors?$/, type: "vendor" },
    { re: /^(the\s+)?projects?$/, type: "project" },
    { re: /^(the\s+)?(staff|person|people|employee)s?$/, type: "staff" },
  ];
  for (const { re, type } of map) {
    if (!re.test(t)) continue;
    const hits = options.filter((o) => o.type === type);
    if (hits.length === 1) return hits[0]!;
    return null;
  }
  return null;
}

/**
 * Soft deixis only when a single option exists (“yes”, “that one”).
 * Never silent-pick when 2+.
 */
export function matchNovaClarifySoftDeixis(
  query: string,
  options: NovaClarifyActOption[]
): NovaClarifyActOption | null {
  if (options.length !== 1) return null;
  const t = query.trim().toLowerCase();
  if (/^(yes|y|ok|okay|that|that one|the first|first one)$/i.test(t)) {
    return options[0]!;
  }
  return null;
}

/** Convert act options to clarify option shape for matchNovaClarifySelection. */
function toClarifyOptions(options: NovaClarifyActOption[]): NovaClarifyOption[] {
  return options.map((o) => ({
    n: o.n,
    id: o.id,
    label: o.label,
    type: o.type,
    code: o.code,
    reply: o.code?.trim() || o.label,
  }));
}

/**
 * NovaClarifyResolver — match short replies against a pending ClarifyAct.
 * Priority: index → code/id → label → type deixis → soft deixis (unique only).
 */
export function resolveNovaClarifyReply(
  query: string,
  act: NovaClarifyAct | null | undefined,
  opts?: { now?: Date }
): NovaClarifyResolveResult {
  if (!act || !act.options.length) return { kind: "none", reason: "no_pending" };
  if (isNovaClarifyActExpired(act, opts?.now)) {
    return { kind: "none", reason: "expired" };
  }

  const t = query.trim();
  if (!t) return { kind: "none", reason: "empty" };

  // Topic switch → cancel pending (caller clears act and runs normal pipeline)
  if (shouldCancelPendingNovaClarify(t, act)) {
    return { kind: "cancel", reason: "topic_switch" };
  }

  const asOpts = toClarifyOptions(act.options);
  const picked =
    matchNovaClarifySelection(t, asOpts) ??
    matchNovaClarifyTypeDeixis(t, act.options) ??
    matchNovaClarifySoftDeixis(t, act.options);

  if (picked) {
    const option =
      act.options.find((o) => o.n === picked.n && o.id === picked.id) ??
      act.options.find((o) => o.n === picked.n) ??
      ({
        n: picked.n,
        id: picked.id,
        type: picked.type,
        label: picked.label,
        code: picked.code,
      } satisfies NovaClarifyActOption);
    return { kind: "matched", option, act };
  }

  // Digit / short reply that looks like a clarify attempt but missed → re-ask
  if (
    /^(?:#\s*)?\d{1,2}$/.test(t) ||
    /^option\s+\d{1,2}$/i.test(t) ||
    /^(yes|y|ok|okay|that|that one)$/i.test(t)
  ) {
    return { kind: "reask", reason: "unmatched_short_reply" };
  }

  // Other short tokens while pending — do not fuzzy-search as a new entity hint
  if (t.length <= 40 && !shouldCancelPendingNovaClarify(t, act)) {
    return { kind: "reask", reason: "short_unmatched" };
  }

  return { kind: "cancel", reason: "long_or_unknown" };
}

/**
 * Cancel pending clarify when the user asks a new standalone ERP question
 * (or clearly pivots away from the option list).
 */
export function shouldCancelPendingNovaClarify(
  query: string,
  act: NovaClarifyAct
): boolean {
  const t = query.trim();
  if (!t) return false;
  if (/^(?:#\s*)?\d{1,2}$/.test(t) || /^option\s+\d{1,2}$/i.test(t)) return false;
  if (matchNovaClarifySelection(t, toClarifyOptions(act.options))) return false;
  if (matchNovaClarifyTypeDeixis(t, act.options)) return false;
  if (matchNovaClarifySoftDeixis(t, act.options)) return false;

  if (looksLikeStandaloneErpAsk(t)) {
    // Multi-token ERP asks cancel even when they mention a chip word
    // (“pending tasks”, “sales invoices”) — exact chip picks already matched above.
    if (t.trim().split(/\s+/).filter(Boolean).length >= 2) return true;
    const lower = t.toLowerCase();
    const touchesOption = act.options.some(
      (o) =>
        lower.includes(o.label.toLowerCase()) ||
        (o.code && lower.includes(o.code.toLowerCase()))
    );
    if (!touchesOption) return true;
  }

  // Catalog / metric near-miss walls: party rephrases must cancel (not re-ask number).
  // Example: “tata p&id” → wrong chips → user says “tata steels” / “tata steels P&ID”.
  if (act.kind === "metric" || act.kind === "generic") {
    const words = t.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) return true;
    if (
      looksLikeHardPartyOrProjectName(t) ||
      looksLikePartyOrProjectName(t) ||
      looksLikeSingleTokenPartyLabel(t)
    ) {
      return true;
    }
  }

  return false;
}

export function applyNovaClarifyMatchToDialogState(
  state: NovaDialogState,
  hit: NovaClarifyResolveHit
): NovaDialogState {
  const { option } = hit;
  const bound: NovaDialogBound = { ...state.bound };
  if (
    option.type === "customer" ||
    option.type === "vendor" ||
    option.type === "project"
  ) {
    bound.entityId = option.id;
    bound.entityType = option.type;
    bound.entityCode = option.code ?? undefined;
    bound.entityLabel = option.label;
  } else if (option.type === "staff") {
    bound.personUserId = option.id;
  }
  return {
    ...state,
    pendingClarify: null,
    bound,
    updatedAt: new Date().toISOString(),
  };
}

export function pushNovaClarifyAct(
  state: NovaDialogState,
  act: NovaClarifyAct
): NovaDialogState {
  return {
    ...state,
    pendingClarify: act,
    updatedAt: new Date().toISOString(),
  };
}

export function clearNovaPendingClarify(state: NovaDialogState): NovaDialogState {
  return {
    ...state,
    pendingClarify: null,
    updatedAt: new Date().toISOString(),
  };
}

/** Entity types that can be bound into tools without re-fuzzy. */
export function isNovaBindableEntityType(
  type: NovaClarifyOptionType
): type is "customer" | "vendor" | "project" {
  return type === "customer" || type === "vendor" || type === "project";
}
