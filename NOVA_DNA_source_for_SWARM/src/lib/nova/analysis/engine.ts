/**
 * NOVA Analysis engine — fact pack (deterministic) + LLM reasoning narration.
 * Parallel to Search/Chat: catalog skills supply numbers; LLM synthesizes why.
 * Never invents numbers; RBAC is enforced by adapters before this runs.
 */
import {
  buildNovaFinding,
  formatNovaFindings,
  type NovaFinding,
} from "@/lib/nova/recipes/finding";
import type {
  NovaAnalysisBundle,
  NovaAnalysisFactor,
  NovaAnalysisReason,
  NovaAnalysisResult,
} from "@/lib/nova/analysis/factor-schema";
import { NOVA_ANALYSIS_FACTOR_SCHEMA_VERSION } from "@/lib/nova/analysis/factor-schema";
import { formatNovaAnalysisDeterministic } from "@/lib/nova/analysis/format";
import {
  maybeNarrateNovaAnalysis,
  type NovaAnalysisLlmPayload,
} from "@/lib/nova/analysis/narrate";
import { novaAnalysisReasonLimit } from "@/lib/nova/analysis/depth";

function polarityRank(p: NovaAnalysisFactor["polarity"], stance: string): number {
  if (stance === "low") {
    if (p === "hurts") return 0;
    if (p === "neutral") return 1;
    if (p === "helps") return 2;
    return 3;
  }
  if (stance === "high") {
    if (p === "helps") return 0;
    if (p === "neutral") return 1;
    if (p === "hurts") return 2;
    return 3;
  }
  if (p === "hurts") return 0;
  if (p === "helps") return 1;
  if (p === "neutral") return 2;
  return 3;
}

function contributionAbs(f: NovaAnalysisFactor): number {
  if (f.contribution != null && Number.isFinite(f.contribution)) {
    return Math.abs(f.contribution);
  }
  if (f.score != null && Number.isFinite(f.score)) return Math.abs(100 - f.score);
  if (f.weight != null && Number.isFinite(f.weight)) return Math.abs(f.weight);
  return 0;
}

/** Rank factors for “why is it here” — never drops evidence, only orders. */
export function rankNovaAnalysisFactors(
  factors: NovaAnalysisFactor[],
  stance: NovaAnalysisBundle["position"]["stance"] = "neutral"
): NovaAnalysisFactor[] {
  const s = stance ?? "neutral";
  return [...factors].sort((a, b) => {
    const pr = polarityRank(a.polarity, s) - polarityRank(b.polarity, s);
    if (pr !== 0) return pr;
    return contributionAbs(b) - contributionAbs(a);
  });
}

export function buildNovaAnalysisReasons(
  factors: NovaAnalysisFactor[],
  stance: NovaAnalysisBundle["position"]["stance"] = "neutral",
  limit = 8
): NovaAnalysisReason[] {
  return rankNovaAnalysisFactors(factors, stance)
    .slice(0, limit)
    .map((f, i) => ({
      rank: i + 1,
      factorId: f.id,
      label: f.label,
      polarity: f.polarity,
      reason: f.reason,
      evidence: f.evidence,
      confidence: "fact" as const,
    }));
}

export function reasonsToFindings(reasons: NovaAnalysisReason[]): NovaFinding[] {
  return reasons.map((r) =>
    buildNovaFinding({
      observation: `${r.label}: ${r.reason}`,
      evidence: [r.evidence],
      contributors: [{ toolId: r.evidence.toolId, role: "source" }],
      confidence: r.confidence,
    })
  );
}

export type RunNovaAnalysisOpts = {
  /**
   * Attempt LLM reasoning narration (default **true**).
   * Set false / NOVA_ANALYSIS_LLM=0 for facts-only.
   */
  useLlm?: boolean;
  maxReasons?: number;
  audience?: "director" | "staff" | "manager";
};

export type NovaAnalysisEngineResult = NovaAnalysisResult & {
  llmPayload: NovaAnalysisLlmPayload | null;
};

/**
 * Core engine: bundle → ranked reasons + LLM synthesis (+ deterministic fallback).
 * Callers must pass already-RBAC-filtered fact packs only.
 */
export async function runNovaAnalysis(
  bundle: NovaAnalysisBundle,
  opts: RunNovaAnalysisOpts = {}
): Promise<NovaAnalysisEngineResult> {
  const depth = bundle.depth === "detail" ? "detail" : "summary";
  const reasons = buildNovaAnalysisReasons(
    bundle.factors,
    bundle.position.stance,
    opts.maxReasons ?? novaAnalysisReasonLimit(depth)
  );
  const findings = reasonsToFindings(reasons);
  const findingsFormatted = formatNovaFindings(findings);
  const deterministicNarrative = formatNovaAnalysisDeterministic(bundle, reasons);

  const envOff = process.env.NOVA_ANALYSIS_LLM === "0";
  const useLlm = opts.useLlm !== false && !envOff && reasons.length > 0;

  let llmNarrative: string | null = null;
  let llmPayload: NovaAnalysisLlmPayload | null = null;
  let narrativeSource: NovaAnalysisResult["narrativeSource"] = "deterministic";

  if (useLlm) {
    const narrated = await maybeNarrateNovaAnalysis(
      bundle,
      reasons,
      deterministicNarrative,
      { audience: opts.audience }
    );
    llmNarrative = narrated.text;
    llmPayload = narrated.payload;
    narrativeSource = narrated.source;
  }

  return {
    schemaVersion: NOVA_ANALYSIS_FACTOR_SCHEMA_VERSION,
    domain: bundle.domain,
    subject: bundle.subject,
    headline: bundle.headline,
    position: bundle.position,
    reasons,
    methodology: bundle.methodology ?? null,
    deterministicNarrative,
    llmNarrative,
    llmPayload,
    narrativeSource,
    findingsFormatted,
    links: bundle.links ?? [],
  };
}
