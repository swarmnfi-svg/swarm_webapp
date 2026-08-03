/**
 * Lightweight QI miss-rate / wrong-scope telemetry (no ops dashboard).
 * Counters + crumb log for goldens / debug; wrong-scope target = 0 on P0 paths.
 */

export type QiOutcomeClass =
  | "ok_scoped"
  | "clarify_miss"
  | "wrong_scope"
  | "person_fallback"
  | "no_entity";

export type QiMetricCounters = {
  asksWithEntity: number;
  okScoped: number;
  clarifyMiss: number;
  wrongScope: number;
  personFallback: number;
};

export type QiCrumb = {
  at: string;
  query?: string;
  entitySpan: string | null;
  entityKindHint?: string | null;
  resolveKind?: string | null;
  scoped: boolean;
  outcome: QiOutcomeClass;
  tools?: string[];
};

const MAX_CRUMBS = 200;
let crumbs: QiCrumb[] = [];

export function emptyQiMetricCounters(): QiMetricCounters {
  return {
    asksWithEntity: 0,
    okScoped: 0,
    clarifyMiss: 0,
    wrongScope: 0,
    personFallback: 0,
  };
}

/**
 * Classify one ask after parse + resolve / gate.
 * wrong_scope = entitySpan present ∧ scoped tool ran without bind/person.
 */
export function classifyQiAskOutcome(opts: {
  entitySpan: string | null | undefined;
  toolsImplyScope: boolean;
  resolvedEntityId?: string | null;
  personHint?: string | null;
  clarified?: boolean;
}): QiOutcomeClass {
  const span = opts.entitySpan?.trim();
  if (!span) return "no_entity";
  if (opts.personHint?.trim()) return "person_fallback";
  if (opts.resolvedEntityId) return "ok_scoped";
  if (opts.clarified) return "clarify_miss";
  if (opts.toolsImplyScope) return "wrong_scope";
  return "clarify_miss";
}

export function bumpQiMetric(
  counters: QiMetricCounters,
  outcome: QiOutcomeClass
): QiMetricCounters {
  const next = { ...counters };
  if (outcome === "no_entity") return next;
  next.asksWithEntity += 1;
  if (outcome === "ok_scoped") next.okScoped += 1;
  else if (outcome === "clarify_miss") next.clarifyMiss += 1;
  else if (outcome === "wrong_scope") next.wrongScope += 1;
  else if (outcome === "person_fallback") next.personFallback += 1;
  return next;
}

/** not_found ∨ clarify without bind / asks with entitySpan */
export function qiMissRate(c: QiMetricCounters): number {
  if (c.asksWithEntity <= 0) return 0;
  return c.clarifyMiss / c.asksWithEntity;
}

/** entitySpan ∧ org-wide scoped skill / asks with entitySpan — target 0 */
export function qiWrongScopeRate(c: QiMetricCounters): number {
  if (c.asksWithEntity <= 0) return 0;
  return c.wrongScope / c.asksWithEntity;
}

export function recordQiCrumb(crumb: Omit<QiCrumb, "at"> & { at?: string }): void {
  crumbs.push({
    at: crumb.at ?? new Date().toISOString(),
    query: crumb.query,
    entitySpan: crumb.entitySpan,
    entityKindHint: crumb.entityKindHint ?? null,
    resolveKind: crumb.resolveKind ?? null,
    scoped: crumb.scoped,
    outcome: crumb.outcome,
    tools: crumb.tools,
  });
  if (crumbs.length > MAX_CRUMBS) {
    crumbs = crumbs.slice(-MAX_CRUMBS);
  }
}

export function getQiCrumbs(): readonly QiCrumb[] {
  return crumbs;
}

export function resetQiCrumbs(): void {
  crumbs = [];
}

/** Aggregate rates from recorded crumbs (tests / debug page). */
export function qiCountersFromCrumbs(
  list: readonly QiCrumb[] = crumbs
): QiMetricCounters {
  let c = emptyQiMetricCounters();
  for (const crumb of list) {
    c = bumpQiMetric(c, crumb.outcome);
  }
  return c;
}
