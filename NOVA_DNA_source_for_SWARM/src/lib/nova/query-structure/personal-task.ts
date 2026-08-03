/**
 * Personal-task + ranking cue helpers — restore person/ranking paths
 * after QI party-first gates (without undoing Avaada place framing).
 */

/** Org-wide task completion ranking (“who completed most tasks”). */
export function isNovaTaskCompletionRankingAsk(query: string): boolean {
  const q = query.trim().replace(/\s+/g, " ");
  if (!q) return false;
  if (
    /\bwho\s+(?:has\s+)?(?:completed|finished|did|does|completes|finishes)\s+(?:the\s+)?(?:most|more)(?:\s+(?:tasks?|todos?|kaam))?\b/i.test(
      q
    )
  ) {
    return true;
  }
  if (/\b(?:top|best)\s+(?:task\s+)?(?:completers?|finishers?)\b/i.test(q)) {
    return true;
  }
  return false;
}

/**
 * Spans that must never bind as party/project
 * (“completed most”, “arif is over due” leftovers, WH crumbs).
 */
export function isNovaRankingWhEntityNoise(span: string): boolean {
  const s = span.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s || s.length < 2) return true;
  if (/\b(who|whose|whom|what|which|when|where|why|how)\b/.test(s)) return true;
  if (
    /\b(completed?|completes?|finished?|finishes?|did|does|done)\s+(?:the\s+)?(most|more)\b/.test(
      s
    )
  ) {
    return true;
  }
  if (/\b(most|more)\b/.test(s) && !/\b(steels?|ltd|pvt|limited|corp|school|plant)\b/.test(s)) {
    return true;
  }
  // Grammar leftovers glued onto a person name
  if (/\b(is|are|was|were)\b/.test(s)) return true;
  if (/\bover\s*due\b|\boverdue\b|\bpending\b|\bopen\b/.test(s) && /\b(is|are|was|were)\b/.test(s)) {
    return true;
  }
  return false;
}

/** Explicit place / project framing — keep party/project resolve. */
export function isNovaPlaceFramedTaskAsk(query: string): boolean {
  const q = query.trim().replace(/\s+/g, " ");
  if (/\b(?:tasks?|todos?|kaam)\s+(?:(?:pending|open|overdue)\s+)?(?:in|at|on|for\s+project)\b/i.test(q)) {
    return true;
  }
  if (
    /\b(?:pending|open|overdue)\s+(?:tasks?|todos?|kaam)\s+(?:in|at|on|for\s+project)\b/i.test(q)
  ) {
    return true;
  }
  if (/\b[A-Za-z].+\bprojects?\b.+\b(tasks?|todos?|kaam)\b/i.test(q)) return true;
  if (/\b(tasks?|todos?|kaam)\b.+\bprojects?\b/i.test(q) && /\bfor\s+project\b/i.test(q)) {
    return true;
  }
  return false;
}

/**
 * Soft personal-task utterance shapes (pending / open / overdue / for Name).
 * Place-framed party asks are excluded.
 * Bare “Name tasks” is NOT personal (party-first for Avaada / James School).
 */
export function isNovaPersonalTaskAskShape(query: string): boolean {
  const q = query.trim().replace(/\s+/g, " ");
  if (!q || isNovaPlaceFramedTaskAsk(q) || isNovaTaskCompletionRankingAsk(q)) return false;
  // Leading “Name pending|open|overdue tasks” (+ optional show/list/give me)
  if (
    /^(?:(?:show|list|get|check|find|fetch|display|give)(?:\s+me)?\s+)?[A-Za-z][A-Za-z0-9'.\-]{1,40}(?:\s+[A-Za-z][A-Za-z0-9'.\-]{1,30}){0,3}(?:'s|’s)?\s+(?:pending|open|overdue)\s+(?:tasks?|todos?)\s*$/i.test(
      q
    )
  ) {
    return true;
  }
  // “does Arif have overdue tasks” / “are there pending tasks for Arif”
  if (
    /^(?:does|did|do)\s+[A-Za-z][A-Za-z0-9'.\-]{1,40}(?:\s+[A-Za-z][A-Za-z0-9'.\-]{1,30}){0,2}\s+have\s+(?:any\s+)?(?:pending|open|overdue)\s+(?:tasks?|todos?)\s*$/i.test(
      q
    )
  ) {
    return true;
  }
  if (
    /^are\s+there\s+(?:any\s+)?(?:pending|open|overdue)\s+(?:tasks?|todos?)\s+for\s+[A-Za-z]/i.test(q)
  ) {
    return true;
  }
  if (
    /^(?:(?:which|what)\s+)?(?:tasks?|todos?)\s+for\s+[A-Za-z][A-Za-z0-9'.\-]{1,40}(?:\s+[A-Za-z][A-Za-z0-9'.\-]{1,30}){0,3}(?:\s+(?:is|are|was|were))?(?:\s+(?:over\s*due|overdue|pending|open))?\s*$/i.test(
      q
    )
  ) {
    return true;
  }
  if (
    /^(?:pending|open|overdue)\s+(?:tasks?|todos?)\s+(?:for|of|assigned\s+to)\s+[A-Za-z]/i.test(q)
  ) {
    return true;
  }
  // Bare status + for Name (no “tasks” cue) — “pending for Arif” / “open for Arif”.
  // Overdue omitted: “overdue for X” stays finance (overdue invoices).
  // Approvals / payments / invoices never count as personal tasks.
  if (
    !/\b(approvals?|payments?|invoices?|bills?|orders?|receipts?|workflow)\b/i.test(q) &&
    /^(?:(?:show|list|get|check|find|fetch|display|give)(?:\s+me)?\s+)?(?:pending|open)\s+for\s+[A-Za-z][A-Za-z0-9'.\-]{1,40}(?:\s+[A-Za-z][A-Za-z0-9'.\-]{1,30}){0,3}\s*$/i.test(
      q
    )
  ) {
    return true;
  }
  // Hinglish: “Arif ka pending tasks” (status required — bare “avaada ka task” stays party)
  if (
    /^[A-Za-z][A-Za-z0-9'.\-]{1,40}(?:\s+[A-Za-z][A-Za-z0-9'.\-]{1,30}){0,2}\s+(?:ka|ki|ke)\s+(?:pending|open|overdue)\s+(?:tasks?|todos?|kaam)\s*$/i.test(
      q
    )
  ) {
    return true;
  }
  // Hinglish status-only: “Arif ka pending” → personal tasks (not bare entity search).
  // Still requires status; bare “Avaada ka” / “Name ka task” stay party-first.
  if (
    !/\b(approvals?|payments?|invoices?|bills?|orders?|receipts?|workflow|os|outstanding|dues?)\b/i.test(
      q
    ) &&
    /^[A-Za-z][A-Za-z0-9'.\-]{1,40}(?:\s+[A-Za-z][A-Za-z0-9'.\-]{1,30}){0,2}\s+(?:ka|ki|ke)\s+(?:pending|open|overdue)\s*$/i.test(
      q
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Leading “Name pending|open|overdue tasks” — prefer staff before party
 * (avoids tenant collision where a customer “Arif” steals staff).
 * Bare “Name tasks” stays party-first (Avaada).
 */
export function isNovaLeadingPersonFocusTaskAsk(query: string): boolean {
  const q = query.trim().replace(/\s+/g, " ");
  if (!q || isNovaPlaceFramedTaskAsk(q)) return false;
  // “does X have overdue tasks” / hinglish ka|ke owned by personal shapes
  if (/^(?:does|did|do)\b/i.test(q)) return false;
  if (/\b(?:ka|ki|ke)\b/i.test(q)) return false;
  return /^(?:(?:show|list|get|check|find|fetch|display|give)(?:\s+me)?\s+)?[A-Za-z][A-Za-z0-9'.\-]{1,40}(?:\s+[A-Za-z][A-Za-z0-9'.\-]{1,30}){0,3}(?:'s|’s)?\s+(?:pending|open|overdue)\s+(?:tasks?|todos?)\s*$/i.test(
    q
  );
}

/**
 * Eligible for person_fallback after party resolve miss
 * (broader than bare “Name tasks”).
 */
export function isNovaPersonTaskFallbackAsk(query: string, entitySpan?: string | null): boolean {
  if (isNovaPlaceFramedTaskAsk(query)) return false;
  if (isNovaTaskCompletionRankingAsk(query)) return false;
  if (isNovaPersonalTaskAskShape(query)) return true;
  const q = query.trim().replace(/\s+/g, " ");
  // Bare single-token “aalok tasks” — party first; staff demotion only after miss
  if (/^[A-Za-z][A-Za-z0-9'.\-]{1,40}\s+(?:tasks?|todos?|kaam)\s*$/i.test(q)) {
    return true;
  }
  const span = (entitySpan ?? "").trim();
  if (!span || looksLikeMultiWordParty(span)) return false;
  // Soft single-token party miss on a tasks ask → staff demotion
  return (
    /\b(tasks?|todos?|kaam)\b/i.test(query) &&
    /^[A-Za-z][A-Za-z0-9&.-]{1,40}$/.test(span) &&
    !isNovaRankingWhEntityNoise(span)
  );
}

function looksLikeMultiWordParty(span: string): boolean {
  const words = span.trim().split(/\s+/).filter(Boolean);
  return words.length >= 2;
}

/** Strip overdue / pending / is-are grammar glued onto a for-of span. */
export function scrubPersonalTaskEntityTail(span: string): string {
  let s = span.trim().replace(/\s+/g, " ");
  s = s.replace(/\s+(?:is|are|was|were)\s+(?:over\s*due|overdue|pending|open|late)\b.*$/i, "");
  s = s.replace(/\s+(?:over\s*due|overdue|pending|open|late)\s*$/i, "");
  s = s.replace(/\s+(?:is|are|was|were)\s*$/i, "");
  return s.trim();
}
