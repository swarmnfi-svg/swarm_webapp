/**
 * NovaFinding v1 — structured explanation; confidence never invented by LLM.
 * Phase G: prediction only via buildNovaPredictionFinding (labeled, never ledger truth).
 */
export type NovaFindingConfidence = "fact" | "supported_inference" | "prediction";

export type NovaFinding = {
  observation: string;
  evidence: Array<{ toolId: string; entityIds?: string[]; summary: string }>;
  contributors: Array<{ toolId: string; role: string }>;
  impact?: string;
  recommendation?: { label: string; href: string };
  confidence: NovaFindingConfidence;
  /** Phase G — feature list shown for predictions */
  features?: string[];
  /** Phase G — model/heuristic id (not a money claim) */
  estimateLabel?: string;
};

export function buildNovaFinding(input: {
  observation: string;
  evidence: NovaFinding["evidence"];
  contributors: NovaFinding["contributors"];
  impact?: string;
  recommendation?: NovaFinding["recommendation"];
  confidence: Exclude<NovaFindingConfidence, "prediction"> | NovaFindingConfidence;
}): NovaFinding {
  if (input.confidence === "prediction") {
    throw new Error("use buildNovaPredictionFinding for prediction confidence");
  }
  if (!input.evidence.length) {
    throw new Error("NovaFinding requires evidence");
  }
  if (!input.contributors.length) {
    throw new Error("NovaFinding requires contributors");
  }
  return {
    observation: input.observation,
    evidence: input.evidence,
    contributors: input.contributors,
    impact: input.impact,
    recommendation: input.recommendation,
    confidence: input.confidence,
  };
}

/**
 * Phase G — labeled prediction only. Never treat as ledger/money fact.
 * Requires explicit features + estimate label; confidence is always "prediction".
 */
export function buildNovaPredictionFinding(input: {
  observation: string;
  evidence: NovaFinding["evidence"];
  contributors: NovaFinding["contributors"];
  features: string[];
  estimateLabel: string;
  impact?: string;
  recommendation?: NovaFinding["recommendation"];
}): NovaFinding {
  if (!input.evidence.length) throw new Error("NovaFinding requires evidence");
  if (!input.contributors.length) throw new Error("NovaFinding requires contributors");
  if (!input.features.length) throw new Error("Prediction requires feature list");
  if (!input.estimateLabel.trim()) throw new Error("Prediction requires estimateLabel");
  return {
    observation: input.observation,
    evidence: input.evidence,
    contributors: input.contributors,
    impact: input.impact,
    recommendation: input.recommendation,
    confidence: "prediction",
    features: [...input.features],
    estimateLabel: input.estimateLabel.trim(),
  };
}

export function formatNovaFindings(findings: NovaFinding[]): string {
  if (!findings.length) return "";
  const lines: string[] = ["**Findings**"];
  for (const f of findings) {
    const conf =
      f.confidence === "fact"
        ? "fact"
        : f.confidence === "supported_inference"
          ? "supported inference"
          : "prediction — not ledger truth";
    lines.push(`- ${f.observation} _(${conf})_`);
    if (f.confidence === "prediction" && f.estimateLabel) {
      lines.push(`  - Estimate: ${f.estimateLabel}`);
    }
    if (f.features?.length) {
      lines.push(`  - Features: ${f.features.slice(0, 6).join("; ")}`);
    }
    for (const e of f.evidence.slice(0, 4)) {
      lines.push(`  - ${e.toolId}: ${e.summary}`);
    }
    if (f.recommendation) {
      lines.push(`  - Next: [${f.recommendation.label}](${f.recommendation.href})`);
    }
  }
  return lines.join("\n");
}

/** Guard: money answers must not treat prediction findings as fact totals. */
export function novaFindingsForbidPredictionAsMoney(findings: NovaFinding[]): boolean {
  return findings.every((f) => f.confidence !== "prediction" || Boolean(f.estimateLabel));
}
