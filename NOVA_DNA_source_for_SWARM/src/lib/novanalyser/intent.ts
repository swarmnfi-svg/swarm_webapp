/**
 * NovANALYSER intent classification — rules-first (no LLM tool pick).
 */
import type { NovAnalyserIntent } from "@/lib/novanalyser/types";
import { isNovaAnalysisCue } from "@/lib/nova/analysis/domain";

export type NovAnalyserIntentHit = {
  intent: NovAnalyserIntent;
  confidence: "high" | "medium" | "low";
};

/** Global feature flag — set NOVA_NOVANALYSER_ENABLED=1 for all NOVA surfaces (bubble, /ai-assistant, /nova/chat, BPG + SaaS). */
export function isNovAnalyserEnabled(): boolean {
  const v = process.env.NOVA_NOVANALYSER_ENABLED;
  return v === "1" || v === "true";
}

export function isNovAnalyserCue(query: string): boolean {
  if (!isNovAnalyserEnabled()) return false;
  const hit = classifyNovAnalyserIntent(query);
  return hit.intent !== "unknown" && hit.confidence !== "low";
}

/**
 * Classify broad cross-module intents. Single-domain “why X” stays on nova_analysis.
 */
export function classifyNovAnalyserIntent(query: string): NovAnalyserIntentHit {
  const q = query.trim().toLowerCase();
  if (!q) return { intent: "unknown", confidence: "low" };

  // Domain-specific analysis cues delegate to nova_analysis — not NovANALYSER.
  if (isNovaAnalysisCue(query)) {
    return { intent: "unknown", confidence: "low" };
  }

  if (
    /\b(my\s+productivity|increase\s+my\s+productivity|boost\s+my\s+productivity|how\s+am\s+i\s+doing|how\s+am\s+i\s+performing|improve\s+my\s+performance|can\s+i\s+increase\s+my\s+productivity|my\s+performance|am\s+i\s+productive|personal\s+productivity)\b/i.test(
      q
    )
  ) {
    return { intent: "productivity_self", confidence: "high" };
  }

  if (
    /\b(team\s+productivity|team\s+performance|who\s+is\s+struggling|team\s+doing)\b/i.test(q)
  ) {
    return { intent: "productivity_team", confidence: "high" };
  }

  if (
    /\b(improve\s+(?:the\s+)?business|business\s+health|company\s+health|how\s+is\s+(?:the\s+)?business|how(?:'s|\s+is)\s+(?:the\s+)?company|what(?:'s|\s+is)\s+(?:wrong|hurting)|core\s+issues|how\s+can\s+i\s+improve\s+(?:the\s+)?business|business\s+overview|org\s+health|where\s+(?:are\s+we|is\s+the\s+business)\s+(?:weak|struggling))\b/i.test(
      q
    )
  ) {
    return { intent: "business_health", confidence: "high" };
  }

  if (/\b(novanalyser|nova\s+analyser|nova\s+analyzer)\b/i.test(q)) {
    return { intent: "business_health", confidence: "medium" };
  }

  if (/\b(delivery\s+risk|late\s+deliveries?\s+impact)\b/i.test(q)) {
    return { intent: "delivery_risk", confidence: "high" };
  }

  if (/\b(cash\s+flow|liquidity|collections?\s+problem)\b/i.test(q)) {
    return { intent: "cash_flow", confidence: "high" };
  }

  if (/\b(kpi\s+trends?|performance\s+trends?|are\s+kpis?\s+improving)\b/i.test(q)) {
    return { intent: "kpi_trends", confidence: "high" };
  }

  return { intent: "unknown", confidence: "low" };
}
