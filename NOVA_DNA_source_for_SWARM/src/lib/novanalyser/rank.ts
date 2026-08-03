/**
 * NovANALYSER issue ranking — deterministic score formula v1.
 */
import type { NovAnalyserIssue, NovAnalyserIssueSeverity } from "@/lib/novanalyser/types";

const SEVERITY_WEIGHT: Record<NovAnalyserIssueSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const W_MONEY = 8;
const W_COUNT = 5;
const CORRELATION_BOOST = 15;

function log1p(n: number): number {
  return Math.log(1 + Math.max(0, n));
}

export function scoreNovAnalyserIssue(
  issue: NovAnalyserIssue,
  moneyVisible: boolean
): number {
  let score = SEVERITY_WEIGHT[issue.severity] * 100;
  if (moneyVisible && issue.financialExposureInr != null && issue.financialExposureInr > 0) {
    score += log1p(issue.financialExposureInr) * W_MONEY;
  }
  if (issue.countImpact != null && issue.countImpact > 0) {
    score += log1p(issue.countImpact) * W_COUNT;
  }
  if (issue.correlationRuleId) {
    score += CORRELATION_BOOST;
  }
  return Math.round(score * 100) / 100;
}

export function rankNovAnalyserIssues(
  issues: NovAnalyserIssue[],
  moneyVisible: boolean
): NovAnalyserIssue[] {
  return [...issues]
    .map((issue) => ({
      ...issue,
      score: scoreNovAnalyserIssue(issue, moneyVisible),
    }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}
