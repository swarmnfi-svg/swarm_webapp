/**
 * Query depth picker — thin skill vs pack vs Analysis vs Trend.
 * Uses local cues only (no import of Analysis/Trend modules — avoid cycles).
 */

import {
  NOVA_DEPTH_ANALYSIS_CUE,
  NOVA_DEPTH_PACK_CUE,
  NOVA_DEPTH_TREND_CUE,
} from "@/lib/nova/query-structure/role-words";
import { isNonAttendanceLateContext } from "@/lib/nova/query-structure/late-context";

export type NovaQueryDepth = "thin" | "pack" | "analysis" | "trend";

/**
 * Pick depth from cues. Analysis “why/explain” before Trend frequency cues;
 * pack cues next; else thin.
 * `selectNovaTools` still defers to `isNovaAnalysisCue` / `isNovaTrendCue` for routing.
 */
export function pickNovaQueryDepth(query: string): NovaQueryDepth {
  const q = query.trim();
  if (!q) return "thin";
  // KPI report-card dumps stay thin/report skill — not Analysis depth
  if (/\b(kpi\s+report(?:\s+card)?|report\s*card\s+kpi|kpi\s+breakdown)\b/i.test(q)) {
    return "thin";
  }
  // Money/ops “why late payment|invoices|delivery” → thin (clarify / domain skills),
  // not Analysis. Plain “why sales” / “collections trend” keep normal depth.
  if (NOVA_DEPTH_ANALYSIS_CUE.test(q)) {
    if (/\blate\b/i.test(q) && isNonAttendanceLateContext(q)) {
      return "thin";
    }
    return "analysis";
  }
  if (NOVA_DEPTH_TREND_CUE.test(q)) return "trend";
  if (NOVA_DEPTH_PACK_CUE.test(q)) return "pack";
  return "thin";
}
