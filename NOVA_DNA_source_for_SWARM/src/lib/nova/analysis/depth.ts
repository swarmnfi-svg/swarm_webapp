/**
 * Universal Analysis depth — summary vs per-factor detail.
 * Shared by all modules (KPI, tasks, AR, attendance, project, …).
 */
export type NovaAnalysisDepth = "summary" | "detail";

/**
 * Infer depth from phrasing. Default is summary (intelligent why, top drivers).
 * Detail = how each parameter/factor contributes (weights, scores, contribution).
 */
export function inferNovaAnalysisDepth(query: string): NovaAnalysisDepth {
  const q = query.trim();
  if (!q) return "summary";
  if (
    /\b(in\s+detail|detailed|full\s+detail|how\s+each|each\s+parameter|each\s+factor|parameter(?:s)?\s+breakdown|factor(?:s)?\s+breakdown|explain\s+(?:each\s+)?metrics?|metric(?:s)?\s+by\s+metric|full\s+breakdown|all\s+parameters|all\s+factors|line[- ]by[- ]line|per[- ]metric|per[- ]parameter)\b/i.test(
      q
    )
  ) {
    return "detail";
  }
  return "summary";
}

/** @deprecated Prefer {@link inferNovaAnalysisDepth} */
export function inferKpiAnalysisDepth(query: string): NovaAnalysisDepth {
  return inferNovaAnalysisDepth(query);
}

/** How many ranked reasons to surface for this depth. */
export function novaAnalysisReasonLimit(depth: NovaAnalysisDepth): number {
  return depth === "detail" ? 24 : 8;
}
