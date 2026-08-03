/**
 * First-class NOVA clarification cards (entity / person / metric / period).
 * Prefer selectable options over vague prose; never invent money totals.
 */

export type NovaClarifyOptionType =
  | "customer"
  | "vendor"
  | "project"
  | "staff"
  | "metric"
  | "period"
  | "other";

export type NovaClarifyOption = {
  n: number;
  id: string;
  label: string;
  type: NovaClarifyOptionType;
  code?: string | null;
  /** Preferred reply text (label or code) */
  reply: string;
};

export type NovaClarifyKind = "entity" | "person" | "metric" | "period" | "generic";

export type NovaClarifyCard = {
  kind: NovaClarifyKind;
  /** Opening line, e.g. Did you mean… */
  prompt: string;
  /** Original search hint when disambiguating a party/person */
  hint?: string;
  options: NovaClarifyOption[];
  footer?: string;
};

const TYPE_LABEL: Record<NovaClarifyOptionType, string> = {
  customer: "customer",
  vendor: "vendor",
  project: "project",
  staff: "staff",
  metric: "metric",
  period: "period",
  other: "match",
};

/** Build numbered options from candidate rows. */
export function toNovaClarifyOptions(
  candidates: {
    id: string;
    label: string;
    type: NovaClarifyOptionType;
    code?: string | null;
  }[]
): NovaClarifyOption[] {
  return candidates.slice(0, 8).map((c, i) => ({
    n: i + 1,
    id: c.id,
    label: c.label,
    type: c.type,
    code: c.code ?? null,
    reply: c.code?.trim() || c.label,
  }));
}

export function buildEntityClarifyCard(
  hint: string,
  candidates: {
    id: string;
    label: string;
    type: NovaClarifyOptionType;
    code?: string | null;
  }[]
): NovaClarifyCard {
  return {
    kind: "entity",
    prompt: `Did you mean one of these for “${hint}”?`,
    hint,
    options: toNovaClarifyOptions(candidates),
    footer: "Reply with the number (e.g. **1**) or the full name/code.",
  };
}

export function buildPersonClarifyCard(
  hint: string,
  candidates: {
    id: string;
    label: string;
    type: NovaClarifyOptionType;
    code?: string | null;
  }[]
): NovaClarifyCard {
  return {
    kind: "person",
    prompt: `Did you mean one of these people for “${hint}”?`,
    hint,
    options: toNovaClarifyOptions(candidates),
    footer: "Reply with the number (e.g. **1**) or the full name/staff code.",
  };
}

/** Default metric confirm chips (bare period / underspecified asks). */
export const NOVA_METRIC_CONFIRM_CHIPS: {
  id: string;
  label: string;
  type: NovaClarifyOptionType;
}[] = [
  { id: "sales", label: "sales", type: "metric" },
  { id: "receipts", label: "receipts", type: "metric" },
  { id: "late comers", label: "late comers", type: "metric" },
  { id: "tasks", label: "tasks", type: "metric" },
  { id: "deliveries", label: "deliveries", type: "metric" },
  { id: "payment requests", label: "payment requests", type: "metric" },
  { id: "expenses", label: "expenses", type: "metric" },
  { id: "salary", label: "salary", type: "metric" },
];

/** Default period confirm chips (bare late / attendance without day). */
export const NOVA_PERIOD_CONFIRM_CHIPS: {
  id: string;
  label: string;
  type: NovaClarifyOptionType;
}[] = [
  { id: "today", label: "today", type: "period" },
  { id: "this week", label: "this week", type: "period" },
  { id: "this month", label: "this month", type: "period" },
];

/** Pending-queue confirm chips (never silent money). */
export const NOVA_PENDING_CONFIRM_CHIPS: {
  id: string;
  label: string;
  type: NovaClarifyOptionType;
}[] = [
  { id: "approvals", label: "approvals", type: "other" },
  { id: "leave", label: "leave", type: "other" },
  { id: "tasks", label: "tasks", type: "metric" },
  { id: "payment requests", label: "payment requests", type: "metric" },
  { id: "advances", label: "advances", type: "other" },
  { id: "purchase bills", label: "purchase bills", type: "other" },
];

/** Bare party name — metric chips (not silent month sales). */
export const NOVA_ENTITY_METRIC_CONFIRM_CHIPS: {
  id: string;
  label: string;
  type: NovaClarifyOptionType;
}[] = [
  { id: "tasks", label: "tasks", type: "metric" },
  { id: "invoices", label: "invoices", type: "metric" },
  { id: "sales", label: "sales", type: "metric" },
  { id: "receipts", label: "receipts", type: "metric" },
  { id: "outstanding", label: "outstanding", type: "metric" },
  { id: "customer / project record", label: "customer / project record", type: "other" },
];

/** Vague finance report — pick a real pack/skill (never silent entity resolve). */
export const NOVA_FINANCE_REPORT_CONFIRM_CHIPS: {
  id: string;
  label: string;
  type: NovaClarifyOptionType;
}[] = [
  { id: "finance dashboard", label: "finance dashboard", type: "metric" },
  { id: "expenses", label: "expenses", type: "metric" },
  { id: "receipts", label: "receipts", type: "metric" },
  { id: "sales", label: "sales", type: "metric" },
  { id: "ERP reports", label: "ERP reports", type: "other" },
];

/** Finance report / finance overview → selectable real skills. */
export function buildFinanceReportClarifyCard(
  chips: {
    id: string;
    label: string;
    type: NovaClarifyOptionType;
  }[] = NOVA_FINANCE_REPORT_CONFIRM_CHIPS
): NovaClarifyCard {
  return {
    kind: "generic",
    prompt: "Which **finance** view should I pull?",
    hint: "finance report",
    options: toNovaClarifyOptions(chips),
    footer: "Reply with the number or the name — or try “expense report”, “today receipts”, “july sales”.",
  };
}

/** Actionable metric chips when the ask is underspecified (unclear / low confidence). */
export function buildGenericMetricClarifyCard(
  hint?: string,
  chips: {
    id: string;
    label: string;
    type: NovaClarifyOptionType;
  }[] = [
    { id: "sales", label: "sales", type: "metric" },
    { id: "receipts", label: "receipts", type: "metric" },
    { id: "late", label: "late comers", type: "metric" },
    { id: "tasks", label: "tasks", type: "metric" },
    { id: "expenses", label: "expenses", type: "metric" },
    { id: "salary", label: "salary", type: "metric" },
  ]
): NovaClarifyCard {
  const options = toNovaClarifyOptions(chips);
  return {
    kind: "generic",
    prompt: hint
      ? `I’m not sure what you meant by “${hint}”. Which of these?`
      : "I’m not sure what you meant. Which of these?",
    hint,
    options,
    footer: "Reply with the number or the metric name — or try “help”.",
  };
}

/** Bare period → selectable metric chips (never silent money pack). */
export function buildMetricClarifyCard(
  periodLabel: string,
  chips: {
    id: string;
    label: string;
    type: NovaClarifyOptionType;
  }[] = NOVA_METRIC_CONFIRM_CHIPS
): NovaClarifyCard {
  return {
    kind: "metric",
    prompt: `For **${periodLabel}**, which metric?`,
    hint: periodLabel,
    options: toNovaClarifyOptions(chips),
    footer: "Reply with the number or the metric name.",
  };
}

/** Bare late/absent/present / ambiguous money → selectable period chips. */
export function buildPeriodClarifyCard(
  focusLabel: string,
  chips: {
    id: string;
    label: string;
    type: NovaClarifyOptionType;
  }[] = NOVA_PERIOD_CONFIRM_CHIPS
): NovaClarifyCard {
  return {
    kind: "period",
    prompt: `For **${focusLabel}**, which period?`,
    hint: focusLabel,
    options: toNovaClarifyOptions(chips),
    footer: "Reply with the number or the period.",
  };
}

/** Bare “pending” → queue chips (open queues are a safe product default once chosen). */
export function buildPendingClarifyCard(
  chips: {
    id: string;
    label: string;
    type: NovaClarifyOptionType;
  }[] = NOVA_PENDING_CONFIRM_CHIPS
): NovaClarifyCard {
  return {
    kind: "generic",
    prompt: "Pending what?",
    options: toNovaClarifyOptions(chips),
    footer: "Reply with the number or the queue name.",
  };
}

/** Bare party name → metric / open-record chips. */
export function buildEntityMetricClarifyCard(
  hint: string,
  chips: {
    id: string;
    label: string;
    type: NovaClarifyOptionType;
  }[] = NOVA_ENTITY_METRIC_CONFIRM_CHIPS
): NovaClarifyCard {
  return {
    kind: "metric",
    prompt: `For **${hint}**, what should I look up?`,
    hint,
    options: toNovaClarifyOptions(chips),
    footer: "Reply with the number or the metric name.",
  };
}

/** Late payment vs late comers disambiguation chips. */
export function buildLateSenseClarifyCard(
  chips: {
    id: string;
    label: string;
    type: NovaClarifyOptionType;
  }[] = [
    { id: "late payment / fee", label: "late payment / fee", type: "other" },
    { id: "late comers (attendance)", label: "late comers (attendance)", type: "metric" },
  ]
): NovaClarifyCard {
  return {
    kind: "generic",
    prompt: "Did you mean one of these?",
    options: toNovaClarifyOptions(chips),
    footer: "Reply with the number or the full label.",
  };
}

/**
 * Unmatched / low-confidence → catalog near-miss chips (Phase D / Clarify).
 * Options are metric-typed so reply runs the phrase through the catalog — no Think invent.
 */
export function buildCatalogNearMissClarifyCard(
  hint: string,
  phrases: { id: string; label: string }[]
): NovaClarifyCard {
  const chips = phrases.slice(0, 6).map((p) => ({
    id: p.id,
    label: p.label,
    type: "metric" as NovaClarifyOptionType,
  }));
  return {
    kind: "generic",
    prompt: hint.trim()
      ? `Did you mean one of these for “${hint.trim().slice(0, 48)}”?`
      : "Did you mean one of these?",
    hint: hint.trim() || undefined,
    options: toNovaClarifyOptions(chips),
    footer: "Reply with the number or the phrase — or try **help**.",
  };
}

/** Structured clarify payload for NovaAnswer (answer text + selectable chips). */
export function novaClarifyAnswerPayload(card: NovaClarifyCard): {
  answer: string;
  options: NovaClarifyOption[];
  clarifyKind: NovaClarifyKind;
} {
  return {
    answer: formatNovaClarifyCard(card),
    options: card.options,
    clarifyKind: card.kind,
  };
}

/**
 * Prefer structured chips when clarifyReason is already a formatted card,
 * or rebuild from known prose patterns so replies stay selectable.
 */
export function novaClarifyPayloadFromReason(reason: string): {
  answer: string;
  options: NovaClarifyOption[];
  clarifyKind: NovaClarifyKind;
} | null {
  const t = reason.trim();
  if (!t) return null;

  const numbered = parseNovaClarifyOptionsFromAssistant(t);
  if (/^\s*\d+\.\s+\*\*/m.test(t) && numbered.length > 0) {
    const clarifyKind: NovaClarifyKind = /\bwhich period\b/i.test(t)
      ? "period"
      : /\bwhich metric\b|\bwhat should I look up\b/i.test(t)
        ? "metric"
        : /\bDid you mean one of these (people|for)\b/i.test(t)
          ? /\bpeople\b/i.test(t)
            ? "person"
            : "entity"
          : numbered.every((o) => o.type === "period")
            ? "period"
            : numbered.every((o) => o.type === "metric")
              ? "metric"
              : numbered.some((o) => o.type === "customer" || o.type === "vendor" || o.type === "project")
                ? "entity"
                : numbered.some((o) => o.type === "staff")
                  ? "person"
                  : "generic";
    return { answer: t, options: numbered, clarifyKind };
  }

  // Legacy prose with bold chips → rebuild as numbered confirm card
  const proseChips = numbered.length
    ? numbered
    : parseNovaClarifyOptionsFromAssistant(t);
  if (proseChips.length >= 2) {
    const kind: NovaClarifyKind = /\bwhich period\b/i.test(t)
      ? "period"
      : /\bwhich metric\b|what should I look up\b/i.test(t)
        ? "metric"
        : /\bpending what\b/i.test(t)
          ? "generic"
          : proseChips.every((o) => o.type === "period")
            ? "period"
            : proseChips.every((o) => o.type === "metric")
              ? "metric"
              : "generic";
    const prompt =
      t.split(/\n/)[0]?.replace(/\s*[—–-]\s*.*$/, "").replace(/\?\s*$/, "?").trim() ||
      (kind === "period" ? "Which period?" : kind === "metric" ? "Which metric?" : "Which of these?");
    const card: NovaClarifyCard = {
      kind,
      prompt: prompt.endsWith("?") ? prompt : `${prompt}?`,
      options: toNovaClarifyOptions(
        proseChips.map((o) => ({ id: o.id, label: o.label, type: o.type, code: o.code }))
      ),
      footer:
        kind === "period"
          ? "Reply with the number or the period."
          : "Reply with the number or the option name.",
    };
    return novaClarifyAnswerPayload(card);
  }

  return null;
}

export function formatNovaClarifyCard(card: NovaClarifyCard): string {
  const lines: string[] = [card.prompt, ""];
  for (const o of card.options) {
    const meta =
      o.type === "metric" || o.type === "period" || o.type === "other"
        ? ""
        : ` (${TYPE_LABEL[o.type]}${o.code ? ` · ${o.code}` : ""})`;
    lines.push(`${o.n}. **${o.label}**${meta}`);
  }
  if (card.footer) {
    lines.push("", card.footer);
  }
  return lines.join("\n");
}

/** Detect prior assistant clarify that listed selectable options. */
export function isNovaClarifyAssistantMessage(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/\bDid you mean\b/i.test(t) && /^\s*\d+\.\s+/m.test(t)) return true;
  if (/\bwhich of these\b/i.test(t) && /^\s*\d+\.\s+/m.test(t)) return true;
  if (/\bwhich (metric|period)\b/i.test(t) && /^\s*\d+\.\s+/m.test(t)) return true;
  if (/\bPending what\b/i.test(t) && /^\s*\d+\.\s+/m.test(t)) return true;
  if (/\bwhat should I look up\b/i.test(t) && /^\s*\d+\.\s+/m.test(t)) return true;
  if (/\bSeveral (matches|people)\b/i.test(t) && /^\s*\d+\.\s+/m.test(t)) return true;
  // Legacy prose clarify still allows name/code reply (no numbers)
  if (/\bDid you mean\b/i.test(t) || /\bSeveral (matches|people) match/i.test(t)) return true;
  if (/\bReply with the (number|full name|period|metric|queue|option)/i.test(t)) return true;
  return false;
}

/**
 * Parse numbered options from a prior assistant clarify message.
 * Supports both structured cards and bold-chip prose ("**sales**, **receipts**").
 */
export function parseNovaClarifyOptionsFromAssistant(text: string): NovaClarifyOption[] {
  const numbered: NovaClarifyOption[] = [];
  const lineRe =
    /^\s*(\d+)\.\s+\*\*([^*]+)\*\*(?:\s*\((customer|vendor|project|staff|metric|period|match)(?:\s*[·•]\s*([^)]+))?\))?/gim;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(text)) !== null) {
    const n = Number(m[1]);
    const label = m[2].trim();
    const typeRaw = (m[3] ?? "other").toLowerCase() as NovaClarifyOptionType;
    const code = m[4]?.trim() || null;
    const type: NovaClarifyOptionType =
      typeRaw === "customer" ||
      typeRaw === "vendor" ||
      typeRaw === "project" ||
      typeRaw === "staff" ||
      typeRaw === "metric" ||
      typeRaw === "period"
        ? typeRaw
        : "other";
    numbered.push({
      n,
      id: code || label,
      label,
      type,
      code,
      reply: code || label,
    });
  }
  if (numbered.length > 0) return numbered;

  // Prose chips: **sales**, **receipts**, **today**
  const chips: NovaClarifyOption[] = [];
  const chipRe = /\*\*([^*]+)\*\*/g;
  let c: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((c = chipRe.exec(text)) !== null) {
    const label = c[1].trim();
    if (!label || label.length > 48) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    // Skip the party name in “For **Acme**, what should I look up”
    if (/^for\b/i.test(text.slice(Math.max(0, c.index - 8), c.index))) continue;
    seen.add(key);
    const type: NovaClarifyOptionType = /\b(today|yesterday|week|month|fy|latest|pending)\b/i.test(
      label
    )
      ? "period"
      : /\b(sales|receipts|late|tasks|expenses|salary|outstanding|approvals|leave|customer|project)\b/i.test(
            label
          )
        ? "metric"
        : "other";
    chips.push({
      n: chips.length + 1,
      id: label,
      label,
      type,
      code: null,
      reply: label,
    });
  }
  return chips;
}

/** Match user reply “1”, “#2”, exact label, or code to a clarify option. */
export function matchNovaClarifySelection(
  query: string,
  options: NovaClarifyOption[]
): NovaClarifyOption | null {
  if (!options.length) return null;
  const t = query.trim().replace(/^#\s*/, "");
  if (!t) return null;

  const numOnly = t.match(/^(?:option\s+)?(\d{1,2})$/i);
  if (numOnly) {
    const n = Number(numOnly[1]);
    return options.find((o) => o.n === n) ?? null;
  }

  const lower = t.toLowerCase();
  const exact =
    options.find((o) => o.label.toLowerCase() === lower) ??
    options.find((o) => (o.code ?? "").toLowerCase() === lower) ??
    options.find((o) => o.reply.toLowerCase() === lower);
  if (exact) return exact;

  // Partial unique contains
  const contains = options.filter(
    (o) =>
      o.label.toLowerCase().includes(lower) ||
      (o.code && o.code.toLowerCase().includes(lower)) ||
      lower.includes(o.label.toLowerCase())
  );
  if (contains.length === 1) return contains[0];
  return null;
}

/**
 * True when the current short reply looks like a clarify pick
 * (digit or matching a prior option label).
 */
export function looksLikeNovaClarifyReply(query: string, priorAssistant: string): boolean {
  if (!priorAssistant || !isNovaClarifyAssistantMessage(priorAssistant)) return false;
  const t = query.trim();
  if (!t || t.length > 80) return false;
  if (/^(?:#\s*)?\d{1,2}$/.test(t) || /^option\s+\d{1,2}$/i.test(t)) return true;
  const opts = parseNovaClarifyOptionsFromAssistant(priorAssistant);
  return matchNovaClarifySelection(t, opts) != null;
}
