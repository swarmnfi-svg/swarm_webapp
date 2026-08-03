/**
 * NovANALYSER deterministic narrative + headline (no LLM required P0).
 */
import { formatNovaFindings } from "@/lib/nova/recipes/finding";
import type { NovAnalyserIntent, NovAnalyserIssue, NovAnalyserResult } from "@/lib/novanalyser/types";

export function buildNovAnalyserHeadline(
  intent: NovAnalyserIntent,
  issueCount: number
): string {
  if (issueCount === 0) {
    return intent === "productivity_self"
      ? "No productivity gaps flagged from your accessible data."
      : "No business health issues flagged from your accessible data.";
  }
  const noun = intent === "productivity_self" ? "productivity" : "business health";
  return `${issueCount} ${noun} area${issueCount === 1 ? "" : "s"} need attention`;
}

export function buildNovAnalyserNarrative(
  intent: NovAnalyserIntent,
  issues: NovAnalyserIssue[],
  skippedCount: number,
  opts?: { noRunnableModules?: boolean }
): string {
  const lines: string[] = [];
  const label =
    intent === "productivity_self" ? "**My productivity analysis**" : "**Business health analysis**";
  lines.push(label);

  if (opts?.noRunnableModules) {
    lines.push(
      intent === "business_health"
        ? "Org business-health modules are not available for your role. Try “can I increase my productivity?” for a self-scoped check, or ask a director/accountant for company-wide analysis."
        : "No productivity modules are available for your permissions."
    );
  } else if (issues.length === 0) {
    lines.push(
      "No ranked issues from the modules you can access. Data may be healthy or modules returned empty."
    );
  } else {
    // Group evidence by contributing module for clearer multi-module answers.
    for (const issue of issues.slice(0, 5)) {
      const tag =
        issue.confidence === "supported_inference" ? " _(may be related)_" : "";
      const rule =
        issue.correlationRuleId != null ? ` · ${issue.correlationRuleId}` : "";
      lines.push(
        `• **${issue.severity.toUpperCase()} — ${issue.title}:** ${issue.observation}${tag}${rule}`
      );
      for (const ev of issue.evidence.slice(0, 3)) {
        lines.push(`  – ${ev.toolId}: ${ev.summary}`);
      }
      const action = issue.recommendations[0];
      if (action) {
        lines.push(`  → ${action.label}`);
      }
    }
  }

  if (skippedCount > 0) {
    lines.push(
      `_${skippedCount} module(s) omitted — not permitted for your role (RBAC)._`
    );
  }

  lines.push("_Read-only analysis from certified NOVA skills — no ledger writes._");
  return lines.join("\n");
}

export function composeNovAnalyserResult(partial: {
  planId: string;
  intent: NovAnalyserIntent;
  profile: NovAnalyserResult["profile"];
  issues: NovAnalyserIssue[];
  metrics: NovAnalyserResult["metrics"];
  skippedModules: NovAnalyserResult["skippedModules"];
  completeness: NovAnalyserResult["completeness"];
  runnableStepCount?: number;
}): Pick<
  NovAnalyserResult,
  "headline" | "deterministicNarrative" | "findingsFormatted" | "saveReportStub"
> {
  const noRunnableModules = (partial.runnableStepCount ?? 0) === 0;
  const findingsFormatted = formatNovaFindings(partial.issues.map((i) => i.finding));
  return {
    headline: noRunnableModules
      ? partial.intent === "business_health"
        ? "Business health requires org-finance access"
        : "No accessible productivity modules"
      : buildNovAnalyserHeadline(partial.intent, partial.issues.length),
    deterministicNarrative: buildNovAnalyserNarrative(
      partial.intent,
      partial.issues,
      partial.skippedModules.length,
      { noRunnableModules }
    ),
    findingsFormatted,
    saveReportStub: {
      packId:
        partial.intent === "productivity_self"
          ? "novanalyser_productivity"
          : "novanalyser_business_health",
      note: "Saved NovANALYSER reports — planned P1 (NovaReport snapshot).",
    },
  };
}
