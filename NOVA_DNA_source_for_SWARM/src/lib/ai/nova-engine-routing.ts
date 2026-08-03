/**
 * Shared meta-engine routing for NOVA — single priority order for NovaPlan + selectNovaTools.
 *
 * Order (after entity360 / recipes in selectNovaTools):
 *   novanalyser → nova_analysis → nova_trend → proactive_insights
 *
 * NovANALYSER owns internal fan-out; outer pipeline runs exactly one catalog tool.
 */
import type { NovaTopicId } from "@/lib/ai/nova-lexicon";
import { isNovaAnalysisCue, isNonAttendanceLateContext } from "@/lib/nova/analysis/domain";
import { pickNovaQueryDepth } from "@/lib/nova/query-structure";
import { isNovAnalyserCue } from "@/lib/novanalyser/intent";
import { isNovaTrendCue } from "@/lib/nova/trend/domain";

export type NovaMetaEngineRoute = {
  tools: string[];
  module: NovaTopicId;
  interpretedAs: string[];
};

const PROACTIVE_INSIGHTS_RE =
  /\b(proactive\s+insights?|insight\s+cards?|what\s+needs\s+attention|attention\s+queue|needs\s+attention|exceptions?\s+queue)\b/i;

/** Meta-engine resolution — null when no engine cue matches. */
export function resolveNovaMetaEngineRoute(query: string): NovaMetaEngineRoute | null {
  const q = query.trim();
  if (!q) return null;

  if (isNovAnalyserCue(q)) {
    return {
      tools: ["novanalyser"],
      module: "novanalyser",
      interpretedAs: ["NovANALYSER cross-module analysis"],
    };
  }

  const depth = pickNovaQueryDepth(q);
  if (
    isNovaAnalysisCue(q) ||
    (depth === "analysis" &&
      !(/\b(?:late|delay|delayed)\b/i.test(q) && isNonAttendanceLateContext(q)))
  ) {
    return {
      tools: ["nova_analysis"],
      module: "nova_analysis",
      interpretedAs: ["NOVA Analysis"],
    };
  }

  if (isNovaTrendCue(q) || depth === "trend") {
    return {
      tools: ["nova_trend"],
      module: "nova_trend",
      interpretedAs: ["NOVA Trend"],
    };
  }

  if (PROACTIVE_INSIGHTS_RE.test(q)) {
    return {
      tools: ["proactive_insights"],
      module: "proactive_insights" as NovaTopicId,
      interpretedAs: ["proactive insights"],
    };
  }

  return null;
}

/** Tool ids only — convenience for selectNovaTools. */
export function resolveNovaMetaEngineTools(query: string): string[] | null {
  const route = resolveNovaMetaEngineRoute(query);
  return route ? route.tools : null;
}
