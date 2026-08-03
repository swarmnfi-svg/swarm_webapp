/**
 * Shared factor schema for NOVA Analysis + KPI report-card.
 * Adapters emit factors from catalog skill facts / scorecard lines — never invent numbers.
 * Schema version is bumped only when fields break consumers.
 */

import type { NovaAnalysisDepth } from "@/lib/nova/analysis/depth";

export const NOVA_ANALYSIS_FACTOR_SCHEMA_VERSION = 1 as const;

export type NovaAnalysisDomain =
  | "kpi"
  | "tasks"
  | "outstanding"
  | "attendance"
  | "project"
  | "generic";

export type NovaAnalysisFactorPolarity = "helps" | "hurts" | "neutral" | "context";

/** One contributing driver — evidence must cite a catalog tool / scorecard line. */
export type NovaAnalysisFactor = {
  id: string;
  label: string;
  category?: string | null;
  /** Weight % (KPI) or relative importance hint */
  weight?: number | null;
  /** Weighted contribution to the headline (when known) */
  contribution?: number | null;
  actual?: number | null;
  target?: number | null;
  score?: number | null;
  polarity: NovaAnalysisFactorPolarity;
  /** Deterministic reason text — numbers only from this factor / evidence */
  reason: string;
  evidence: {
    toolId: string;
    summary: string;
    entityIds?: string[];
  };
  href?: string | null;
};

export type NovaAnalysisSubject = {
  kind: "person" | "project" | "customer" | "org" | "period" | "queue";
  id?: string | null;
  label: string;
};

export type NovaAnalysisPosition = {
  value: number | string | null;
  unit?: string | null;
  band?: string | null;
  /** low | mid | high | neutral — drives factor sort */
  stance?: "low" | "mid" | "high" | "neutral";
};

/**
 * Bundle handed to the Analysis engine.
 * KPI report-card UI should emit the same factor shape for NOVA consumption.
 * `depth` is universal: summary = top drivers; detail = per-factor contribution.
 */
export type NovaAnalysisBundle = {
  schemaVersion: typeof NOVA_ANALYSIS_FACTOR_SCHEMA_VERSION;
  domain: NovaAnalysisDomain;
  subject: NovaAnalysisSubject;
  headline: string;
  position: NovaAnalysisPosition;
  factors: NovaAnalysisFactor[];
  methodology?: string | null;
  links?: Array<{ title: string; href: string }>;
  /** Universal summary vs detail (defaults to summary in engine). */
  depth?: NovaAnalysisDepth;
  /** Optional period / source label shared across modules. */
  periodLabel?: string | null;
};

export type NovaAnalysisReason = {
  rank: number;
  factorId: string;
  label: string;
  polarity: NovaAnalysisFactorPolarity;
  reason: string;
  evidence: NovaAnalysisFactor["evidence"];
  confidence: "fact" | "supported_inference";
};

export type NovaAnalysisResult = {
  schemaVersion: typeof NOVA_ANALYSIS_FACTOR_SCHEMA_VERSION;
  domain: NovaAnalysisDomain;
  subject: NovaAnalysisSubject;
  headline: string;
  position: NovaAnalysisPosition;
  reasons: NovaAnalysisReason[];
  methodology?: string | null;
  /** Always filled — safe without LLM */
  deterministicNarrative: string;
  /** Optional polish; null when skipped / rate-limited / digit-guard fail */
  llmNarrative: string | null;
  narrativeSource: "deterministic" | "llm" | "llm_rate_limited" | "llm_rejected";
  findingsFormatted: string;
  links: Array<{ title: string; href: string }>;
};

export function isNovaAnalysisBundle(v: unknown): v is NovaAnalysisBundle {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    o.schemaVersion === NOVA_ANALYSIS_FACTOR_SCHEMA_VERSION &&
    typeof o.domain === "string" &&
    typeof o.headline === "string" &&
    Array.isArray(o.factors) &&
    o.subject != null &&
    typeof o.subject === "object"
  );
}
