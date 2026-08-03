/**
 * NovANALYSER → NovaPlan follow-up — delegate to thin skills / domain Analysis (no re-fan-out).
 */
import type { NovaPlan } from "@/lib/ai/nova-plan";
import type { NovaLastNovAnalyserContext } from "@/lib/nova/dialog-state";

const ACTION_FOLLOW_UP_RE =
  /\b(what should i do|what to do|suggest actions?|next steps?|how do i fix|how can i fix|actions? for|tell me more|drill down|explain (?:that|this|the)|why (?:that|this)|show (?:me )?(?:more|details)|go deeper|what about)\b/i;

/** True when the utterance asks for drill-down / actions after a NovANALYSER turn. */
export function isNovAnalyserActionFollowUp(query: string): boolean {
  return ACTION_FOLLOW_UP_RE.test(query.trim().toLowerCase());
}

function matchIssueByQuery(
  query: string,
  ctx: NovaLastNovAnalyserContext
): NovaLastNovAnalyserContext["topIssues"][number] | null {
  const q = query.trim().toLowerCase();
  for (const issue of ctx.topIssues) {
    const title = issue.title.toLowerCase();
    if (q.includes(title) || title.split(/\s+/).some((w) => w.length > 4 && q.includes(w))) {
      return issue;
    }
  }
  return ctx.topIssues[0] ?? null;
}

/** Map contributor tool → domain Analysis cue (single-module deep dive). */
function analysisQueryForTool(toolId: string): string | null {
  if (/overdue|receivable|collection|receipt|sales|ar\b/i.test(toolId)) {
    return "why is outstanding high";
  }
  if (/project/i.test(toolId)) return "analyze this project";
  if (/task/i.test(toolId)) return "why are tasks overdue";
  if (/attendance|late/i.test(toolId)) return "attendance analysis";
  if (/kpi/i.test(toolId)) return "why is my kpi low";
  if (/approval/i.test(toolId)) return "why are approvals pending";
  if (/delivery|stock/i.test(toolId)) return "delivery analysis";
  return null;
}

/** Prefer nova_analysis for domain “why”; else first contributor summary skill. */
export function resolveNovAnalyserFollowUpPlan(
  query: string,
  ctx: NovaLastNovAnalyserContext
): NovaPlan | null {
  if (!isNovAnalyserActionFollowUp(query)) return null;

  const issue = matchIssueByQuery(query, ctx);
  if (!issue) return null;

  const contributor = issue.contributorTools[0];
  if (!contributor) return null;

  const analysisQ = analysisQueryForTool(contributor);
  if (analysisQ && /\b(why|explain|tell me more|drill|details|go deeper|what about)\b/i.test(query)) {
    return {
      query: analysisQ,
      module: "nova_analysis",
      tools: ["nova_analysis"],
      confidence: "high",
      interpretedAs: [`Analysis follow-up: ${issue.title}`],
      source: "follow_up",
    };
  }

  // Action / next-step follow-ups → thin contributor skill (not full NovANALYSER re-run).
  return {
    query: `${contributor.replace(/_/g, " ")} summary`,
    tools: [contributor],
    confidence: "high",
    interpretedAs: [`Action follow-up: ${issue.title}`],
    source: "follow_up",
  };
}
