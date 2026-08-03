/**
 * NovANALYSER orchestrator — intent → plan → fan-out → correlate → rank → narrative.
 */
import { canViewOrgFinanceAggregates } from "@/lib/rbac";
import { novaCanRunTool } from "@/lib/ai/nova-suggest";
import { novaDayBoundsFor } from "@/lib/ai/nova-dates";
import type { NovaSkillHandlerContext } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";
import {
  mapWithConcurrency,
  DAILY_BRIEF_FANOUT_CONCURRENCY,
} from "@/lib/nova/skills/ops/daily-brief";
import { classifyNovAnalyserIntent } from "@/lib/novanalyser/intent";
import { resolveNovAnalyserProfile } from "@/lib/novanalyser/profile";
import { buildNovAnalyserPlan } from "@/lib/novanalyser/plan-registry";
import { normalizeSkillFactToMetrics } from "@/lib/novanalyser/normalize";
import { buildNovAnalyserIssues } from "@/lib/novanalyser/correlate";
import { rankNovAnalyserIssues } from "@/lib/novanalyser/rank";
import { composeNovAnalyserResult } from "@/lib/novanalyser/format";
import type { NovAnalyserResult } from "@/lib/novanalyser/types";

export const NOVANALYSER_FANOUT_CONCURRENCY = DAILY_BRIEF_FANOUT_CONCURRENCY;

export async function runNovAnalyser(ctx: NovaSkillHandlerContext): Promise<NovAnalyserResult> {
  const { intent: classified } = classifyNovAnalyserIntent(ctx.query);
  const intent = classified === "unknown" ? "business_health" : classified;
  const profile = resolveNovAnalyserProfile(ctx.user, intent);

  const periodBounds = ctx.range ?? (() => {
    const { start, end } = novaDayBoundsFor(new Date(), ctx.tz);
    return { from: start, to: end, label: "current period" };
  })();

  const plan =
    buildNovAnalyserPlan({
      user: ctx.user,
      intent,
      profile,
      periodLabel: periodBounds.label,
    }) ??
    ({
      planId: "unsupported_v0",
      profile,
      intent,
      steps: [],
      permissionsRequired: ["ai.assistant.read"],
      skippedModules: [{ moduleId: intent, reason: "disabled" }],
      periodLabel: periodBounds.label,
    } as const);

  const moneyVisible = canViewOrgFinanceAggregates(ctx.user);
  const { dispatchNovaSkill, hasNovaSkill } = await import("@/lib/nova/skills/registry");

  const subCtx: NovaSkillHandlerContext = {
    ...ctx,
    range: periodBounds,
    personHint: intent === "productivity_self" ? null : ctx.personHint,
    entityHint: null,
    entityFilterName: undefined,
    resolvedEntityType: null,
    resolvedEntityDbId: null,
  };

  // Fan-out only skills the caller can run — never rely on plan build or handler deny alone.
  const runnableSteps = plan.steps.filter(
    (s) => hasNovaSkill(s.toolId) && novaCanRunTool(ctx.user, s.toolId)
  );
  let fetchFailures = 0;

  type FetchRow = {
    toolId: string;
    moduleId: string;
    metrics: ReturnType<typeof normalizeSkillFactToMetrics>;
    links: NovaToolLink[];
  };

  const rows =
    runnableSteps.length === 0
      ? ([] as Array<FetchRow | null>)
      : await mapWithConcurrency(
          runnableSteps,
          NOVANALYSER_FANOUT_CONCURRENCY,
          async (step): Promise<FetchRow | null> => {
            try {
              const result = await dispatchNovaSkill(step.toolId, subCtx);
              if (!result || result.fact.denied || !result.fact.ok) {
                return null;
              }
              return {
                toolId: step.toolId,
                moduleId: step.moduleId,
                metrics: normalizeSkillFactToMetrics(step.toolId, result.fact, step.moduleId),
                links: result.links ?? [],
              };
            } catch {
              fetchFailures += 1;
              return null;
            }
          }
        );

  const metrics = rows.flatMap((r) => (r ? r.metrics : []));
  const rawIssues = buildNovAnalyserIssues(metrics);
  const issues = rankNovAnalyserIssues(rawIssues, moneyVisible);

  const composed = composeNovAnalyserResult({
    planId: plan.planId,
    intent: plan.intent,
    profile: plan.profile,
    issues,
    metrics,
    skippedModules: plan.skippedModules,
    completeness:
      runnableSteps.length === 0 || fetchFailures > 0 || plan.skippedModules.length > 0
        ? "partial"
        : "full",
    runnableStepCount: runnableSteps.length,
  });

  return {
    planId: plan.planId,
    intent: plan.intent,
    profile: plan.profile,
    issues,
    metrics,
    skippedModules: plan.skippedModules,
    completeness:
      runnableSteps.length === 0 || fetchFailures > 0 || plan.skippedModules.length > 0
        ? "partial"
        : "full",
    ...composed,
  };
}

export type NovAnalyserRunWithLinks = NovAnalyserResult & { links: NovaToolLink[] };

export async function runNovAnalyserWithLinks(
  ctx: NovaSkillHandlerContext
): Promise<{ result: NovAnalyserResult; links: NovaToolLink[] }> {
  const result = await runNovAnalyser(ctx);
  const links: NovaToolLink[] = [];
  const seen = new Set<string>();
  for (const issue of result.issues.slice(0, 5)) {
    for (const rec of issue.recommendations) {
      if (seen.has(rec.href)) continue;
      seen.add(rec.href);
      links.push({ title: rec.label, href: rec.href });
    }
  }
  return { result, links };
}
